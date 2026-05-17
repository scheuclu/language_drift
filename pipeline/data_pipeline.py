import gzip
import json
from collections import Counter
from pathlib import Path

import numpy as np
from datasets import load_dataset
from tqdm import tqdm

from config import LANGUAGE_SCORE_THRESHOLD, TARGET_TOKENS_PER_YEAR, TOKENS_DIR
from pipeline.snapshot_registry import get_snapshots
from pipeline.tokenizer import tokenize


def stream_and_tokenize(year: int, output_dir: Path | None = None) -> None:
    output_dir = output_dir or TOKENS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    out_path = output_dir / f"{year}_tokenized.txt.gz"
    freq_path = output_dir / f"{year}_freqs.json"
    meta_path = output_dir / f"{year}_meta.json"
    checkpoint_path = output_dir / f"{year}_checkpoint.json"

    snapshots = get_snapshots(year)
    tokens_per_snapshot = TARGET_TOKENS_PER_YEAR // len(snapshots)

    completed_snapshots: list[str] = []
    total_tokens = 0
    total_docs = 0
    freq = Counter()

    if checkpoint_path.exists():
        with open(checkpoint_path) as f:
            checkpoint = json.load(f)
        completed_snapshots = checkpoint["completed_snapshots"]
        total_tokens = checkpoint["total_tokens"]
        total_docs = checkpoint["total_docs"]
        freq = Counter(checkpoint.get("freq_top", {}))
        print(f"Resuming year {year}: {len(completed_snapshots)}/{len(snapshots)} snapshots done, {total_tokens:,} tokens")

    mode = "ab" if completed_snapshots else "wb"

    with gzip.open(out_path, mode) as gz:
        for snapshot in snapshots:
            if snapshot in completed_snapshots:
                continue

            print(f"  Streaming {snapshot} (target: {tokens_per_snapshot:,} tokens)...")
            ds = load_dataset(
                "HuggingFaceFW/fineweb",
                name=snapshot,
                streaming=True,
                split="train",
            )
            filtered = ds.filter(
                lambda x: x["language_score"] >= LANGUAGE_SCORE_THRESHOLD
            )

            snapshot_tokens = 0
            for row in tqdm(filtered, desc=snapshot):
                tokens = tokenize(row["text"])
                if not tokens:
                    continue

                gz.write((" ".join(tokens) + "\n").encode())
                for t in tokens:
                    freq[t] += 1
                snapshot_tokens += len(tokens)
                total_docs += 1

                if snapshot_tokens >= tokens_per_snapshot:
                    break

            total_tokens += snapshot_tokens
            completed_snapshots.append(snapshot)

            top_freq = dict(freq.most_common(500_000))
            with open(checkpoint_path, "w") as f:
                json.dump({
                    "completed_snapshots": completed_snapshots,
                    "total_tokens": total_tokens,
                    "total_docs": total_docs,
                    "freq_top": top_freq,
                }, f)

            print(f"  {snapshot}: {snapshot_tokens:,} tokens, cumulative: {total_tokens:,}")

    with open(freq_path, "w") as f:
        json.dump(dict(freq), f)

    with open(meta_path, "w") as f:
        json.dump({
            "year": year,
            "snapshots": snapshots,
            "total_tokens": total_tokens,
            "total_docs": total_docs,
            "vocab_size_raw": len(freq),
        }, f, indent=2)

    if checkpoint_path.exists():
        checkpoint_path.unlink()

    print(f"Year {year} complete: {total_tokens:,} tokens, {total_docs:,} docs")


def encode_to_ids(year: int, vocab: dict[str, int], tokens_dir: Path | None = None) -> None:
    tokens_dir = tokens_dir or TOKENS_DIR
    gz_path = tokens_dir / f"{year}_tokenized.txt.gz"
    out_path = tokens_dir / f"{year}.npy"

    if not gz_path.exists():
        raise FileNotFoundError(f"Tokenized file not found: {gz_path}")

    unk_id = vocab.get("<UNK>", 0)
    all_ids: list[int] = []

    with gzip.open(gz_path, "rt") as f:
        for line in tqdm(f, desc=f"Encoding {year}"):
            tokens = line.strip().split()
            for token in tokens:
                all_ids.append(vocab.get(token, unk_id))

    arr = np.array(all_ids, dtype=np.int32)
    np.save(out_path, arr)
    print(f"Year {year}: encoded {len(arr):,} token IDs -> {out_path}")
