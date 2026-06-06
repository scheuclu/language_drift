"""Retrain per-year embeddings with the LINEAR LR schedule.

Same config as the shipped run (window=10, 15 negatives, 3 epochs, peak 0.0075)
but with the linear decay + no-warmup schedule that beat cosine on intrinsic
benchmarks (WS-353/SimLex/MEN/RG-65 + analogy).

Outputs to a SEPARATE dir (models/embeddings_w10_linear/) so the current
models/embeddings/ is preserved for A/B comparison before any swap.

Usage:
    uv run python scripts/retrain_linear.py --year 2018 --device cuda
    uv run python scripts/retrain_linear.py --all       --device cuda
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# The winning recipe from the 2014 ablation: pure linear decay, no warmup.
os.environ.setdefault("LR_SCHEDULE", "linear")
os.environ.setdefault("LR_WARMUP_FRAC", "0")
os.environ.setdefault("TB_RUN_TAG", "w10_linear")

from config import YEARS
import training.train as T

OUT = Path("models/embeddings_w10_linear")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    if not a.year and not a.all:
        ap.print_help()
        return

    # Redirect output so models/embeddings/ (the deployed source) is untouched.
    T.EMBEDDINGS_DIR = OUT
    years = YEARS if a.all else [a.year]
    print(f"LR_SCHEDULE={os.environ['LR_SCHEDULE']} warmup={os.environ['LR_WARMUP_FRAC']} "
          f"-> {OUT}  | years={years}", flush=True)
    for y in years:
        print(f"\n{'='*60}\nTraining year {y} -> {OUT}\n{'='*60}", flush=True)
        T.train_year(y, device=a.device)


if __name__ == "__main__":
    main()
