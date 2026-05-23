"""Precompute 3D UMAP projection of aligned embeddings across all years.

Concatenates every (year, eligible_word) vector into one matrix and runs a
single UMAP fit so the layout is shared across years. A word's 13 yearly
positions then trace a coherent trajectory through the same 3D space.

Outputs (under web/public/data/):
  space.bin            float32, shape [N_YEARS, N_ELIGIBLE, 3], normalized to [-1, 1]
  space_index.json     { words: [...], years: [...], n_words, bbox }

Re-run after retraining: input is models/aligned/{year}.npy, same eligible-word
filter as the other precompute_*.py scripts so the indexed words stay aligned
across all data shards.
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
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

UMAP_N_NEIGHBORS = 30
UMAP_MIN_DIST = 0.08
UMAP_METRIC = "cosine"
RANDOM_STATE = 42


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

    eligible_words = [inv_vocab[wid] for wid in eligible_ids.tolist()]

    print("loading aligned embeddings...")
    all_embeds = np.stack(
        [np.load(ALIGNED_DIR / f"{year}.npy") for year in YEARS]
    ).astype(np.float32)

    # Stack as (n_years * n_eligible, dim) — year-major order so reshape inverts.
    n_years = len(YEARS)
    n_words = len(eligible_ids)
    combined = np.empty((n_years * n_words, all_embeds.shape[-1]), dtype=np.float32)
    for yi in range(n_years):
        combined[yi * n_words : (yi + 1) * n_words] = all_embeds[yi, eligible_ids, :]
    print(f"combined for UMAP: {combined.shape}")

    print(
        f"fitting UMAP (n_components=3, n_neighbors={UMAP_N_NEIGHBORS}, "
        f"min_dist={UMAP_MIN_DIST}, metric={UMAP_METRIC})..."
    )
    import umap  # type: ignore

    reducer = umap.UMAP(
        n_components=3,
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        metric=UMAP_METRIC,
        random_state=RANDOM_STATE,
        verbose=True,
        low_memory=True,
    )
    coords = reducer.fit_transform(combined).astype(np.float32)

    # Normalize to a [-1, 1] cube, preserving aspect.
    cmin = coords.min(axis=0)
    cmax = coords.max(axis=0)
    span = (cmax - cmin).max()
    center = (cmax + cmin) / 2
    coords = (coords - center) / (span / 2)

    coords = coords.reshape(n_years, n_words, 3)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bin_path = OUT_DIR / "space.bin"
    coords.tofile(bin_path)
    print(f"wrote {bin_path} ({coords.nbytes / 1e6:.1f} MB)")

    idx_path = OUT_DIR / "space_index.json"
    with open(idx_path, "w") as f:
        json.dump(
            {
                "words": eligible_words,
                "years": list(YEARS),
                "n_words": n_words,
                "bbox": {
                    "min": coords.reshape(-1, 3).min(axis=0).tolist(),
                    "max": coords.reshape(-1, 3).max(axis=0).tolist(),
                },
            },
            f,
        )
    print(f"wrote {idx_path}")


if __name__ == "__main__":
    main()
