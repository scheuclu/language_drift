import type { Manifest, WordData, DriftGallery } from "./types";

let manifestCache: Manifest | null = null;
const wordCache = new Map<string, WordData>();

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch("/data/manifest.json");
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  manifestCache = await res.json();
  return manifestCache!;
}

export async function loadWord(word: string): Promise<WordData | null> {
  const key = word.toLowerCase();
  const cached = wordCache.get(key);
  if (cached) return cached;
  const res = await fetch(`/data/w/${encodeURIComponent(key)}.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as WordData;
  wordCache.set(key, data);
  return data;
}

export async function loadGallery(): Promise<DriftGallery> {
  const res = await fetch("/data/drift_gallery.json");
  if (!res.ok) throw new Error(`Failed to load gallery: ${res.status}`);
  return res.json();
}
