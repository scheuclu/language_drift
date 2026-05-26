// 12 years × 300 dims, C-order float32 = 14400 bytes
const DIM = 300;
const N_YEARS = 12;
const FILE_BYTES = N_YEARS * DIM * 4;

export type YearVecs = Float32Array; // length N_YEARS * DIM

const cache = new Map<string, YearVecs>();
const inflight = new Map<string, Promise<YearVecs | null>>();

export async function loadVectors(word: string): Promise<YearVecs | null> {
  const key = word.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetch(`/data/vecs/${encodeURIComponent(key)}.bin`);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== FILE_BYTES) {
        console.warn(`unexpected vector file size for "${key}": ${buf.byteLength}`);
        return null;
      }
      const arr = new Float32Array(buf);
      cache.set(key, arr);
      return arr;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function yearVec(vecs: YearVecs, yi: number): Float32Array {
  return vecs.subarray(yi * DIM, (yi + 1) * DIM);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export const VECTOR_N_YEARS = N_YEARS;
export const VECTOR_DIM = DIM;
