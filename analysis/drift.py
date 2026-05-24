import numpy as np
import pandas as pd

from config import MIN_WORD_LENGTH


def cosine_similarity_rows(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a_norm = np.linalg.norm(a, axis=1)
    b_norm = np.linalg.norm(b, axis=1)

    denom = a_norm * b_norm
    denom[denom == 0] = 1.0

    return np.sum(a * b, axis=1) / denom


def _word_is_short(word: str) -> bool:
    return len(word) < MIN_WORD_LENGTH


def compute_pairwise_drift(
    aligned: dict[int, np.ndarray],
    vocab: dict[str, int],
) -> pd.DataFrame:
    id_to_word = {v: k for k, v in vocab.items()}
    years = sorted(aligned.keys())
    records = []

    for i in range(len(years) - 1):
        y_a, y_b = years[i], years[i + 1]
        sim = cosine_similarity_rows(aligned[y_a], aligned[y_b])
        dist = 1.0 - sim

        for wid in range(len(dist)):
            word = id_to_word.get(wid, f"<id:{wid}>")
            if word == "<UNK>" or _word_is_short(word):
                continue
            records.append({
                "word": word,
                "year_a": y_a,
                "year_b": y_b,
                "cosine_similarity": float(sim[wid]),
                "cosine_distance": float(dist[wid]),
            })

    return pd.DataFrame(records)


def compute_drift_from_base(
    aligned: dict[int, np.ndarray],
    vocab: dict[str, int],
    base_year: int,
) -> pd.DataFrame:
    id_to_word = {v: k for k, v in vocab.items()}
    base = aligned[base_year]
    records = []

    for year, emb in sorted(aligned.items()):
        if year == base_year:
            continue
        sim = cosine_similarity_rows(base, emb)
        dist = 1.0 - sim

        for wid in range(len(dist)):
            word = id_to_word.get(wid, f"<id:{wid}>")
            if word == "<UNK>" or _word_is_short(word):
                continue
            records.append({
                "word": word,
                "year": year,
                "cosine_similarity": float(sim[wid]),
                "cosine_distance": float(dist[wid]),
            })

    return pd.DataFrame(records)


def compute_drift_summary(pairwise_df: pd.DataFrame) -> pd.DataFrame:
    summary = pairwise_df.groupby("word").agg(
        total_drift=("cosine_distance", "sum"),
        mean_drift=("cosine_distance", "mean"),
        max_drift=("cosine_distance", "max"),
    ).reset_index()

    max_idx = pairwise_df.loc[
        pairwise_df.groupby("word")["cosine_distance"].idxmax()
    ][["word", "year_a", "year_b"]].rename(columns={"year_a": "max_drift_year_a", "year_b": "max_drift_year_b"})

    summary = summary.merge(max_idx, on="word")
    return summary.sort_values("total_drift", ascending=False)
