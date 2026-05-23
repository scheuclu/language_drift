"""Precompute per-word aligned-embedding shards for the ternary tool.

Each output file is float32, shape [N_YEARS, 300], C-order. The web client
fetches /data/vecs/<word>.bin on demand to compute cosine similarities
client-side for arbitrary (target, anchor) pairs.

Uses the same eligible-word filter as precompute_web_data.py so search hits
in the UI map 1:1 to available vector files.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import ALIGNED_DIR, TOKENS_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab

MIN_FREQ_ANYWHERE = 3000
WORD_RE = re.compile(r"^[a-z]{2,20}$")
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "vecs"


def is_clean(word: str) -> bool:
    return bool(WORD_RE.match(word))


def main() -> None:
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    inv_vocab = {wid: w for w, wid in vocab.items()}
    vocab_size = len(vocab)
    print(f"vocab: {vocab_size:,}")

    print("loading per-year freq files...")
    freq_matrix = np.zeros((vocab_size, len(YEARS)), dtype=np.int64)
    for yi, year in enumerate(YEARS):
        with open(TOKENS_DIR / f"{year}_freqs.json") as f:
            fy = json.load(f)
        for w, wid in vocab.items():
            freq_matrix[wid, yi] = fy.get(w, 0)
    max_freq = freq_matrix.max(axis=1)

    eligible_ids = []
    for wid in range(vocab_size):
        if wid == 0:
            continue
        w = inv_vocab[wid]
        if not is_clean(w):
            continue
        if max_freq[wid] < MIN_FREQ_ANYWHERE:
            continue
        eligible_ids.append(wid)
    eligible_ids = np.array(eligible_ids, dtype=np.int64)
    print(f"eligible words: {len(eligible_ids):,}")

    print("loading aligned embeddings...")
    all_embeds = np.stack(
        [np.load(ALIGNED_DIR / f"{year}.npy") for year in YEARS]
    ).astype(np.float32)
    print(f"all_embeds shape: {all_embeds.shape}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    n_years, _, dim = all_embeds.shape
    print(f"writing {len(eligible_ids):,} per-word shards to {OUT_DIR}...")
    for i, wid in enumerate(eligible_ids.tolist()):
        w = inv_vocab[wid]
        # shape [n_years, dim], C-order, float32
        arr = all_embeds[:, wid, :].astype(np.float32, copy=False)
        arr.tofile(OUT_DIR / f"{w}.bin")
        if (i + 1) % 2000 == 0:
            print(f"  {i + 1:,}/{len(eligible_ids):,}")

    per_file_bytes = n_years * dim * 4
    print(f"\ndone. {per_file_bytes:,} bytes per file × {len(eligible_ids):,} files")
    print(f"total: {per_file_bytes * len(eligible_ids) / 1e6:,.1f} MB")


if __name__ == "__main__":
    main()
