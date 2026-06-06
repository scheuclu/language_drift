"""Local evaluation of the contextual-drift artifacts (plan section Verification).

Runs the sanity checks that tell us the contextual signal is real:
  - anisotropy:   random-pair cosine high on raw centroids, ~0 after centering.
  - stable words: house/table/water move little between first and last year.
  - drifters:     known sense-shifters (covid/zoom/mask/remote/delve) rank high;
                  function-ish words sit low (top-N from the drift summary).
  - dispersion:   polysemous words (bank/apple/python) > monosemous (house/water).
  - noise floor:  median per-word total drift vs the drifters' drift (a coarse
                  SNR; only meaningful with the full multi-year run).

Works with whatever years are present, so it is useful on the 2-year smoke too.

    uv run python scripts/contextual_eval.py --smoke
    uv run python scripts/contextual_eval.py                 # models/contextual
"""
import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from analysis.contextual_drift import compute_contextual_drift, load_centroids
from analysis.drift import cosine_similarity_rows
from config import ANCHOR_YEAR, CONTEXTUAL_DIR, CONTEXTUAL_MIN_COUNT, VOCAB_DIR
from pipeline.vocab import load_vocab

STABLE = ["house", "table", "water", "mother", "river", "stone"]
DRIFTERS = ["covid", "zoom", "mask", "remote", "delve", "lockdown", "vaccine", "pandemic"]
POLYSEMOUS = ["bank", "apple", "python", "mouse", "spring", "crane"]


def _mean_pair_cos(mat: np.ndarray, ids: np.ndarray, n: int = 4000, seed: int = 0) -> float:
    rng = np.random.default_rng(seed)
    a, b = rng.choice(ids, n), rng.choice(ids, n)
    va, vb = mat[a], mat[b]
    na, nb = np.linalg.norm(va, axis=1), np.linalg.norm(vb, axis=1)
    ok = (na > 0) & (nb > 0)
    return float((np.sum(va[ok] * vb[ok], axis=1) / (na[ok] * nb[ok])).mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--dir", default=None)
    ap.add_argument("--min-count", type=int, default=CONTEXTUAL_MIN_COUNT)
    a = ap.parse_args()

    contextual_dir = Path(a.dir) if a.dir else (Path("models/contextual_smoke") if a.smoke else CONTEXTUAL_DIR)
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    aligned, counts, disp = load_centroids(contextual_dir)
    years = sorted(aligned)
    if not years:
        print(f"No centered centroids in {contextual_dir}; run the pipeline first.")
        return
    print(f"dir={contextual_dir} years={years} min_count={a.min_count}\n")

    # 1) Anisotropy (per year): raw {year}.npy vs centered {year}_centered.npy.
    print("== anisotropy (mean random-pair cosine; raw high, centered ~0) ==")
    for y in years:
        raw = np.load(contextual_dir / f"{y}.npy")
        cen = aligned[y]
        trusted = np.where(counts[y] >= a.min_count)[0]
        trusted = trusted[trusted != 0]
        if len(trusted) < 50:
            print(f"  {y}: only {len(trusted)} trusted words, skipping")
            continue
        print(f"  {y}: raw {_mean_pair_cos(raw, trusted):+.4f}   centered {_mean_pair_cos(cen, trusted):+.4f}")

    # 2) Stable words: similarity between first and last available year.
    y0, y1 = years[0], years[-1]
    print(f"\n== stable words: cos(centered {y0}, centered {y1}) [expect high] ==")
    a0, a1 = aligned[y0], aligned[y1]
    for w in STABLE:
        wid = vocab.get(w)
        if wid is None or counts[y0][wid] < a.min_count or counts[y1][wid] < a.min_count:
            print(f"  {w:9s} (insufficient obs)")
            continue
        sim = float(cosine_similarity_rows(a0[wid:wid+1], a1[wid:wid+1])[0])
        print(f"  {w:9s} cos={sim:+.3f}  drift={1-sim:.3f}  (n={counts[y0][wid]:.0f}/{counts[y1][wid]:.0f})")

    # 3) Dispersion: polysemous vs monosemous (year-invariant polysemy signal).
    print("\n== dispersion (polysemous should exceed monosemous) ==")
    for label, words in [("polysemous", POLYSEMOUS), ("monosemous", STABLE)]:
        vals = []
        for w in words:
            wid = vocab.get(w)
            ds = [disp[y][wid] for y in years if wid is not None and counts[y][wid] >= a.min_count]
            if ds:
                vals.append(np.mean(ds))
        if vals:
            print(f"  {label:11s} mean dispersion = {np.mean(vals):.2f}  (over {len(vals)} words)")

    # 4) Drift ranking + coarse SNR.
    print(f"\n== drift vs {ANCHOR_YEAR}: ranking + noise floor ==")
    if ANCHOR_YEAR not in aligned:
        print(f"  anchor {ANCHOR_YEAR} absent; skipping drift ranking")
        return
    _long, summary = compute_contextual_drift(contextual_dir, vocab, base_year=ANCHOR_YEAR, min_count=a.min_count)
    if summary.empty:
        print("  no words passed gating")
        return
    noise = float(summary["total_drift"].median())
    print(f"  words ranked: {len(summary):,}   median total_drift (noise floor) = {noise:.3f}")
    print("  top 15 drifters:")
    for _, r in summary.head(15).iterrows():
        print(f"    {r['word']:15s} total={r['total_drift']:.3f} max={r['max_drift']:.3f}@{int(r['max_drift_year'])} disp={r['dispersion']:.1f}")
    present = summary[summary["word"].isin(DRIFTERS)]
    if not present.empty:
        print("  known drifters present:")
        for _, r in present.iterrows():
            snr = r["total_drift"] / noise if noise else float("nan")
            print(f"    {r['word']:15s} total={r['total_drift']:.3f}  SNR vs noise floor = {snr:.1f}x")
    else:
        print("  (no known drifters in gated set — expected on the 2-year smoke; "
              "covid/zoom emerge only with 2020+ years in the full run)")


if __name__ == "__main__":
    main()
