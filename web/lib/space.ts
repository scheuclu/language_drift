import { DATA_BASE } from "./data-source";

export type SpaceIndex = {
  words: string[];
  years: number[];
  n_words: number;
  bbox: { min: [number, number]; max: [number, number] };
};

export type SpaceData = {
  index: SpaceIndex;
  // coords[yi] is a Float32Array of length n_words * 2
  coords: Float32Array[];
  // freqByYear[yi][wordIdx] = per-million frequency that year (optional — absent
  // on older data versions). Used to brighten points by how common a word was.
  freqByYear?: Float32Array[];
};

let cache: Promise<SpaceData | null> | null = null;

export function loadSpace(): Promise<SpaceData | null> {
  if (cache) return cache;
  cache = (async () => {
    try {
      const [idxRes, binRes] = await Promise.all([
        fetch(`${DATA_BASE}/space_index.json`),
        fetch(`${DATA_BASE}/space.bin`),
      ]);
      if (!idxRes.ok || !binRes.ok) return null;
      const index = (await idxRes.json()) as SpaceIndex;
      const buf = await binRes.arrayBuffer();
      const n = index.n_words;
      const all = new Float32Array(buf);
      const expectedLen = index.years.length * n * 2;
      if (all.length !== expectedLen) {
        console.warn(
          `space.bin length mismatch: got ${all.length}, expected ${expectedLen}`,
        );
        return null;
      }
      const coords: Float32Array[] = [];
      for (let yi = 0; yi < index.years.length; yi++) {
        coords.push(all.subarray(yi * n * 2, (yi + 1) * n * 2));
      }

      // optional per-year per-million frequencies (year-major [years, n])
      let freqByYear: Float32Array[] | undefined;
      try {
        const fRes = await fetch(`${DATA_BASE}/space_freq.bin`);
        if (fRes.ok) {
          const fAll = new Float32Array(await fRes.arrayBuffer());
          if (fAll.length === index.years.length * n) {
            freqByYear = [];
            for (let yi = 0; yi < index.years.length; yi++) {
              freqByYear.push(fAll.subarray(yi * n, (yi + 1) * n));
            }
          }
        }
      } catch {
        /* older data version without frequencies — fall back to uniform */
      }

      return { index, coords, freqByYear };
    } catch (e) {
      console.warn("loadSpace failed", e);
      return null;
    }
  })();
  return cache;
}
