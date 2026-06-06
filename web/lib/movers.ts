import type { Manifest, ManifestWord } from "./types";

// "Notable movers" = common words that drifted the most. Sorting purely by drift
// surfaces low-frequency noise (typos, names, merged tokens like "ofthe"), so
// first gate on a frequency floor (top decile by last-year usage), then rank by
// total drift. This is the genuinely interesting "what changed" signal.
export function notableMovers(manifest: Manifest, n = 16): ManifestWord[] {
  const ws = manifest.words;
  const fms = ws.map((w) => w.fm).sort((a, b) => a - b);
  const floor = fms[Math.floor(0.9 * (fms.length - 1))] ?? 0;
  return ws
    .filter((w) => w.fm >= floor)
    .sort((a, b) => b.d - a.d)
    .slice(0, n);
}
