"""Contextual drift vs the anchor year, from finalized per-year centroids.

Loads the centered contextual centroids (`models/contextual/{year}_centered.npy`)
into one coordinate system (frozen encoder => no alignment needed), computes
cosine drift of each word vs the anchor year, gates every (word, year) on a
minimum observation count so noisy low-frequency centroids don't pollute the
ranking, and emits a long table + a per-word summary that carries a dispersion
(polysemy) column.

Reuses `analysis/drift.py::compute_drift_from_base`; the summary aggregation is
local because that drift is keyed by a single `year` column (vs the consecutive
`year_a`/`year_b` pairs that `compute_drift_summary` expects).
"""
from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.drift import compute_drift_from_base
from config import ANCHOR_YEAR, CONTEXTUAL_MIN_COUNT


def load_centroids(
    contextual_dir: Path, years: list[int] | None = None
) -> tuple[dict[int, np.ndarray], dict[int, np.ndarray], dict[int, np.ndarray]]:
    """Return (centered centroids, counts, dispersion) keyed by year, for years present on disk."""
    contextual_dir = Path(contextual_dir)
    aligned: dict[int, np.ndarray] = {}
    counts: dict[int, np.ndarray] = {}
    disp: dict[int, np.ndarray] = {}

    candidate_years = years
    if candidate_years is None:
        candidate_years = sorted(
            int(p.stem.replace("_centered", ""))
            for p in contextual_dir.glob("*_centered.npy")
        )

    for y in candidate_years:
        cen = contextual_dir / f"{y}_centered.npy"
        if not cen.exists():
            continue
        aligned[y] = np.load(cen)
        counts[y] = np.load(contextual_dir / f"{y}_count.npy")
        disp[y] = np.load(contextual_dir / f"{y}_dispersion.npy")
    return aligned, counts, disp


def _mean_dispersion(disp: dict[int, np.ndarray], counts: dict[int, np.ndarray], min_count: int) -> np.ndarray:
    """Per-word mean dispersion across years where the word is trusted (count >= min_count)."""
    years = sorted(disp.keys())
    disp_stack = np.stack([disp[y] for y in years])      # [Y, V]
    cnt_stack = np.stack([counts[y] for y in years])     # [Y, V]
    masked = np.where(cnt_stack >= min_count, disp_stack, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)  # all-nan slices -> nan
        return np.nanmean(masked, axis=0)                # [V]; nan where never trusted


def compute_contextual_drift(
    contextual_dir: Path,
    vocab: dict[str, int],
    *,
    base_year: int = ANCHOR_YEAR,
    min_count: int = CONTEXTUAL_MIN_COUNT,
    years: list[int] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (long_df, summary_df). long_df is per (word, year) drift vs base_year,
    gated to (word,year) pairs where both that year and the base year have
    count >= min_count. summary_df is per-word, sorted by total drift, with a
    dispersion column."""
    aligned, counts, disp = load_centroids(contextual_dir, years)
    if base_year not in aligned:
        raise FileNotFoundError(
            f"Anchor year {base_year} not found in {contextual_dir} (have {sorted(aligned)})."
        )

    long_df = compute_drift_from_base(aligned, vocab, base_year)
    if long_df.empty:
        return long_df, long_df

    long_df["wid"] = long_df["word"].map(vocab).astype(int)
    base_cnt = counts[base_year]
    long_df["count_base"] = base_cnt[long_df["wid"].values]
    long_df["count_year"] = 0.0
    for y in aligned:
        if y == base_year:
            continue
        m = long_df["year"] == y
        long_df.loc[m, "count_year"] = counts[y][long_df.loc[m, "wid"].values]

    valid = (long_df["count_year"] >= min_count) & (long_df["count_base"] >= min_count)
    long_df = long_df[valid].reset_index(drop=True)
    if long_df.empty:
        return long_df, long_df

    # Noise-normalized drift (a t-like statistic): how many sampling-error units
    # the two yearly centroids sit apart. A centroid is a sample mean of `count`
    # contextual vectors, so its squared standard error is dispersion/count
    # (dispersion = E||h - c||^2 = trace of the within-word covariance); for the
    # difference of two independent years the SE^2 adds. z = ||Δcentroid|| / SE
    # therefore de-ranks high-variance / low-count words whose centroids merely
    # wobble, while leaving genuine sense shifts (||Δ|| >> SE) high. Δ is taken
    # on the *centered* centroids (anisotropy/global drift removed).
    base_vec = aligned[base_year]
    long_df["disp_base"] = disp[base_year][long_df["wid"].values]
    long_df["disp_year"] = 0.0
    long_df["euclid"] = 0.0
    for y in aligned:
        if y == base_year:
            continue
        m = (long_df["year"] == y).values
        wids = long_df.loc[m, "wid"].values
        long_df.loc[m, "disp_year"] = disp[y][wids]
        long_df.loc[m, "euclid"] = np.linalg.norm(aligned[y][wids] - base_vec[wids], axis=1)
    se = np.sqrt(long_df["disp_base"] / long_df["count_base"] + long_df["disp_year"] / long_df["count_year"])
    long_df["z_score"] = (long_df["euclid"] / se.replace(0.0, np.nan)).fillna(0.0)

    summary = (
        long_df.groupby("word")
        .agg(
            total_z=("z_score", "sum"),
            max_z=("z_score", "max"),
            total_drift=("cosine_distance", "sum"),
            mean_drift=("cosine_distance", "mean"),
            max_drift=("cosine_distance", "max"),
            n_years=("year", "count"),
        )
        .reset_index()
    )
    peak_rows = long_df.loc[long_df.groupby("word")["z_score"].idxmax()][
        ["word", "year"]
    ].rename(columns={"year": "peak_year"})
    summary = summary.merge(peak_rows, on="word")

    mean_disp = _mean_dispersion(disp, counts, min_count)
    summary["dispersion"] = mean_disp[summary["word"].map(vocab).astype(int).values]

    # Rank by the noise-normalized score so high-variance words don't dominate.
    summary = summary.sort_values("total_z", ascending=False).reset_index(drop=True)
    return long_df, summary


def run_drift(
    contextual_dir: Path,
    vocab: dict[str, int],
    *,
    base_year: int = ANCHOR_YEAR,
    min_count: int = CONTEXTUAL_MIN_COUNT,
    years: list[int] | None = None,
) -> pd.DataFrame:
    """Compute drift and write drift_vs_{base}.parquet + drift_summary.parquet."""
    contextual_dir = Path(contextual_dir)
    long_df, summary = compute_contextual_drift(
        contextual_dir, vocab, base_year=base_year, min_count=min_count, years=years
    )
    if summary.empty:
        print(f"  [drift] no (word,year) pairs passed min_count={min_count}; nothing written", flush=True)
        return summary

    long_path = contextual_dir / f"drift_vs_{base_year}.parquet"
    summary_path = contextual_dir / "drift_summary.parquet"
    long_df.to_parquet(long_path)
    summary.to_parquet(summary_path)
    print(
        f"  [drift] {len(long_df):,} (word,year) rows, {len(summary):,} words "
        f"(min_count={min_count}) -> {long_path.name}, {summary_path.name}",
        flush=True,
    )
    return summary
