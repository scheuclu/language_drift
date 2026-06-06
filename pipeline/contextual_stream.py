"""Re-stream FineWeb and drive the contextual accumulator, per year.

Reuses the streaming + per-snapshot checkpoint contract of
`pipeline/data_pipeline.py`: each year is a set of `CC-MAIN-YYYY-WW` snapshots,
filtered to `language_score >= LANGUAGE_SCORE_THRESHOLD`, with the per-year
token target split evenly across snapshots. Unlike the Word2Vec path we use the
**raw** `row["text"]` (the encoder's own tokenizer handles it), slice it into
non-overlapping word windows, and aggregate on the fly -- nothing is written to
`data/tokens`.

Resumable: after each completed snapshot we atomically save the accumulator npz
and a checkpoint json. A relaunch loads the partial state and skips completed
snapshots, but only if the model/config hash matches (never mix configs).
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from datasets import load_dataset
from tqdm import tqdm

from config import (
    CONTEXTUAL_BATCH_SIZE,
    CONTEXTUAL_MAX_LEN,
    CONTEXTUAL_TARGET_TOKENS_PER_YEAR,
    LANGUAGE_SCORE_THRESHOLD,
)
from pipeline.contextual_aggregate import ContextualAccumulator
from pipeline.contextual_model import ContextualEncoder
from pipeline.snapshot_registry import get_snapshots


def text_to_windows(text: str, max_len: int = CONTEXTUAL_MAX_LEN) -> list[list[str]]:
    """Lowercase, whitespace-split, slice into non-overlapping word windows."""
    words = text.lower().split()
    return [words[i : i + max_len] for i in range(0, len(words), max_len) if words[i : i + max_len]]


def iter_snapshot_windows(snapshot: str, max_words: int, max_len: int):
    """Yield word-windows from one snapshot, stopping after ~max_words words."""
    ds = load_dataset("HuggingFaceFW/fineweb", name=snapshot, streaming=True, split="train")
    ds = ds.filter(lambda x: x["language_score"] >= LANGUAGE_SCORE_THRESHOLD)
    emitted = 0
    for row in ds:
        for win in text_to_windows(row["text"], max_len):
            yield win
            emitted += len(win)
        if emitted >= max_words:
            return


def run_year(
    year: int,
    encoder: ContextualEncoder,
    accumulator: ContextualAccumulator,
    *,
    state_dir: Path,
    config_hash: str,
    target_tokens: int = CONTEXTUAL_TARGET_TOKENS_PER_YEAR,
    batch_size: int = CONTEXTUAL_BATCH_SIZE,
    max_len: int = CONTEXTUAL_MAX_LEN,
    snapshots: list[str] | None = None,
    log_every_batches: int = 200,
) -> tuple[int, int]:
    """Stream a year into the accumulator. Returns (total_words, total_windows).

    Resumes from any partial state in `state_dir`. Checkpoints after each
    completed snapshot.
    """
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    snapshots = snapshots or get_snapshots(year)
    tokens_per_snapshot = target_tokens // len(snapshots)

    partial_path = state_dir / f"{year}.partial.npz"
    ckpt_path = state_dir / f"{year}_checkpoint.json"

    completed: list[str] = []
    total_words = 0
    total_windows = 0

    if ckpt_path.exists():
        with open(ckpt_path) as f:
            ckpt = json.load(f)
        if ckpt.get("config_hash") != config_hash:
            raise RuntimeError(
                f"Refusing to resume year {year}: checkpoint config_hash "
                f"{ckpt.get('config_hash')!r} != current {config_hash!r}. "
                f"Delete {ckpt_path} and {partial_path} to restart this year."
            )
        completed = ckpt["completed_snapshots"]
        total_words = ckpt["total_tokens"]
        total_windows = ckpt["total_windows"]
        if partial_path.exists():
            accumulator.load_state(partial_path)
        print(
            f"  [year {year}] resuming: {len(completed)}/{len(snapshots)} snapshots, "
            f"{total_words:,} words",
            flush=True,
        )

    def write_checkpoint() -> None:
        tmp = ckpt_path.with_suffix(".json.tmp")
        with open(tmp, "w") as f:
            json.dump(
                {
                    "completed_snapshots": completed,
                    "total_tokens": total_words,
                    "total_windows": total_windows,
                    "model": encoder.model_name,
                    "hidden_dim": encoder.hidden_dim,
                    "pooling": "first",
                    "max_len": max_len,
                    "config_hash": config_hash,
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                },
                f,
            )
        tmp.replace(ckpt_path)

    for snapshot in snapshots:
        if snapshot in completed:
            continue
        print(f"  [year {year}] {snapshot} (target {tokens_per_snapshot:,} words)...", flush=True)

        snapshot_words = 0
        n_batches = 0
        t0 = time.time()
        batch: list[list[str]] = []

        def flush() -> int:
            hidden, _attn, word_ids = encoder.encode_windows(batch)
            accumulator.add_batch(hidden, word_ids, batch)
            return len(batch)

        for win in iter_snapshot_windows(snapshot, tokens_per_snapshot, max_len):
            batch.append(win)
            snapshot_words += len(win)
            if len(batch) >= batch_size:
                total_windows += flush()
                n_batches += 1
                batch = []
                if n_batches % log_every_batches == 0:
                    wps = snapshot_words / max(1e-9, time.time() - t0)
                    print(
                        f"    {snapshot_words:,}/{tokens_per_snapshot:,} words "
                        f"({wps:,.0f} words/s)",
                        flush=True,
                    )
            if snapshot_words >= tokens_per_snapshot:
                break
        if batch:
            total_windows += flush()

        total_words += snapshot_words
        completed.append(snapshot)
        accumulator.save_state(partial_path)
        write_checkpoint()
        print(
            f"  [year {year}] {snapshot} done: {snapshot_words:,} words, "
            f"cumulative {total_words:,} ({time.time()-t0:.0f}s)",
            flush=True,
        )

    return total_words, total_windows
