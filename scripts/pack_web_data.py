"""Pack the per-word web data into single range-served files for Blob hosting.

  vecs/*.bin  ->  packed/vecs.bin        (space_index order, fixed 14400-byte stride)
  w/*.json    ->  packed/neighbors.bin   (concatenated) + neighbors_index.json {word:[offset,len]}

Row order for vecs.bin == space_index.json["words"], so the client maps word->row
via space_index and Range-fetches one 14400-byte slice. Neighbors are variable
length, hence the explicit {word:[offset,len]} index.

Run after the precompute_* scripts; then upload packed/ + manifest/arith/space to
Blob under data/vN/.
"""
import json
from pathlib import Path

WD = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
STRIDE = 12 * 300 * 4  # 14,400 bytes per word (12 years x 300 dims x float32)


def main():
    words = json.load(open(WD / "space_index.json"))["words"]
    out = WD / "packed"
    out.mkdir(exist_ok=True)

    # --- vecs.bin (fixed stride, space_index order) ---
    with open(out / "vecs.bin", "wb") as f:
        for w in words:
            b = (WD / "vecs" / f"{w}.bin").read_bytes()
            assert len(b) == STRIDE, f"{w}: {len(b)} != {STRIDE}"
            f.write(b)
    vsz = (out / "vecs.bin").stat().st_size
    print(f"vecs.bin: {vsz:,} bytes ({len(words)} x {STRIDE})  ok={vsz == len(words) * STRIDE}")

    # --- neighbors.bin + index (variable length) ---
    idx = {}
    off = 0
    with open(out / "neighbors.bin", "wb") as f:
        for w in words:
            b = (WD / "w" / f"{w}.json").read_bytes()
            f.write(b)
            idx[w] = [off, len(b)]
            off += len(b)
    json.dump(idx, open(out / "neighbors_index.json", "w"), separators=(",", ":"))
    isz = (out / "neighbors_index.json").stat().st_size
    print(f"neighbors.bin: {off:,} bytes, {len(idx)} words | index {isz:,} bytes")


if __name__ == "__main__":
    main()
