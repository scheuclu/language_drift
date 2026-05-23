"""Compute anchor-word drift from 2013 to all later years; report median + per-word."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import ALIGNED_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab


ANCHORS = [
    "house", "year", "time", "book", "road", "man", "woman",
    "water", "tree", "day", "night", "food", "city", "river",
    "mountain", "child", "father", "mother", "school", "friend",
    "music", "morning", "evening", "spring", "summer", "autumn",
    "winter", "sun", "moon", "star", "father", "table", "chair",
    "door", "window", "garden", "flower", "bird", "fish", "horse",
]
ANCHORS = sorted(set(ANCHORS))


def cosine_drift(a: np.ndarray, b: np.ndarray) -> float:
    return float(1.0 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def main():
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    aligned = {y: np.load(ALIGNED_DIR / f"{y}.npy") for y in YEARS if (ALIGNED_DIR / f"{y}.npy").exists()}
    base = min(aligned.keys())
    print(f"Base year: {base}; comparing {sorted(aligned.keys())}")

    missing = [w for w in ANCHORS if w not in vocab]
    if missing:
        print(f"Anchors missing from vocab (skipped): {missing}")
    words = [w for w in ANCHORS if w in vocab]

    drifts_by_word = {}
    for w in words:
        wid = vocab[w]
        v_base = aligned[base][wid]
        ds = []
        for y in sorted(aligned.keys()):
            if y == base:
                continue
            v_y = aligned[y][wid]
            ds.append(cosine_drift(v_base, v_y))
        drifts_by_word[w] = ds

    all_drifts = np.array([d for ds in drifts_by_word.values() for d in ds])
    median = float(np.median(all_drifts))
    p90 = float(np.percentile(all_drifts, 90))
    max_d = float(np.max(all_drifts))

    print(f"\n=== Anchor-word drift (cosine, base year {base}) ===")
    print(f"  {len(words)} anchors x {len(aligned)-1} target years = {len(all_drifts)} drift values")
    print(f"  Median:      {median:.4f}")
    print(f"  90th pct:    {p90:.4f}")
    print(f"  Max:         {max_d:.4f}")
    print(f"\n  Per-anchor median drift across years:")
    pairs = sorted(((np.median(d), w) for w, d in drifts_by_word.items()), reverse=True)
    for m, w in pairs:
        print(f"    {w:<12s} median {m:.4f}  range [{min(drifts_by_word[w]):.4f}, {max(drifts_by_word[w]):.4f}]")

    print(f"\n  Verdict per plan (plans/three_epoch_retrain.md):")
    if median < 0.10:
        print(f"    Median {median:.3f} < 0.10 -> retrain SUCCEEDED")
    elif median < 0.15:
        print(f"    Median {median:.3f} in [0.10, 0.15) -> marginal; consider deeper investigation")
    else:
        print(f"    Median {median:.3f} >= 0.15 -> still noisy; per plan, consider NUM_EPOCHS=5")


if __name__ == "__main__":
    main()
