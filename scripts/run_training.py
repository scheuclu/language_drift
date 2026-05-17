import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import YEARS
from training.train import train_year


def main():
    parser = argparse.ArgumentParser(description="Train Word2Vec embeddings per year")
    parser.add_argument("--year", type=int, help="Train for a single year")
    parser.add_argument("--all", action="store_true", help="Train for all years")
    parser.add_argument("--device", default="cuda", help="Device to train on (default: cuda)")
    args = parser.parse_args()

    if not args.year and not args.all:
        parser.print_help()
        return

    years = YEARS if args.all else [args.year]

    for year in years:
        print(f"\n{'='*60}")
        print(f"Training year {year}")
        print(f"{'='*60}")
        train_year(year, device=args.device)


if __name__ == "__main__":
    main()
