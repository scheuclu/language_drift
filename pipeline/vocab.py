import json
from collections import Counter
from pathlib import Path

from config import MAX_VOCAB_SIZE, MIN_WORD_FREQ, MIN_YEARS_FOR_VOCAB, YEARS


def build_shared_vocab(
    freq_dir: Path,
    years: list[int] | None = None,
) -> dict[str, int]:
    years = years or YEARS
    year_freqs: dict[int, Counter] = {}

    for year in years:
        freq_path = freq_dir / f"{year}_freqs.json"
        if not freq_path.exists():
            raise FileNotFoundError(f"Missing frequency file: {freq_path}")
        with open(freq_path) as f:
            year_freqs[year] = Counter(json.load(f))

    year_presence: Counter[str] = Counter()
    total_freq: Counter[str] = Counter()

    for year, freqs in year_freqs.items():
        for word, count in freqs.items():
            if count >= MIN_WORD_FREQ:
                year_presence[word] += 1
                total_freq[word] += count

    candidates = [
        word
        for word, num_years in year_presence.items()
        if num_years >= MIN_YEARS_FOR_VOCAB
    ]

    candidates.sort(key=lambda w: total_freq[w], reverse=True)
    candidates = candidates[:MAX_VOCAB_SIZE]

    vocab = {"<UNK>": 0}
    for i, word in enumerate(candidates, start=1):
        vocab[word] = i

    return vocab


def save_vocab(vocab: dict[str, int], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(vocab, f)


def load_vocab(path: Path) -> dict[str, int]:
    with open(path) as f:
        return json.load(f)
