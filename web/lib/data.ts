import type { Manifest, WordData, DriftGallery } from "./types";
import { DATA_BASE } from "./data-source";

let manifestCache: Manifest | null = null;
const wordCache = new Map<string, WordData>();

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch(`${DATA_BASE}/manifest.json`);
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  manifestCache = await res.json();
  return manifestCache!;
}

// Per-word neighbor shards are packed into one neighbors.bin; this index maps
// word -> [byteOffset, byteLength] so we Range-fetch a single shard.
let neighborsIndex: Promise<Record<string, [number, number]>> | null = null;
function loadNeighborsIndex() {
  if (!neighborsIndex) {
    neighborsIndex = fetch(`${DATA_BASE}/neighbors_index.json`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load neighbors index: ${r.status}`);
      return r.json();
    });
  }
  return neighborsIndex;
}

export async function loadWord(word: string): Promise<WordData | null> {
  const key = word.toLowerCase();
  const cached = wordCache.get(key);
  if (cached) return cached;
  try {
    const ent = (await loadNeighborsIndex())[key];
    if (!ent) return null;
    const [off, len] = ent;
    const res = await fetch(`${DATA_BASE}/neighbors.bin`, {
      headers: { Range: `bytes=${off}-${off + len - 1}` },
    });
    if (!res.ok) return null; // 200 or 206
    const data = (await res.json()) as WordData;
    wordCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

export async function loadGallery(): Promise<DriftGallery> {
  const res = await fetch(`${DATA_BASE}/drift_gallery.json`);
  if (!res.ok) throw new Error(`Failed to load gallery: ${res.status}`);
  return res.json();
}
