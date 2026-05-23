"""Precompute per-word JSON shards for the language-drift web app.

Outputs (under web/public/data/):
  manifest.json                  -- search index: word, freq_2013, freq_max, total_drift
  drift_gallery.json             -- top 2000 by total drift (for the gallery view)
  words/<word>.json              -- per-word: freq_by_year, drift_from_base, neighbors_by_year

Vocab filter: lowercase alpha only (no apostrophes, hyphens, digits), length >= 2,
max yearly freq >= MIN_FREQ_ANYWHERE. Neighbor candidates use the same filter so
neighbor lists never contain typos / rare junk.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import ALIGNED_DIR, TOKENS_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab

MIN_FREQ_ANYWHERE = 3000
TOP_K = 25
SIM_DECIMALS = 3
DRIFT_DECIMALS = 3
CHUNK_SIZE = 1024
WORD_RE = re.compile(r"^[a-z]{2,20}$")
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"


def is_clean(word: str) -> bool:
    return bool(WORD_RE.match(word))


def main() -> None:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device}")

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    vocab_size = len(vocab)
    inv_vocab = {wid: w for w, wid in vocab.items()}
    print(f"vocab: {vocab_size:,}")

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
        w = inv_vocab[wid]
        if not is_clean(w):
            continue
        if max_freq[wid] < MIN_FREQ_ANYWHERE:
            continue
        eligible_ids.append(wid)
    eligible_ids = np.array(eligible_ids, dtype=np.int64)
    print(f"eligible words after filter: {len(eligible_ids):,}")

    print("loading aligned embeddings...")
    all_embeds = np.stack(
        [np.load(ALIGNED_DIR / f"{year}.npy") for year in YEARS]
    ).astype(np.float32)
    print(f"all_embeds shape: {all_embeds.shape}")

    neighbor_ids = eligible_ids
    neighbor_pos_to_vocab = neighbor_ids
    eligible_idx_in_neighbors = {int(wid): i for i, wid in enumerate(neighbor_ids.tolist())}

    per_word_neighbors: dict[int, dict[int, list[tuple[str, float]]]] = {
        wid: {} for wid in eligible_ids.tolist()
    }

    eligible_tensor = torch.from_numpy(eligible_ids).to(device)
    neighbor_tensor = torch.from_numpy(neighbor_ids).to(device)

    for yi, year in enumerate(YEARS):
        print(f"  computing top-{TOP_K} neighbors for {year}...")
        E = torch.from_numpy(all_embeds[yi]).to(device)
        En = E / (E.norm(dim=1, keepdim=True) + 1e-12)
        Q_all = En[eligible_tensor]
        N = En[neighbor_tensor]
        for cstart in range(0, len(eligible_ids), CHUNK_SIZE):
            cend = min(cstart + CHUNK_SIZE, len(eligible_ids))
            sims = Q_all[cstart:cend] @ N.T  # (chunk, len(neighbor_ids))
            top_sims, top_idx = sims.topk(TOP_K + 1, dim=1)
            top_sims_np = top_sims.cpu().numpy()
            top_idx_np = top_idx.cpu().numpy()
            for i, wid in enumerate(eligible_ids[cstart:cend].tolist()):
                row = []
                for j in range(TOP_K + 1):
                    nid_in_neighbors = int(top_idx_np[i, j])
                    nid = int(neighbor_pos_to_vocab[nid_in_neighbors])
                    if nid == wid:
                        continue
                    row.append((inv_vocab[nid], float(top_sims_np[i, j])))
                    if len(row) >= TOP_K:
                        break
                per_word_neighbors[wid][year] = row
        del E, En, Q_all, N
        torch.cuda.empty_cache()

    print("computing drift trajectories...")
    base_yi = 0
    base_embeds = all_embeds[base_yi]
    base_norms = np.linalg.norm(base_embeds, axis=1) + 1e-12
    drift_traj: dict[int, dict[str, float]] = {}
    total_drift: dict[int, float] = {}
    for wid in eligible_ids.tolist():
        v0 = base_embeds[wid]
        n0 = base_norms[wid]
        traj: dict[str, float] = {}
        tot = 0.0
        for yi, year in enumerate(YEARS):
            if yi == base_yi:
                continue
            v = all_embeds[yi][wid]
            n = float(np.linalg.norm(v) + 1e-12)
            cos = float(np.dot(v0, v) / (n0 * n))
            d = float(1.0 - cos)
            traj[str(year)] = d
            tot += d
        drift_traj[wid] = traj
        total_drift[wid] = tot

    print("writing per-word JSON shards (compact format)...")
    words_dir = OUT_DIR / "words"
    words_dir.mkdir(parents=True, exist_ok=True)
    for wid in eligible_ids.tolist():
        w = inv_vocab[wid]
        freq_arr = [int(freq_matrix[wid, yi]) for yi in range(len(YEARS))]
        drift_arr = [
            round(drift_traj[wid][str(YEARS[yi])], DRIFT_DECIMALS)
            for yi in range(1, len(YEARS))
        ]
        nbrs_arr = [
            [[n, round(s, SIM_DECIMALS)] for n, s in per_word_neighbors[wid][year]]
            for year in YEARS
        ]
        out = {
            "w": w,
            "y": [int(y) for y in YEARS],
            "f": freq_arr,
            "d": drift_arr,
            "td": round(total_drift[wid], DRIFT_DECIMALS),
            "n": nbrs_arr,
        }
        with open(words_dir / f"{w}.json", "w") as f:
            json.dump(out, f, separators=(",", ":"))

    print("writing manifest.json...")
    manifest_words = []
    for wid in eligible_ids.tolist():
        w = inv_vocab[wid]
        manifest_words.append(
            {
                "w": w,
                "f0": int(freq_matrix[wid, 0]),
                "fm": int(max_freq[wid]),
                "d": round(total_drift[wid], 4),
            }
        )
    manifest_words.sort(key=lambda x: -x["fm"])
    with open(OUT_DIR / "manifest.json", "w") as f:
        json.dump(
            {
                "years": [int(y) for y in YEARS],
                "base_year": int(YEARS[0]),
                "n_words": len(manifest_words),
                "words": manifest_words,
            },
            f,
            separators=(",", ":"),
        )

    print("writing drift_gallery.json...")
    gallery = sorted(manifest_words, key=lambda x: -x["d"])[:2000]
    with open(OUT_DIR / "drift_gallery.json", "w") as f:
        json.dump({"top": gallery}, f, separators=(",", ":"))

    print(f"\nDone. Outputs under: {OUT_DIR}")
    print(f"  manifest.json: {len(manifest_words):,} words")
    print(f"  per-word shards: {len(eligible_ids):,} files in words/")


if __name__ == "__main__":
    main()
