"""Precompute a stacked corpus of aligned embeddings for the /arith page.

The /arith page does brute-force cosine nearest-neighbor search over every
eligible word. To do that client-side it needs the full per-word matrix in
one fetch (rather than 19K small .bin files like /ternary uses).

Outputs:
  web/public/data/arith.bin    float32, shape [N_ELIGIBLE, 300]
                               row order matches space_index.json["words"]

For v1 we ship only the latest year (the canonical year for the demo
sushi - japan + germany ≈ "german food"). Add other years by parameterizing
ARITH_YEAR if temporal arithmetic becomes a feature.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import ALIGNED_DIR, TOKENS_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab

MIN_FREQ_ANYWHERE = 500  # was 3000; lowered now that data is hosted on Blob (no size cap)
WORD_RE = re.compile(r"^[a-z]{2,20}$")
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
ARITH_YEAR = max(YEARS)


def is_clean(word: str) -> bool:
    return bool(WORD_RE.match(word))


def main() -> None:
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    inv_vocab = {wid: w for w, wid in vocab.items()}
    vocab_size = len(vocab)

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

    print(f"loading aligned/{ARITH_YEAR}.npy...")
    emb = np.load(ALIGNED_DIR / f"{ARITH_YEAR}.npy").astype(np.float32)
    corpus = emb[eligible_ids]
    print(f"corpus shape: {corpus.shape}")

    out_path = OUT_DIR / "arith.bin"
    corpus.tofile(out_path)
    size_mb = out_path.stat().st_size / 1e6
    print(f"wrote {out_path} ({size_mb:.1f} MB)")

    # Sanity-check that word order matches space_index.json (same filter)
    idx_path = OUT_DIR / "space_index.json"
    if idx_path.exists():
        idx = json.loads(idx_path.read_text())
        expected_words = [inv_vocab[wid] for wid in eligible_ids.tolist()]
        if idx["words"] != expected_words:
            print(
                f"WARNING: space_index.json word order differs from arith.bin.\n"
                f"  /arith will be incorrect — regenerate both with the same eligibility filter.",
                file=sys.stderr,
            )
        else:
            print(f"verified: word order matches space_index.json ({len(expected_words):,} words)")


if __name__ == "__main__":
    main()
