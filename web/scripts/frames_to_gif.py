"""Combine /tmp/space_frames/f###.png into a GIF.

Resizes for size, uses palette mode for the kind of dark scene we have.
"""
import glob
import sys
from pathlib import Path

from PIL import Image

FRAMES_DIR = "/tmp/space_frames"
OUT_PATH = Path(__file__).resolve().parent.parent.parent / "docs" / "img" / "space.gif"
FRAME_MS = 120  # per-frame duration
TARGET_WIDTH = 800


def main() -> None:
    paths = sorted(glob.glob(f"{FRAMES_DIR}/f*.png"))
    if not paths:
        print(f"no frames found in {FRAMES_DIR}", file=sys.stderr)
        sys.exit(1)
    print(f"loading {len(paths)} frames")

    frames = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        w, h = im.size
        new_h = round(h * TARGET_WIDTH / w)
        im = im.resize((TARGET_WIDTH, new_h), Image.LANCZOS)
        # convert to palette for smaller GIF
        im = im.quantize(colors=128, dither=Image.FLOYDSTEINBERG)
        frames.append(im)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        OUT_PATH,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_mb = OUT_PATH.stat().st_size / 1e6
    print(f"wrote {OUT_PATH} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
