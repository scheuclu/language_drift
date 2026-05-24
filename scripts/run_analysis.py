import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from config import ALIGNED_DIR, ANCHOR_YEAR, DRIFT_DIR, EMBEDDINGS_DIR, VOCAB_DIR, YEARS
from analysis.alignment import align_all_years
from analysis.drift import compute_drift_from_base, compute_drift_summary, compute_pairwise_drift
from pipeline.vocab import load_vocab


def run_alignment() -> None:
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    print(f"Loaded vocabulary: {len(vocab):,} words")

    embeddings = {}
    for year in YEARS:
        path = EMBEDDINGS_DIR / f"{year}.npy"
        if path.exists():
            embeddings[year] = np.load(path)
            print(f"  Loaded {year}: {embeddings[year].shape}")

    if not embeddings:
        print("No embedding files found.")
        return

    base_year = ANCHOR_YEAR if ANCHOR_YEAR in embeddings else min(embeddings.keys())
    if base_year != ANCHOR_YEAR:
        print(f"Warning: anchor year {ANCHOR_YEAR} not found, falling back to {base_year}")
    print(f"\nAligning {len(embeddings)} years to reference year {base_year}...")
    aligned = align_all_years(embeddings, base_year)

    ALIGNED_DIR.mkdir(parents=True, exist_ok=True)
    for year, emb in aligned.items():
        out_path = ALIGNED_DIR / f"{year}.npy"
        np.save(out_path, emb)
        print(f"  Saved aligned {year}: {out_path}")


def run_drift() -> None:
    vocab = load_vocab(VOCAB_DIR / "vocab.json")

    aligned = {}
    for year in YEARS:
        path = ALIGNED_DIR / f"{year}.npy"
        if path.exists():
            aligned[year] = np.load(path)

    if len(aligned) < 2:
        print("Need at least 2 aligned embedding files.")
        return

    base_year = ANCHOR_YEAR if ANCHOR_YEAR in aligned else min(aligned.keys())
    if base_year != ANCHOR_YEAR:
        print(f"Warning: anchor year {ANCHOR_YEAR} not found, falling back to {base_year}")
    print(f"Computing drift across {len(aligned)} years...")

    pairwise_df = compute_pairwise_drift(aligned, vocab)
    base_df = compute_drift_from_base(aligned, vocab, base_year)
    summary_df = compute_drift_summary(pairwise_df)

    DRIFT_DIR.mkdir(parents=True, exist_ok=True)

    pairwise_df.to_parquet(DRIFT_DIR / "drift_pairwise.parquet", index=False)
    base_df.to_parquet(DRIFT_DIR / "drift_from_base.parquet", index=False)
    summary_df.to_parquet(DRIFT_DIR / "drift_summary.parquet", index=False)

    print(f"\nTop 20 most drifting words:")
    print(summary_df.head(20).to_string(index=False))


def main():
    parser = argparse.ArgumentParser(description="Alignment and drift analysis")
    parser.add_argument("--align", action="store_true", help="Run Procrustes alignment")
    parser.add_argument("--drift", action="store_true", help="Compute drift metrics")
    parser.add_argument("--all", action="store_true", help="Run full analysis pipeline")
    args = parser.parse_args()

    if not any([args.align, args.drift, args.all]):
        parser.print_help()
        return

    if args.align or args.all:
        print(f"\n{'='*60}")
        print("Aligning embeddings")
        print(f"{'='*60}")
        run_alignment()

    if args.drift or args.all:
        print(f"\n{'='*60}")
        print("Computing drift metrics")
        print(f"{'='*60}")
        run_drift()


if __name__ == "__main__":
    main()
