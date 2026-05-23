"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { WordData } from "@/lib/types";

type Props = {
  data: WordData;
  yearIndex: number;
  showCount?: number;
  onSelect?: (word: string) => void;
  freqByWord?: Map<string, number>;
  minFreq?: number;
};

type Track = {
  word: string;
  sims: (number | null)[];
  angle: number;
  maxSim: number;
};

const OFFSCREEN_R = 1.18;
const R_INNER = 0.22;
const R_OUTER = 0.92;
const TRANSITION = { duration: 0.9, ease: [0.4, 0, 0.2, 1] as const };

export function Constellation({
  data,
  yearIndex,
  showCount = 12,
  onSelect,
  freqByWord,
  minFreq = 0,
}: Props) {
  const year = data.y[yearIndex];

  const tracks = useMemo<Track[]>(() => {
    const passes = (w: string) =>
      !freqByWord || minFreq <= 0 || (freqByWord.get(w) ?? 0) >= minFreq;

    const map = new Map<string, (number | null)[]>();
    const yearCount = data.n.length;
    for (let yi = 0; yi < yearCount; yi++) {
      // Filter noise BEFORE truncating to showCount so we get `showCount` real neighbors.
      const filtered = data.n[yi].filter(([w]) => passes(w)).slice(0, showCount);
      for (const [w, s] of filtered) {
        if (!map.has(w)) map.set(w, new Array(yearCount).fill(null));
        map.get(w)![yi] = s;
      }
    }
    const entries = Array.from(map.entries()).map(([word, sims]) => ({
      word,
      sims,
      maxSim: sims.reduce<number>((m, s) => (s !== null && s > m ? s : m), 0),
    }));
    entries.sort((a, b) =>
      b.maxSim !== a.maxSim ? b.maxSim - a.maxSim : a.word.localeCompare(b.word),
    );
    const n = entries.length;
    return entries.map((e, i) => ({ ...e, angle: (i / n) * 2 * Math.PI }));
  }, [data, showCount, freqByWord, minFreq]);

  const items = tracks.map(({ word, sims, angle, maxSim }) => {
    const sim = sims[yearIndex];
    const active = sim !== null;
    const r = active ? R_INNER + (1 - sim!) * (R_OUTER - R_INNER) : OFFSCREEN_R;
    return {
      word,
      sim: active ? sim! : 0,
      active,
      maxSim,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
    };
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[min(95vmin,1200px)] aspect-square relative">
          {[0.35, 0.55, 0.78].map((r, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white/[0.05]"
              style={{ inset: `${(1 - r) * 50}%` }}
            />
          ))}

          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="-1 -1 2 2"
            preserveAspectRatio="xMidYMid meet"
          >
            {items.map(({ word, sim, active, x, y }) => (
              <motion.line
                key={word + "-line"}
                initial={false}
                animate={{
                  x2: x,
                  y2: y,
                  opacity: active ? 0.12 + sim * 0.45 : 0,
                }}
                transition={TRANSITION}
                x1={0}
                y1={0}
                stroke="rgba(244,184,96,0.9)"
                strokeWidth={0.0015}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 0 }}
          >
            <motion.div
              initial={false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="focal-word text-[clamp(72px,11vw,200px)] text-foreground"
              style={{
                textShadow:
                  "0 0 80px rgba(244,184,96,0.4), 0 0 30px rgba(244,184,96,0.5)",
              }}
            >
              {data.w}
            </motion.div>
          </div>

          {items.map(({ word, sim, active, x, y }) => {
            const opacity = active ? Math.max(0.55, sim) : 0;
            const size = 0.85 + (active ? sim : 0) * 0.6;
            const left = `${50 + x * 50}%`;
            const top = `${50 + y * 50}%`;
            const clickable = active && !!onSelect;
            return (
              <motion.button
                key={word}
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => onSelect!(word) : undefined}
                className="absolute group focus:outline-none"
                style={{
                  fontSize: `${size}rem`,
                  x: "-50%",
                  y: "-50%",
                  zIndex: 10,
                  pointerEvents: active ? "auto" : "none",
                  cursor: clickable ? "pointer" : "default",
                }}
                initial={false}
                animate={{ left, top, opacity }}
                whileHover={clickable ? { scale: 1.18, zIndex: 50 } : undefined}
                transition={TRANSITION}
              >
                <span className="node-label bg-white/[0.04] border border-white/[0.08] text-foreground/85 font-mono tracking-tight whitespace-nowrap group-hover:bg-accent group-hover:text-black group-hover:border-accent group-hover:shadow-[0_0_30px_rgba(244,184,96,0.35)] transition-colors">
                  {word}
                  <span className="ml-1.5 text-foreground/35 text-[0.7em] tabular-nums group-hover:text-black/55">
                    {active ? sim.toFixed(2) : ""}
                  </span>
                </span>
              </motion.button>
            );
          })}

          <div className="absolute -top-2 right-0 font-mono text-muted text-sm tabular-nums pointer-events-none">
            {year}
          </div>
        </div>
      </div>
    </div>
  );
}
