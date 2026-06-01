"""t-SNE variant of the joint 2D projection (experiment vs UMAP).

Same eligible word set + ORDER as precompute_tsne.py (the UMAP one), so the
existing space_freq.bin (per-word brightness, keyed to that order) still aligns.
Only the projector differs. Run with: uv run --with openTSNE python scripts/precompute_space_tsne.py

Outputs (upload to Blob data/v4 alongside space.bin):
  web/public/data/space_tsne.bin        float32 [n_years, n_words, 2], normalized [-1,1]
  web/public/data/space_tsne_index.json { words, years, n_words, bbox }
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import ALIGNED_DIR, TOKENS_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab

MIN_FREQ_ANYWHERE = 500
WORD_RE = re.compile(r"^[a-z]{2,20}$")  # match precompute_tsne.py exactly
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
PCA_DIMS = 50
PERPLEXITY = 50


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
        if not WORD_RE.match(inv_vocab[wid]):
            continue
        if max_freq[wid] < MIN_FREQ_ANYWHERE:
            continue
        eligible_ids.append(wid)
    eligible_ids = np.array(eligible_ids, dtype=np.int64)
    eligible_words = [inv_vocab[wid] for wid in eligible_ids.tolist()]
    print(f"eligible words: {len(eligible_ids):,}")

    print("loading aligned embeddings...")
    all_embeds = np.stack([np.load(ALIGNED_DIR / f"{y}.npy") for y in YEARS]).astype(np.float32)
    n_years, n_words = len(YEARS), len(eligible_ids)
    combined = np.empty((n_years * n_words, all_embeds.shape[-1]), dtype=np.float32)
    for yi in range(n_years):
        combined[yi * n_words : (yi + 1) * n_words] = all_embeds[yi, eligible_ids, :]
    print(f"combined: {combined.shape}")

    # L2-normalize so Euclidean t-SNE ≈ cosine geometry (UMAP used cosine)
    combined /= np.linalg.norm(combined, axis=1, keepdims=True) + 1e-9

    print(f"PCA -> {PCA_DIMS}d...")
    from sklearn.decomposition import PCA

    X = PCA(n_components=PCA_DIMS, random_state=42).fit_transform(combined).astype(np.float32)

    print(f"fitting t-SNE (openTSNE, perplexity={PERPLEXITY}, FFT, multicore)...")
    from openTSNE import TSNE

    tsne = TSNE(
        n_components=2,
        perplexity=PERPLEXITY,
        metric="euclidean",
        initialization="pca",
        n_jobs=-1,
        random_state=42,
        verbose=True,
    )
    coords = np.asarray(tsne.fit(X), dtype=np.float32)

    cmin, cmax = coords.min(0), coords.max(0)
    span = (cmax - cmin).max()
    coords = (coords - (cmax + cmin) / 2) / (span / 2)
    coords = coords.reshape(n_years, n_words, 2)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    coords.tofile(OUT_DIR / "space_tsne.bin")
    json.dump(
        {
            "words": eligible_words,
            "years": list(YEARS),
            "n_words": n_words,
            "bbox": {
                "min": coords.reshape(-1, 2).min(0).tolist(),
                "max": coords.reshape(-1, 2).max(0).tolist(),
            },
        },
        open(OUT_DIR / "space_tsne_index.json", "w"),
    )
    print(f"wrote space_tsne.bin ({coords.nbytes/1e6:.1f} MB) + index, {n_words:,} words")


if __name__ == "__main__":
    main()
