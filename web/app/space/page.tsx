"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
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

// quick-pick colour axes — evocative pairs found by scanning the whole vocab for
// map separation (antonyms collapse together; topical contrasts spread apart).
const AXIS_PRESETS: { a: string; b: string }[] = [
  { a: "home", b: "work" },
  { a: "physical", b: "digital" },
  { a: "food", b: "war" },
  { a: "body", b: "mind" },
  { a: "health", b: "money" },
  { a: "science", b: "music" },
];

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
    // load the story's colour axis so the map tints along its semantic axis
    if (s.axis) {
      setAxisAWord(s.axis[0]);
      setAxisBWord(s.axis[1]);
      setColorMode("axis");
    }
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

  return (
    <main className="h-screen w-screen overflow-hidden relative bg-[#070707]">
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

      {/* floating story bubbles — click to load that curated word set */}
      {data && (
        <div className="absolute top-16 right-6 lg:right-10 z-20 flex flex-col items-end gap-2">
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

      <div className="absolute left-6 lg:left-10 top-1/2 -translate-y-1/2 pointer-events-auto w-[180px]">
        <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
          marked
        </div>

        {/* search to mark a word without finding it on the map */}
        <div className="relative mb-2">
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchHits[0]) addMark(searchHits[0]);
              else if (e.key === "Escape") setSearchQ("");
            }}
            placeholder="search a word…"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-black/35 border border-white/10 focus:border-accent/60 rounded px-2 py-1.5 text-xs font-mono text-foreground outline-none placeholder:text-muted/60 transition-colors"
          />
          {searchHits.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 backdrop-blur-md bg-black/70 border border-white/10 rounded overflow-hidden max-h-52 overflow-y-auto scrollbar-thin">
              {searchHits.map((w) => (
                <button
                  key={w}
                  onClick={() => addMark(w)}
                  className="block w-full text-left px-2 py-1 text-xs font-mono text-foreground/80 hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  {w}
                </button>
              ))}
            </div>
          )}
        </div>
        {markedVisible.length === 0 ? (
          <div className="text-[11px] text-muted/50 font-mono italic">
            click any point to pin
          </div>
        ) : (
          <div className="space-y-1 max-h-[58vh] overflow-y-auto scrollbar-thin pr-1">
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

      {/* colour control — off / semantic axis / yearly movement */}
      {data && (
        <div className="absolute bottom-6 left-6 z-20 w-[248px] backdrop-blur-md bg-black/45 border border-white/10 rounded-xl p-3 pointer-events-auto">
          <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
            colour by
          </div>
          <div className="flex gap-1">
            {(["off", "axis", "movement"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setColorMode(m)}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border transition-colors ${
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
              <AxisPole
                hex={AXIS_A_HEX}
                word={axisAWord}
                words={data.index.words}
                onPick={setAxisAWord}
              />
              <div
                className="h-2 rounded-full mx-1"
                style={{
                  background: `linear-gradient(90deg, ${AXIS_A_HEX}, #ffffff, ${AXIS_B_HEX})`,
                }}
              />
              <AxisPole
                hex={AXIS_B_HEX}
                word={axisBWord}
                words={data.index.words}
                onPick={setAxisBWord}
              />
              <p className="text-[10px] text-muted/60 font-mono mt-1 leading-snug">
                every star tinted by how close it sits to each word
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/10">
                {AXIS_PRESETS.map((p) => {
                  const active = axisAWord === p.a && axisBWord === p.b;
                  return (
                    <button
                      key={`${p.a}-${p.b}`}
                      onClick={() => {
                        setAxisAWord(p.a);
                        setAxisBWord(p.b);
                        setColorMode("axis");
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${
                        active
                          ? "border-accent/60 text-foreground bg-white/[0.06]"
                          : "border-white/10 text-muted hover:text-foreground hover:border-white/30"
                      }`}
                    >
                      {p.a}·{p.b}
                    </button>
                  );
                })}
              </div>
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
