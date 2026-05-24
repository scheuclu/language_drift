"""Quality check: hand-picked drifters + frequency-filtered top-N."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import ALIGNED_DIR, ANCHOR_YEAR, DRIFT_DIR, TOKENS_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab


KNOWN_DRIFTERS = [
    "isis", "snapchat", "woke", "covid", "lockdown", "pandemic",
    "mask", "vaccine", "trump", "biden", "tiktok", "zoom",
    "remote", "viral", "crypto", "nft", "bitcoin", "streaming",
    "instagram", "uber", "tesla",
]


def cos_drift(a, b):
    return float(1.0 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def main():
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    aligned = {y: np.load(ALIGNED_DIR / f"{y}.npy") for y in YEARS if (ALIGNED_DIR / f"{y}.npy").exists()}
    base = ANCHOR_YEAR if ANCHOR_YEAR in aligned else min(aligned.keys())
    last = max(aligned.keys())

    print(f"=== Hand-picked drifters: {base} -> {last} ===")
    for w in KNOWN_DRIFTERS:
        if w not in vocab:
            print(f"  {w:<14s} (not in vocab)")
            continue
        wid = vocab[w]
        d = cos_drift(aligned[base][wid], aligned[last][wid])
        flag = ""
        if d > 0.5:
            flag = " <- strong signal"
        elif d > 0.3:
            flag = " <- moderate signal"
        elif d > 0.15:
            flag = " <- weak (close to noise floor)"
        else:
            flag = " <- below noise floor"
        print(f"  {w:<14s} drift {d:.4f}{flag}")

    print(f"\n=== Frequency-filtered top-20 drift (using 2013 freqs) ===")
    with open(TOKENS_DIR / f"{base}_freqs.json") as f:
        freqs = json.load(f)

    summary = pd.read_parquet(DRIFT_DIR / "drift_summary.parquet")
    summary["freq"] = summary["word"].map(lambda w: freqs.get(w, 0))

    for thresh in (1_000, 10_000, 100_000):
        f = summary[summary["freq"] >= thresh].sort_values("total_drift", ascending=False).head(20)
        print(f"\n  freq >= {thresh:,} ({len(summary[summary['freq'] >= thresh])} words pass filter):")
        for _, row in f.iterrows():
            print(f"    {row['word']:<20s} total {row['total_drift']:.3f}  mean {row['mean_drift']:.3f}  freq {row['freq']:,}")


if __name__ == "__main__":
    main()
