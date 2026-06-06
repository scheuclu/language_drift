"""Turn raw accumulators into per-year contextual embeddings.

From `sum[V,H]`, `sumsq[V,H]`, `count[V]` (one year) we derive:
  - centroid   = sum / count                         (mean contextual vector)
  - dispersion = sum_d(sumsq/count - centroid^2)      (E||h - c||^2; polysemy signal)
  - centered   = centroid - per-year mean             (BERT anisotropy fix)
                 [- optional all-but-top-k PCA removal]

BERT's last layer is strongly anisotropic (random words sit at cos ~0.3-0.6),
which would swamp the drift signal, so cosine drift downstream runs on the
*centered* vectors. Dispersion is computed on raw centroids and is invariant to
centering (subtracting a constant per dim doesn't change variance).

Writes `models/contextual/{year}.npy` (raw centroid), `_centered.npy`,
`_count.npy`, `_dispersion.npy`.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from config import (
    CONTEXTUAL_CENTERING,
    CONTEXTUAL_MIN_COUNT,
    CONTEXTUAL_PCA_REMOVE_K,
)


def load_partial(state_dir: Path, year: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    z = np.load(Path(state_dir) / f"{year}.partial.npz")
    return z["sum"], z["sumsq"], z["count"]


def _remove_top_k(centered: np.ndarray, mask: np.ndarray, k: int) -> np.ndarray:
    """All-but-the-top: project out the top-k principal components (fit on trusted rows)."""
    trusted = centered[mask]
    if trusted.shape[0] <= k:
        return centered
    # centered already has ~zero mean; SVD gives principal directions in Vt.
    _, _, vt = np.linalg.svd(trusted - trusted.mean(axis=0), full_matrices=False)
    comps = vt[:k]  # [k, H]
    return centered - (centered @ comps.T) @ comps


def finalize_year(
    year: int,
    sum_: np.ndarray,
    sumsq: np.ndarray,
    count: np.ndarray,
    out_dir: Path,
    *,
    min_count: int = CONTEXTUAL_MIN_COUNT,
    centering: bool = CONTEXTUAL_CENTERING,
    pca_remove_k: int = CONTEXTUAL_PCA_REMOVE_K,
) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    sum_ = sum_.astype(np.float64)
    sumsq = sumsq.astype(np.float64)
    count = count.astype(np.float64)

    has = count > 0
    safe_count = np.where(has, count, 1.0)[:, None]
    centroid = (sum_ / safe_count).astype(np.float32)
    centroid[~has] = 0.0

    var_per_dim = sumsq / safe_count - (sum_ / safe_count) ** 2
    dispersion = np.clip(var_per_dim.sum(axis=1), 0.0, None).astype(np.float32)
    dispersion[~has] = 0.0

    # Per-year mean over trusted words only (stable anisotropy estimate).
    trusted = count >= min_count
    if centering and trusted.any():
        mean_vec = centroid[trusted].mean(axis=0, keepdims=True)
        centered = (centroid - mean_vec).astype(np.float32)
        centered[~has] = 0.0
        if pca_remove_k > 0:
            centered = _remove_top_k(centered, trusted, pca_remove_k).astype(np.float32)
            centered[~has] = 0.0
    else:
        centered = centroid.copy()

    np.save(out_dir / f"{year}.npy", centroid)
    np.save(out_dir / f"{year}_centered.npy", centered)
    np.save(out_dir / f"{year}_count.npy", count.astype(np.float32))
    np.save(out_dir / f"{year}_dispersion.npy", dispersion)

    stats = {
        "year": year,
        "words_with_obs": int(has.sum()),
        "words_trusted": int(trusted.sum()),
        "total_obs": int(count.sum()),
        "mean_dispersion": float(dispersion[trusted].mean()) if trusted.any() else 0.0,
    }
    print(
        f"  [finalize {year}] {stats['words_with_obs']:,} words w/ obs, "
        f"{stats['words_trusted']:,} trusted (>= {min_count}), "
        f"{stats['total_obs']:,} total obs -> {out_dir}",
        flush=True,
    )
    return stats
