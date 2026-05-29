"use client";

import { useEffect, useRef } from "react";

type Props = {
  years: number[];
  index: number;
  setIndex: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
};

export function YearScrubber({
  years,
  index,
  setIndex,
  playing,
  setPlaying,
}: Props) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      setIndex((index + 1) % years.length);
    }, 1400);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playing, index, years.length, setIndex]);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => setPlaying(!playing)}
        className="btn-ghost"
        aria-label={playing ? "pause" : "play through years"}
      >
        {playing ? (
          <>
            <span className="w-2 h-3 bg-foreground/80 rounded-sm" />
            <span>pause</span>
          </>
        ) : (
          <>
            <span
              className="w-0 h-0"
              style={{
                borderLeft: "8px solid currentColor",
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
              }}
            />
            <span>play 2014–2025</span>
          </>
        )}
      </button>
      <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md">
        {years.map((y, i) => (
          <button
            key={y}
            onClick={() => {
              setIndex(i);
              setPlaying(false);
            }}
            className={`px-2 py-1 rounded-md text-xs font-mono tabular-nums transition-all ${
              i === index
                ? "bg-accent text-black"
                : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}
