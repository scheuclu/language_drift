export type SpaceIndex = {
  words: string[];
  years: number[];
  n_words: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
};

export type SpaceData = {
  index: SpaceIndex;
  // coords[yi] is a Float32Array of length n_words * 3
  coords: Float32Array[];
};

let spaceCache: Promise<SpaceData | null> | null = null;

export function loadSpace(): Promise<SpaceData | null> {
  if (spaceCache) return spaceCache;
  spaceCache = (async () => {
    try {
      const [idxRes, binRes] = await Promise.all([
        fetch("/data/space_index.json"),
        fetch("/data/space.bin"),
      ]);
      if (!idxRes.ok || !binRes.ok) return null;
      const index = (await idxRes.json()) as SpaceIndex;
      const buf = await binRes.arrayBuffer();
      const n = index.n_words;
      const all = new Float32Array(buf);
      const expectedLen = index.years.length * n * 3;
      if (all.length !== expectedLen) {
        console.warn(
          `space.bin length mismatch: got ${all.length}, expected ${expectedLen}`,
        );
        return null;
      }
      const coords: Float32Array[] = [];
      for (let yi = 0; yi < index.years.length; yi++) {
        coords.push(all.subarray(yi * n * 3, (yi + 1) * n * 3));
      }
      return { index, coords };
    } catch (e) {
      console.warn("loadSpace failed", e);
      return null;
    }
  })();
  return spaceCache;
}
