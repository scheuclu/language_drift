"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadManifest } from "@/lib/data";
import { loadSpace, type SpaceData } from "@/lib/space";
import type { Manifest } from "@/lib/types";

const Space3D = dynamic(
  () => import("@/components/Space3D").then((m) => m.Space3D),
  { ssr: false },
);

const PLAY_MS_PER_YEAR = 900;

export default function SpacePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [data, setData] = useState<SpaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearIndex, setYearIndex] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
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

  // Year playback loop.
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

  return (
    <main className="h-screen w-screen overflow-hidden relative bg-[#070707]">
      {/* canvas fills the screen */}
      <div className="absolute inset-0">
        {data && manifest ? (
          <Space3D
            data={data}
            driftByWord={driftByWord}
            yearIndex={yearIndex}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted text-sm font-mono">
            {error ?? "loading 19,663 points · 13 years…"}
          </div>
        )}
      </div>

      {/* top overlay */}
      <header className="absolute top-16 left-6 lg:left-10 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-mono mb-1">
          space
        </div>
        <h1 className="font-display text-2xl lg:text-3xl leading-none">
          19,663 words. One UMAP. Thirteen years.
        </h1>
        <p className="text-foreground/55 text-xs mt-2 max-w-md leading-relaxed">
          Every word that survived the freq filter, projected from 300d to 3d
          jointly across all years. Drag to orbit. Scroll the year slider to
          watch the cloud breathe.
        </p>
      </header>

      {/* color legend */}
      <div className="absolute top-16 right-6 lg:right-10 pointer-events-none text-[10px] font-mono text-foreground/65">
        <div className="uppercase tracking-widest text-muted mb-1">drift</div>
        <div
          className="w-32 h-2 rounded-full"
          style={{
            background:
              "linear-gradient(to right, rgb(51,128,255), rgb(242,255,51), rgb(255,89,179))",
          }}
        />
        <div className="flex justify-between mt-1 text-foreground/40">
          <span>stable</span>
          <span>drifter</span>
        </div>
      </div>

      {/* hover card */}
      {hoveredWord && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none backdrop-blur-md bg-black/55 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono">
          <span className="text-foreground">{hoveredWord}</span>
          {hoveredDrift !== undefined && (
            <span className="text-muted ml-3">drift {hoveredDrift.toFixed(2)}</span>
          )}
        </div>
      )}

      {/* year scrubber */}
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
