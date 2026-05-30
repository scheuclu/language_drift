"""Per-word, per-year frequency (per-million) for the /space points, in
space_index order. Lets the client brighten a point by how common the word was
that year, relative to the year's corpus. No UMAP/embeddings needed — we just
re-use the existing space_index.json order.

Output: web/public/data/space_freq.bin  (float32, year-major [n_years, n_words])
Upload alongside space.bin to Blob data/vN/.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import TOKENS_DIR, YEARS

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"


def main() -> None:
    words = json.load(open(OUT / "space_index.json"))["words"]
    n = len(words)
    print(f"space words: {n:,}")

    pm = np.zeros((len(YEARS), n), dtype=np.float32)
    for yi, year in enumerate(YEARS):
        fy = json.load(open(TOKENS_DIR / f"{year}_freqs.json"))
        tot = sum(fy.values())
        col = np.array([fy.get(w, 0) for w in words], dtype=np.float64)
        pm[yi] = (col / tot * 1e6).astype(np.float32)
        nz = col > 0
        # diagnostics: is it "fewer but brighter" later?
        above10 = int((pm[yi] > 10).sum())
        med = float(np.median(pm[yi][nz])) if nz.any() else 0.0
        print(f"  {year}: tot={tot:,} | present={int(nz.sum()):,} | "
              f"median pm(present)={med:.2f} | words>10pm={above10:,}")

    p = OUT / "space_freq.bin"
    pm.tofile(p)
    print(f"\nwrote {p} ({pm.nbytes/1e6:.2f} MB, shape {pm.shape})")
    flat = pm.reshape(-1)
    pos = flat[flat > 0]
    for q in (50, 75, 90, 95, 99, 99.9):
        print(f"  pm pctile {q}: {np.percentile(pos, q):.2f}")
    print(f"  max pm: {flat.max():.0f}  (log10 range of positives: "
          f"{np.log10(pos.min()):.2f}..{np.log10(pos.max()):.2f})")


if __name__ == "__main__":
    main()
