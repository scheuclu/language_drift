import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import TOKENS_DIR, VOCAB_DIR, YEARS
from pipeline.data_pipeline import encode_to_ids, stream_and_tokenize
from pipeline.vocab import build_shared_vocab, load_vocab, save_vocab


def main():
    parser = argparse.ArgumentParser(description="FineWeb data pipeline")
    parser.add_argument("--year", type=int, help="Process a single year")
    parser.add_argument("--all", action="store_true", help="Process all years")
    parser.add_argument("--build-vocab", action="store_true", help="Build shared vocabulary from frequency files")
    parser.add_argument("--encode", action="store_true", help="Encode tokenized text to ID arrays")
    args = parser.parse_args()

    if not any([args.year, args.all, args.build_vocab, args.encode]):
        parser.print_help()
        return

    years = YEARS if args.all else ([args.year] if args.year else [])

    if (args.year or args.all) and not args.build_vocab and not args.encode:
        for year in years:
            print(f"\n{'='*60}")
            print(f"Processing year {year}")
            print(f"{'='*60}")
            stream_and_tokenize(year)

    if args.build_vocab:
        print(f"\n{'='*60}")
        print("Building shared vocabulary")
        print(f"{'='*60}")
        vocab = build_shared_vocab(TOKENS_DIR)
        vocab_path = VOCAB_DIR / "vocab.json"
        save_vocab(vocab, vocab_path)
        print(f"Vocabulary: {len(vocab):,} words -> {vocab_path}")

    if args.encode:
        if not years:
            years = YEARS
        vocab_path = VOCAB_DIR / "vocab.json"
        vocab = load_vocab(vocab_path)
        print(f"Loaded vocabulary: {len(vocab):,} words")
        for year in years:
            encode_to_ids(year, vocab)


if __name__ == "__main__":
    main()
