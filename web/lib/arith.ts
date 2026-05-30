// Loader for the stacked aligned-embedding corpus used by /arith.
// Single year (latest), float32, [N, 300].
//
// Word order matches space_index.json — we reuse that index so we don't
// double-ship the word list.

import { DATA_BASE } from "./data-source";

const DIM = 300;

export type ArithCorpus = {
  words: string[];
  wordToIdx: Map<string, number>;
  // Row-normalized so cosine similarity = dot product against query.
  vecsNormalized: Float32Array; // length N * DIM
  n: number;
};

let cache: Promise<ArithCorpus | null> | null = null;

export function loadArithCorpus(): Promise<ArithCorpus | null> {
  if (cache) return cache;
  cache = (async () => {
    try {
      const [idxRes, binRes] = await Promise.all([
        fetch(`${DATA_BASE}/space_index.json`),
        fetch(`${DATA_BASE}/arith.bin`),
      ]);
      if (!idxRes.ok || !binRes.ok) return null;
      const idx = (await idxRes.json()) as { words: string[] };
      const buf = await binRes.arrayBuffer();
      const words = idx.words;
      const n = words.length;
      const expectedBytes = n * DIM * 4;
      if (buf.byteLength !== expectedBytes) {
        console.warn(
          `arith.bin size mismatch: got ${buf.byteLength}, expected ${expectedBytes}`,
        );
        return null;
      }
      const vecs = new Float32Array(buf);
      // Normalize each row in place.
      const out = new Float32Array(vecs.length);
      for (let i = 0; i < n; i++) {
        let sq = 0;
        const off = i * DIM;
        for (let d = 0; d < DIM; d++) sq += vecs[off + d] * vecs[off + d];
        const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0;
        for (let d = 0; d < DIM; d++) out[off + d] = vecs[off + d] * inv;
      }
      const wordToIdx = new Map<string, number>();
      for (let i = 0; i < n; i++) wordToIdx.set(words[i], i);
      return { words, wordToIdx, vecsNormalized: out, n };
    } catch (e) {
      console.warn("loadArithCorpus failed", e);
      return null;
    }
  })();
  return cache;
}

export type Term = { sign: 1 | -1; word: string };

export type ArithResult = { word: string; sim: number };

// Compute nearest neighbors to sum(sign * vec(word)).
// Excludes the input words from the result.
// Returns top-K by cosine similarity (already normalized, so cosine = dot).
export function arithmeticTopK(
  terms: Term[],
  corpus: ArithCorpus,
  k: number,
): ArithResult[] | null {
  const query = new Float32Array(DIM);
  let any = false;
  for (const t of terms) {
    const idx = corpus.wordToIdx.get(t.word.toLowerCase());
    if (idx === undefined) continue;
    any = true;
    const off = idx * DIM;
    // Use the un-normalized magnitude implicitly captured in the normalized
    // vector multiplied by the original norm? No — we *do* want normalized
    // terms so that one frequent word doesn't dominate. Use normalized rows.
    for (let d = 0; d < DIM; d++) query[d] += t.sign * corpus.vecsNormalized[off + d];
  }
  if (!any) return null;
  // Normalize query.
  let sq = 0;
  for (let d = 0; d < DIM; d++) sq += query[d] * query[d];
  const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0;
  if (inv === 0) return null;
  for (let d = 0; d < DIM; d++) query[d] *= inv;

  // Dot against every row.
  const sims = new Float32Array(corpus.n);
  for (let i = 0; i < corpus.n; i++) {
    let s = 0;
    const off = i * DIM;
    for (let d = 0; d < DIM; d++) s += corpus.vecsNormalized[off + d] * query[d];
    sims[i] = s;
  }
  // Exclude input words.
  for (const t of terms) {
    const idx = corpus.wordToIdx.get(t.word.toLowerCase());
    if (idx !== undefined) sims[idx] = -2;
  }
  // Top-K via partial sort.
  const top: { i: number; s: number }[] = [];
  for (let i = 0; i < sims.length; i++) {
    const s = sims[i];
    if (top.length < k) {
      top.push({ i, s });
      if (top.length === k) top.sort((a, b) => b.s - a.s);
    } else if (s > top[k - 1].s) {
      // Insert sorted.
      let pos = k - 1;
      while (pos > 0 && top[pos - 1].s < s) {
        top[pos] = top[pos - 1];
        pos--;
      }
      top[pos] = { i, s };
    }
  }
  return top.map((t) => ({ word: corpus.words[t.i], sim: t.s }));
}
