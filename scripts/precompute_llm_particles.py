"""Per-word, per-year frequency (per-million) for the /llm "distribution" viz —
every established English word as a particle, so the page can animate the whole
distribution of frequency-change deforming over the years (no cherry-picking).

Matches the ridgeline word set in precompute_llm.py: clean [3..20] words with
max yearly count >= 500, established by 2014-15 (mean per-million >= 0.5).

Outputs (upload to Blob data/v4 alongside llm.json):
  web/public/data/llm_particles.bin    float32, year-major [n_years, n_words] pm
  web/public/data/llm_particles.json   { words, years, n, base_years }
"""
import json
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
YEARS = list(range(2014, 2026))
BASE_YEARS = [2014, 2015]
MIN_BASE_PM = 0.5
MIN_FREQ = 500
WORD_RE = re.compile(r"^[a-z]{3,20}$")
JUNK = {
    "replydelete", "newer", "quot", "fml", "dhu", "lso", "ene", "dic", "ntn",
    "nsk", "abr", "youll", "couldnt", "ment", "uncategorized", "pingback",
    "permalink", "trackback", "nbsp", "amp", "wasnt", "didnt", "doesnt", "isnt",
    "hasnt", "arent", "thats", "whats", "dont", "cant", "ive", "youve", "theyre",
}
OUT = ROOT / "web" / "public" / "data"


def main() -> None:
    print("loading per-year freqs...")
    freqs, tot = {}, {}
    for y in YEARS:
        d = json.load(open(ROOT / f"data/tokens/{y}_freqs.json"))
        freqs[y] = d
        tot[y] = sum(d.values())

    cand = set()
    for y in YEARS:
        for w, c in freqs[y].items():
            if c >= MIN_FREQ and WORD_RE.match(w) and w not in JUNK:
                cand.add(w)
    cand = sorted(cand)
    print(f"candidates: {len(cand):,}")

    bi = [YEARS.index(y) for y in BASE_YEARS]
    words, rows = [], []
    for w in cand:
        pm = [freqs[y].get(w, 0) / tot[y] * 1e6 for y in YEARS]
        base = sum(pm[i] for i in bi) / len(bi)
        if base >= MIN_BASE_PM:
            words.append(w)
            rows.append(pm)
    n = len(words)
    print(f"established (base>= {MIN_BASE_PM}): {n:,}")

    pm = np.array(rows, dtype=np.float32).T  # year-major [n_years, n]
    pm.tofile(OUT / "llm_particles.bin")
    json.dump(
        {"words": words, "years": YEARS, "n": n, "base_years": BASE_YEARS},
        open(OUT / "llm_particles.json", "w"),
        separators=(",", ":"),
    )
    print(f"wrote llm_particles.bin ({pm.nbytes/1e6:.2f} MB, shape {pm.shape})")
    print(f"wrote llm_particles.json ({(OUT/'llm_particles.json').stat().st_size/1e6:.2f} MB)")
    # sanity: spread of log2 change vs baseline, first vs last year
    base = pm[bi].mean(axis=0) + 0.05
    for yi in (0, len(YEARS) - 1):
        lift = np.log2((pm[yi] + 0.05) / base)
        print(f"  {YEARS[yi]}: lift mean={lift.mean():+.3f} std={lift.std():.3f} "
              f"%>1={(lift>1).mean()*100:.1f} %<-1={(lift<-1).mean()*100:.1f}")


if __name__ == "__main__":
    main()
