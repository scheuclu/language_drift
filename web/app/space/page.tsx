"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadManifest } from "@/lib/data";
import { loadSpace, type SpaceData } from "@/lib/space";
import { STORIES } from "@/lib/stories";
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

// colour-axis endpoint colours (pole A -> pole B)
const AXIS_A_HEX = "#5dd5e8"; // cyan
const AXIS_B_HEX = "#ff5da2"; // pink

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

// one editable anchor word for the colour axis, with type-ahead over the vocab
function AxisPole({
  hex,
  word,
  words,
  onPick,
}: {
  hex: string;
  word: string;
  words: string[];
  onPick: (w: string) => void;
}) {
  const [q, setQ] = useState(word);
  const [open, setOpen] = useState(false);
  useEffect(() => setQ(word), [word]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const pre: string[] = [];
    const con: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === s || w.startsWith(s)) pre.push(w);
      else if (w.includes(s)) con.push(w);
      if (pre.length + con.length > 30) break;
    }
    return [...pre, ...con].slice(0, 6);
  }, [q, words]);
  const commit = (w: string) => {
    onPick(w);
    setQ(w);
    setOpen(false);
  };
  return (
    <div className="relative flex items-center gap-2">
      <span
        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: hex, boxShadow: `0 0 8px ${hex}` }}
      />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) commit(hits[0]);
          else if (e.key === "Escape") {
            setQ(word);
            setOpen(false);
          }
        }}
        spellCheck={false}
        autoComplete="off"
        className="flex-1 bg-black/35 border border-white/10 focus:border-accent/60 rounded px-2 py-1 text-xs font-mono text-foreground outline-none transition-colors"
      />
      {open && hits.length > 0 && (
        <div className="absolute left-5 top-full mt-1 z-40 w-36 backdrop-blur-md bg-black/80 border border-white/10 rounded overflow-hidden max-h-44 overflow-y-auto scrollbar-thin">
          {hits.map((w) => (
            <button
              key={w}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(w);
              }}
              className="block w-full text-left px-2 py-1 text-xs font-mono text-foreground/80 hover:bg-white/10 hover:text-foreground"
            >
              {w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [searchQ, setSearchQ] = useState("");
  const [colorMode, setColorMode] = useState<"off" | "axis" | "movement">("off");
  const [axisAWord, setAxisAWord] = useState("science");
  const [axisBWord, setAxisBWord] = useState("music");
  const [sheetOpen, setSheetOpen] = useState(false); // mobile control sheet
  const [copied, setCopied] = useState(false); // "copy link" feedback
  const playRef = useRef<number | null>(null);
  const hydrated = useRef(false); // guards URL-write until initial parse is done
  const desiredYear = useRef<number | null>(null); // year from URL, applied once data loads

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setError(String(e)));
    loadSpace().then((d) => {
      if (!d) setError("space data not available — run scripts/precompute_tsne.py");
      else setData(d);
    });
  }, []);

  // Hydrate from a shareable URL: ?mark=a,b,c&y=2025&color=axis&a=word&b=word
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const mark = sp.get("mark");
    if (mark) {
      const ws = mark
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (ws.length) setMarked(ws);
    }
    const color = sp.get("color");
    if (color === "off" || color === "axis" || color === "movement") setColorMode(color);
    const a = sp.get("a");
    if (a) setAxisAWord(a.toLowerCase());
    const b = sp.get("b");
    if (b) setAxisBWord(b.toLowerCase());
    const y = sp.get("y");
    if (y) desiredYear.current = parseInt(y, 10);
    hydrated.current = true;
  }, []);

  // Apply the URL's year once data (and thus the year list) is available.
  useEffect(() => {
    if (!data || desiredYear.current == null) return;
    const yi = data.index.years.indexOf(desiredYear.current);
    if (yi >= 0) setYearIndex(yi);
    desiredYear.current = null;
  }, [data]);

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

  // colour axis: map the two anchor words to indices + endpoint colours
  const axisColor = useMemo(() => {
    if (colorMode !== "axis" || !data) return null;
    const a = wordToIdx.get(axisAWord);
    const b = wordToIdx.get(axisBWord);
    if (a === undefined || b === undefined) return null;
    return {
      aIdx: a,
      bIdx: b,
      colA: hexToRgb(AXIS_A_HEX),
      colB: hexToRgb(AXIS_B_HEX),
    };
  }, [colorMode, data, wordToIdx, axisAWord, axisBWord]);

  // movement heat: per-word normalised year-over-year displacement for this year
  const movement = useMemo(() => {
    if (colorMode !== "movement" || !data) return null;
    const yi = yearIndex;
    const N = data.index.n_words;
    const out = new Float32Array(N);
    if (yi <= 0) return out; // first year has no "previous" to compare against
    const cur = data.coords[yi];
    const prev = data.coords[yi - 1];
    for (let i = 0; i < N; i++) {
      const dx = cur[i * 2] - prev[i * 2];
      const dy = cur[i * 2 + 1] - prev[i * 2 + 1];
      out[i] = Math.sqrt(dx * dx + dy * dy);
    }
    // log-scale between a low and high percentile so mid-range movers pick up
    // colour too, not just the top tail (movement is long-tailed)
    const sorted = Float32Array.from(out).sort();
    const eps = 1e-6;
    const dlo = sorted[Math.floor(0.4 * (N - 1))] + eps;
    const dhi = sorted[Math.floor(0.97 * (N - 1))] + eps;
    const lo = Math.log(dlo);
    const denom = Math.log(dhi) - lo > 1e-6 ? Math.log(dhi) - lo : 1;
    for (let i = 0; i < N; i++) {
      const u = (Math.log(out[i] + eps) - lo) / denom;
      out[i] = u < 0 ? 0 : u > 1 ? 1 : u;
    }
    return out;
  }, [colorMode, data, yearIndex]);

  // axis on: keep the user's pinned words AND add the two labelled poles on top
  const spaceMarkedIndices = axisColor
    ? [...markedIndices, axisColor.aIdx, axisColor.bIdx]
    : markedIndices;
  const spaceMarkedColors = axisColor
    ? [...markedColors, axisColor.colA, axisColor.colB]
    : markedColors;
  const spaceLabels = axisColor
    ? [...markedIndices.map(() => null), axisAWord, axisBWord]
    : undefined;

  const onToggleMark = (idx: number) => {
    if (!data) return;
    const w = data.index.words[idx];
    setMarked((prev) => (prev.includes(w) ? prev : [...prev, w]));
  };

  const onUnmark = (w: string) => {
    setMarked((prev) => prev.filter((x) => x !== w));
  };

  // search the space vocab to mark a word without hunting for it on the map
  const searchHits = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q || !data) return [];
    const words = data.index.words;
    const pre: string[] = [];
    const con: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === q || w.startsWith(q)) pre.push(w);
      else if (w.includes(q)) con.push(w);
      if (pre.length + con.length > 40) break;
    }
    return [...pre, ...con].slice(0, 8);
  }, [searchQ, data]);

  const addMark = (w: string) => {
    setMarked((prev) => (prev.includes(w) ? prev : [...prev, w]));
    setSearchQ("");
  };

  // load a curated story's word set + jump to the year it matters
  const pickStory = (storyId: string) => {
    const s = STORIES.find((x) => x.id === storyId);
    if (!s || !data) return;
    setMarked(s.words.map((w) => w.w));
    const yi = data.index.years.indexOf(s.snapYear);
    if (yi >= 0) {
      setPlaying(false);
      setYearIndex(yi);
    }
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

  // Keep the address bar in sync so any view is copy-pasteable / shareable.
  useEffect(() => {
    if (!hydrated.current) return;
    const sp = new URLSearchParams();
    if (marked.length) sp.set("mark", marked.join(","));
    if (currentYear !== undefined) sp.set("y", String(currentYear));
    if (colorMode !== "off") sp.set("color", colorMode);
    if (colorMode === "axis") {
      sp.set("a", axisAWord);
      sp.set("b", axisBWord);
    }
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [marked, currentYear, colorMode, axisAWord, axisBWord]);

  return (
    <main className="h-dvh w-full overflow-hidden relative bg-[#070707]">
      <div className="absolute inset-0">
        {data && manifest ? (
          <Space
            data={data}
            yearIndex={yearIndex}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
            markedIndices={spaceMarkedIndices}
            markedColors={spaceMarkedColors}
            highlightedMarkedIdx={hoveredChip}
            onToggleMark={onToggleMark}
            freqByYear={data.freqByYear}
            labels={spaceLabels}
            axisColor={axisColor}
            movement={movement}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
                <span className="w-2 h-2 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
              <span className="text-muted font-mono text-[11px] uppercase tracking-[0.22em]">
                {error ?? "charting the galaxy…"}
              </span>
            </div>
          </div>
        )}
      </div>

      <header className="absolute top-14 sm:top-16 left-5 sm:left-6 lg:left-10 max-w-[60vw] md:max-w-none pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-1.5">
          the space
        </div>
        <h1 className="font-display text-lg sm:text-2xl lg:text-3xl leading-tight sm:leading-none">
          <span className="md:hidden">
            <span className="text-gold-violet">{nWords.toLocaleString()}</span> words · 12 years
          </span>
          <span className="hidden md:inline">
            <span className="text-gold-violet">{nWords.toLocaleString()}</span> words. One
            UMAP. Twelve years.
          </span>
        </h1>
        <p className="hidden md:block text-foreground/55 text-xs mt-2 max-w-md leading-relaxed">
          Every word that survived the freq filter, projected from 300d to 2d
          jointly across all years. Drag to pan, scroll to zoom, click any
          point to pin. Scrub the year slider to watch the cloud breathe.
        </p>
      </header>

      {/* floating story bubbles — desktop only; click to load a curated word set */}
      {data && (
        <div className="hidden md:flex absolute top-16 right-6 lg:right-10 z-20 flex-col items-end gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono">
            load a story
          </div>
          <div className="flex flex-wrap justify-end gap-2 max-w-[52vw]">
            {STORIES.map((s, i) => (
              <motion.button
                key={s.id}
                onClick={() => pickStory(s.id)}
                title={s.title}
                animate={{ y: [0, -5, 0] }}
                transition={{
                  duration: 3 + (i % 4) * 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.25,
                }}
                className="px-3 py-1.5 rounded-full text-xs font-mono backdrop-blur-md bg-black/40 border border-white/12 text-foreground/75 hover:text-foreground hover:border-white/30 hover:bg-black/60 transition-colors"
              >
                {s.id}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* mobile: single "tune" button opens the control sheet */}
      {data && (
        <button
          onClick={() => setSheetOpen(true)}
          className="md:hidden absolute top-14 right-5 z-20 inline-flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-md bg-black/55 border border-white/15 text-[11px] font-mono uppercase tracking-wider text-foreground/85 active:bg-black/75"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="16" cy="7" r="2.4" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="17" r="2.4" stroke="currentColor" strokeWidth="2" />
          </svg>
          tune
          {markedVisible.length > 0 && (
            <span className="text-accent tabular-nums">{markedVisible.length}</span>
          )}
        </button>
      )}

      <div className="hidden md:block absolute left-6 lg:left-10 top-1/2 -translate-y-1/2 pointer-events-auto w-[180px]">
        <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
          marked
        </div>
        <div className="mb-2">
          <SearchBox
            value={searchQ}
            onChange={setSearchQ}
            hits={searchHits}
            onAdd={addMark}
          />
        </div>
        <MarkedList
          words={markedVisible}
          hex={markedHex}
          onUnmark={onUnmark}
          onHoverChip={setHoveredChip}
          className="max-h-[58vh] overflow-y-auto scrollbar-thin pr-1"
        />
      </div>

      {/* colour control — off / semantic axis / yearly movement (desktop) */}
      {data && (
        <div className="hidden md:block absolute bottom-6 left-6 z-20 w-[248px] backdrop-blur-md bg-black/45 border border-white/10 rounded-xl p-3 pointer-events-auto">
          <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
            colour by
          </div>
          <ColourControls
            colorMode={colorMode}
            setColorMode={setColorMode}
            words={data.index.words}
            axisAWord={axisAWord}
            setAxisAWord={setAxisAWord}
            axisBWord={axisBWord}
            setAxisBWord={setAxisBWord}
            yearIndex={yearIndex}
            years={years}
            currentYear={currentYear}
          />
        </div>
      )}

      {hoveredWord && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none backdrop-blur-md bg-black/55 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono">
          <span className="text-foreground">{hoveredWord}</span>
          {hoveredDrift !== undefined && (
            <span className="text-muted ml-3">drift {hoveredDrift.toFixed(2)}</span>
          )}
        </div>
      )}

      {data && (
        <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 w-[min(92vw,720px)] backdrop-blur-md bg-black/45 border border-white/10 rounded-xl px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="font-mono text-xs uppercase tracking-wider text-foreground/80 hover:text-accent transition-colors w-10 text-left shrink-0"
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
            className="flex-1 year-slider"
          />
          <span className="font-mono text-base tabular-nums text-foreground w-14 text-right shrink-0">
            {currentYear}
          </span>
          <span className="w-px h-5 bg-white/10 shrink-0" />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard blocked — the address bar already reflects the view */
              }
            }}
            className={`shrink-0 grid place-items-center w-8 h-8 rounded-md transition-colors ${
              copied ? "text-accent" : "text-foreground/70 hover:text-accent hover:bg-white/[0.06]"
            }`}
            title="copy a link to this exact view"
            aria-label="copy link to this view"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 13a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 11a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* mobile control sheet — all the desktop side panels in one swipe-up */}
      <AnimatePresence>
        {sheetOpen && data && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 z-30 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              className="md:hidden fixed inset-x-0 bottom-0 z-40 max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-white/12 bg-[#0b0c12]/95 backdrop-blur-xl px-4 pt-2.5 safe-pb"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="sticky top-0 -mx-4 px-4 pt-1 pb-2 bg-[#0b0c12]/95 backdrop-blur-xl">
                <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/25" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono">
                    controls
                  </span>
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="text-xs font-mono uppercase tracking-wider text-foreground/70 active:text-foreground px-2 py-1 -mr-2"
                  >
                    done
                  </button>
                </div>
              </div>

              <SheetLabel>mark a word</SheetLabel>
              <SearchBox
                value={searchQ}
                onChange={setSearchQ}
                hits={searchHits}
                onAdd={addMark}
              />

              <SheetLabel>load a story</SheetLabel>
              <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {STORIES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      pickStory(s.id);
                      setSheetOpen(false);
                    }}
                    title={s.title}
                    className="shrink-0 px-3 py-2 rounded-full text-xs font-mono bg-white/[0.05] border border-white/12 text-foreground/80 active:bg-white/15 transition-colors"
                  >
                    {s.id}
                  </button>
                ))}
              </div>

              <SheetLabel>colour by</SheetLabel>
              <ColourControls
                colorMode={colorMode}
                setColorMode={setColorMode}
                words={data.index.words}
                axisAWord={axisAWord}
                setAxisAWord={setAxisAWord}
                axisBWord={axisBWord}
                setAxisBWord={setAxisBWord}
                yearIndex={yearIndex}
                years={years}
                currentYear={currentYear}
              />

              <SheetLabel>marked · {markedVisible.length}</SheetLabel>
              <div className="pb-2">
                <MarkedList
                  words={markedVisible}
                  hex={markedHex}
                  onUnmark={onUnmark}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

/** Small uppercase section label, used inside the mobile control sheet. */
function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mt-4 mb-2">
      {children}
    </div>
  );
}

/** Type-ahead search that pins a word. Shared by the desktop rail + mobile sheet. */
function SearchBox({
  value,
  onChange,
  hits,
  onAdd,
}: {
  value: string;
  onChange: (v: string) => void;
  hits: string[];
  onAdd: (w: string) => void;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) onAdd(hits[0]);
          else if (e.key === "Escape") onChange("");
        }}
        placeholder="search a word…"
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-black/35 border border-white/10 focus:border-accent/60 rounded px-2 py-2 text-xs font-mono text-foreground outline-none placeholder:text-muted/60 transition-colors"
      />
      {hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 backdrop-blur-md bg-black/80 border border-white/10 rounded overflow-hidden max-h-52 overflow-y-auto scrollbar-thin">
          {hits.map((w) => (
            <button
              key={w}
              onClick={() => onAdd(w)}
              className="block w-full text-left px-2 py-2 text-xs font-mono text-foreground/80 hover:bg-white/10 hover:text-foreground transition-colors"
            >
              {w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The list of pinned words with colour swatch + remove. */
function MarkedList({
  words,
  hex,
  onUnmark,
  onHoverChip,
  className,
}: {
  words: string[];
  hex: string[];
  onUnmark: (w: string) => void;
  onHoverChip?: (i: number | null) => void;
  className?: string;
}) {
  if (words.length === 0) {
    return (
      <div className="text-[11px] text-muted/50 font-mono italic">
        tap any point to pin
      </div>
    );
  }
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      {words.map((w, i) => (
        <div
          key={w}
          onMouseEnter={onHoverChip ? () => onHoverChip(i) : undefined}
          onMouseLeave={onHoverChip ? () => onHoverChip(null) : undefined}
          className="group flex items-center gap-2 backdrop-blur-md bg-black/35 hover:bg-black/55 border border-white/10 rounded px-2 py-1.5 text-xs font-mono transition-colors"
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-[0_0_8px_currentColor]"
            style={{ background: hex[i], color: hex[i] }}
          />
          <Link
            href={`/w/${encodeURIComponent(w)}`}
            className="flex-1 text-foreground truncate hover:text-accent transition-colors"
            title={`open ${w} dossier`}
          >
            {w}
          </Link>
          <button
            onClick={() => onUnmark(w)}
            className="text-muted hover:text-foreground transition-colors leading-none w-6 h-6 -my-1 grid place-items-center text-sm opacity-60 group-hover:opacity-100"
            aria-label={`remove ${w}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Colour-mode tabs + axis/movement sub-controls. Shared by desktop + sheet. */
function ColourControls({
  colorMode,
  setColorMode,
  words,
  axisAWord,
  setAxisAWord,
  axisBWord,
  setAxisBWord,
  yearIndex,
  years,
  currentYear,
}: {
  colorMode: "off" | "axis" | "movement";
  setColorMode: (m: "off" | "axis" | "movement") => void;
  words: string[];
  axisAWord: string;
  setAxisAWord: (w: string) => void;
  axisBWord: string;
  setAxisBWord: (w: string) => void;
  yearIndex: number;
  years: number[];
  currentYear: number;
}) {
  return (
    <>
      <div className="flex gap-1">
        {(["off", "axis", "movement"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setColorMode(m)}
            className={`flex-1 px-2 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider border transition-colors ${
              colorMode === m
                ? "border-accent/60 text-foreground bg-white/[0.06]"
                : "border-white/10 text-muted hover:text-foreground hover:border-white/30"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {colorMode === "axis" && (
        <div className="flex flex-col gap-2 mt-3">
          <AxisPole hex={AXIS_A_HEX} word={axisAWord} words={words} onPick={setAxisAWord} />
          <div
            className="h-2 rounded-full mx-1"
            style={{
              background: `linear-gradient(90deg, ${AXIS_A_HEX}, #ffffff, ${AXIS_B_HEX})`,
            }}
          />
          <AxisPole hex={AXIS_B_HEX} word={axisBWord} words={words} onPick={setAxisBWord} />
          <p className="text-[10px] text-muted/60 font-mono mt-1 leading-snug">
            every star tinted by how close it sits to each word
          </p>
        </div>
      )}

      {colorMode === "movement" && (
        <div className="flex flex-col gap-2 mt-3">
          <div
            className="h-2 rounded-full mx-1"
            style={{
              background: "linear-gradient(90deg, #ffffff, #ffd25a, #ff4d3a)",
            }}
          />
          <div className="flex justify-between text-[10px] text-muted/70 font-mono px-1">
            <span>still</span>
            <span>moved most</span>
          </div>
          <p className="text-[10px] text-muted/60 font-mono mt-1 leading-snug">
            {yearIndex === 0
              ? "scrub the year forward to see what moved"
              : `each star tinted by how far it shifted from ${years[yearIndex - 1]} to ${currentYear}`}
          </p>
        </div>
      )}
    </>
  );
}
