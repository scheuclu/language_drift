"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadManifest } from "@/lib/data";
import { loadSpace, type SpaceData } from "@/lib/space";
import type { Manifest } from "@/lib/types";
import type { RGB } from "@/components/Space";

const MARK_PALETTE = [
  "#ffd45d",
  "#ff5da2",
  "#5dd5e8",
  "#a0ff5d",
  "#ff8a5d",
  "#c084ff",
  "#5dffd9",
  "#ff5d5d",
];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

const Space = dynamic(
  () => import("@/components/Space").then((m) => m.Space),
  { ssr: false },
);

const PLAY_MS_PER_YEAR = 900;

export default function SpacePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [data, setData] = useState<SpaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearIndex, setYearIndex] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [marked, setMarked] = useState<string[]>([
    "nft",
    "crypto",
    "lockdown",
    "zoom",
    "distancing",
    "pandemic",
  ]);
  const [playing, setPlaying] = useState(false);
  const [hoveredChip, setHoveredChip] = useState<number | null>(null);
  const playRef = useRef<number | null>(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setError(String(e)));
    loadSpace().then((d) => {
      if (!d) setError("space data not available — run scripts/precompute_tsne.py");
      else setData(d);
    });
  }, []);

  const driftByWord = useMemo(() => {
    const m = new Map<string, number>();
    if (manifest) for (const w of manifest.words) m.set(w.w, w.d);
    return m;
  }, [manifest]);

  const wordToIdx = useMemo(() => {
    const m = new Map<string, number>();
    if (data) data.index.words.forEach((w, i) => m.set(w, i));
    return m;
  }, [data]);

  const { markedIndices, markedColors, markedHex, markedVisible } = useMemo(() => {
    const ids: number[] = [];
    const cols: RGB[] = [];
    const hex: string[] = [];
    const vis: string[] = [];
    for (let i = 0; i < marked.length; i++) {
      const w = marked[i];
      const idx = wordToIdx.get(w);
      if (idx === undefined) continue;
      const h = MARK_PALETTE[i % MARK_PALETTE.length];
      ids.push(idx);
      cols.push(hexToRgb(h));
      hex.push(h);
      vis.push(w);
    }
    return { markedIndices: ids, markedColors: cols, markedHex: hex, markedVisible: vis };
  }, [marked, wordToIdx]);

  const onToggleMark = (idx: number) => {
    if (!data) return;
    const w = data.index.words[idx];
    setMarked((prev) => (prev.includes(w) ? prev : [...prev, w]));
  };

  const onUnmark = (w: string) => {
    setMarked((prev) => prev.filter((x) => x !== w));
  };

  useEffect(() => {
    if (!playing || !data) return;
    const tick = () => {
      setYearIndex((yi) => {
        const next = yi + 1;
        if (next >= data.index.years.length) {
          setPlaying(false);
          return yi;
        }
        return next;
      });
      playRef.current = window.setTimeout(tick, PLAY_MS_PER_YEAR);
    };
    playRef.current = window.setTimeout(tick, PLAY_MS_PER_YEAR);
    return () => {
      if (playRef.current !== null) window.clearTimeout(playRef.current);
    };
  }, [playing, data]);

  const years = data?.index.years ?? [];
  const currentYear = years[yearIndex];
  const hoveredWord = data && hoveredIdx !== null ? data.index.words[hoveredIdx] : null;
  const hoveredDrift = hoveredWord ? driftByWord.get(hoveredWord) : undefined;
  const nWords = data?.index.n_words ?? 0;

  return (
    <main className="h-screen w-screen overflow-hidden relative bg-[#070707]">
      <div className="absolute inset-0">
        {data && manifest ? (
          <Space
            data={data}
            yearIndex={yearIndex}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
            markedIndices={markedIndices}
            markedColors={markedColors}
            highlightedMarkedIdx={hoveredChip}
            onToggleMark={onToggleMark}
            freqByYear={data.freqByYear}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted text-sm font-mono">
            {error ?? "loading projection…"}
          </div>
        )}
      </div>

      <header className="absolute top-16 left-6 lg:left-10 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-mono mb-1">
          space
        </div>
        <h1 className="font-display text-2xl lg:text-3xl leading-none">
          {nWords.toLocaleString()} words. One UMAP. Twelve years.
        </h1>
        <p className="text-foreground/55 text-xs mt-2 max-w-md leading-relaxed">
          Every word that survived the freq filter, projected from 300d to 2d
          jointly across all years. Drag to pan, scroll to zoom, click any
          point to pin. Scrub the year slider to watch the cloud breathe.
        </p>
      </header>

      <div className="absolute left-6 lg:left-10 top-1/2 -translate-y-1/2 pointer-events-auto max-w-[180px]">
        <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
          marked
        </div>
        {markedVisible.length === 0 ? (
          <div className="text-[11px] text-muted/50 font-mono italic">
            click any point to pin
          </div>
        ) : (
          <div className="space-y-1">
            {markedVisible.map((w, i) => (
              <div
                key={w}
                onMouseEnter={() => setHoveredChip(i)}
                onMouseLeave={() => setHoveredChip(null)}
                className="group flex items-center gap-2 backdrop-blur-md bg-black/35 hover:bg-black/55 border border-white/10 rounded px-2 py-1 text-xs font-mono transition-colors"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-[0_0_8px_currentColor]"
                  style={{ background: markedHex[i], color: markedHex[i] }}
                />
                <span className="flex-1 text-foreground truncate">{w}</span>
                <button
                  onClick={() => onUnmark(w)}
                  className="text-muted hover:text-foreground transition-colors leading-none w-3.5 h-3.5 grid place-items-center opacity-50 group-hover:opacity-100"
                  aria-label={`remove ${w}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {hoveredWord && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none backdrop-blur-md bg-black/55 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono">
          <span className="text-foreground">{hoveredWord}</span>
          {hoveredDrift !== undefined && (
            <span className="text-muted ml-3">drift {hoveredDrift.toFixed(2)}</span>
          )}
        </div>
      )}

      {data && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[min(80vw,720px)] backdrop-blur-md bg-black/45 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="font-mono text-xs uppercase tracking-wider text-foreground/80 hover:text-accent transition-colors w-10 text-left"
          >
            {playing ? "pause" : "play"}
          </button>
          <input
            type="range"
            min={0}
            max={years.length - 1}
            step={1}
            value={yearIndex}
            onChange={(e) => {
              setPlaying(false);
              setYearIndex(parseInt(e.target.value, 10));
            }}
            className="flex-1 accent-accent"
          />
          <span className="font-mono text-base tabular-nums text-foreground w-14 text-right">
            {currentYear}
          </span>
        </div>
      )}
    </main>
  );
}
