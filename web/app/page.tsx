"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadSpace, type SpaceData } from "@/lib/space";
import { STORIES, ROLE_COLOR } from "@/lib/stories";
import type { RGB } from "@/components/Space";

const Space = dynamic(() => import("@/components/Space").then((m) => m.Space), {
  ssr: false,
});

const PLAY_MS_PER_YEAR = 850;

const HERO_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.16, delayChildren: 0.1 } },
};
const HERO_ITEM: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: "easeOut" },
  },
};

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export default function LandingPage() {
  const [data, setData] = useState<SpaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storyIdx, setStoryIdx] = useState(0);
  const [yearIndex, setYearIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dragged, setDragged] = useState(false);
  const [tour, setTour] = useState(false);
  const tourRef = useRef(tour);
  tourRef.current = tour;
  const playRef = useRef<number | null>(null);

  useEffect(() => {
    loadSpace().then((d) => {
      if (!d) setError("space data unavailable");
      else setData(d);
    });
  }, []);

  const wordToIdx = useMemo(() => {
    const m = new Map<string, number>();
    if (data) data.index.words.forEach((w, i) => m.set(w, i));
    return m;
  }, [data]);

  const story = STORIES[storyIdx];
  const years = data?.index.years ?? [];
  const currentYear = years[yearIndex];

  const { markedIndices, markedColors, labels, fitIndices } = useMemo(() => {
    const ids: number[] = [];
    const cols: RGB[] = [];
    const labs: (string | null)[] = [];
    if (!data) return { markedIndices: ids, markedColors: cols, labels: labs, fitIndices: ids };
    const glow = story.mode === "glow";
    const accent = hexToRgb(story.accent ?? "#ffffff");
    story.words.forEach((sw) => {
      const idx = wordToIdx.get(sw.w);
      if (idx === undefined) return;
      ids.push(idx);
      if (glow) {
        cols.push(accent); // one cluster colour; label only the exemplars
        labs.push(sw.role === "hero" ? sw.w : null);
      } else {
        cols.push(hexToRgb(ROLE_COLOR[sw.role]));
        labs.push(sw.w);
      }
    });
    return { markedIndices: ids, markedColors: cols, labels: labs, fitIndices: ids };
  }, [data, story, wordToIdx]);

  // active chapter = latest whose year <= currentYear
  const chapter = useMemo(() => {
    let c = story.chapters[0];
    for (const ch of story.chapters) if (currentYear !== undefined && ch.year <= currentYear) c = ch;
    return c;
  }, [story, currentYear]);

  // reset to the start year whenever the story changes. In tour mode, auto-play
  // the new story; otherwise wait for a drag.
  useEffect(() => {
    setYearIndex(0);
    setPlaying(tourRef.current);
  }, [storyIdx]);

  // tour driver: when a story finishes playing, pause on the finale, then glide
  // to the next story (wrapping) — a hands-free cinematic film of all the drifts.
  useEffect(() => {
    if (!tour || !data) return;
    if (!playing && yearIndex >= data.index.years.length - 1) {
      const t = window.setTimeout(
        () => setStoryIdx((s) => (s + 1) % STORIES.length),
        2200,
      );
      return () => window.clearTimeout(t);
    }
  }, [tour, playing, yearIndex, data]);

  // play loop
  useEffect(() => {
    if (!playing || !data) return;
    const tick = () => {
      setYearIndex((yi) => {
        if (yi + 1 >= data.index.years.length) {
          setPlaying(false);
          return yi;
        }
        return yi + 1;
      });
      playRef.current = window.setTimeout(tick, PLAY_MS_PER_YEAR);
    };
    playRef.current = window.setTimeout(tick, PLAY_MS_PER_YEAR);
    return () => {
      if (playRef.current !== null) window.clearTimeout(playRef.current);
    };
  }, [playing, data]);

  const atEnd = data ? yearIndex >= data.index.years.length - 1 : false;

  return (
    <main className="flex-1">
      {/* hero — cinematic staggered reveal */}
      <section className="relative min-h-[62vh] flex flex-col items-center justify-center px-6 pt-28 pb-12 text-center overflow-hidden">
        {/* soft glow behind the title */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(120,80,200,0.16), rgba(244,184,96,0.08) 45%, transparent 70%)" }}
        />
        <motion.div
          variants={HERO_CONTAINER}
          initial="hidden"
          animate="show"
          className="relative max-w-3xl"
        >
          <motion.div
            variants={HERO_ITEM}
            className="text-accent text-xs font-mono uppercase tracking-[0.25em] mb-6"
          >
            Word2Vec · 2014 → 2025
          </motion.div>
          <h1 className="font-display text-[clamp(44px,7.5vw,104px)] leading-[0.95] tracking-tight">
            <motion.span variants={HERO_ITEM} className="block">
              English changes
            </motion.span>
            <motion.em variants={HERO_ITEM} className="block">
              while you&apos;re looking away.
            </motion.em>
          </h1>
          <motion.p
            variants={HERO_ITEM}
            className="text-foreground/70 text-base lg:text-xl mt-8 max-w-2xl mx-auto leading-relaxed"
          >
            Twelve years of word embeddings, projected into one map. Drag through the
            years and watch a word tear loose from its old neighbors and snap onto
            new ones — the exact moment a meaning flips.
          </motion.p>
          <motion.div
            variants={HERO_ITEM}
            className="mt-9 text-muted text-sm font-mono"
          >
            <motion.span
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block"
            >
              pick a story ↓
            </motion.span>
          </motion.div>
        </motion.div>
      </section>

      {/* the player */}
      <section className="relative h-screen w-full border-y border-white/[0.06] overflow-hidden bg-[#070707]">
        {data ? (
          <Space
            data={data}
            yearIndex={yearIndex}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
            markedIndices={markedIndices}
            markedColors={markedColors}
            highlightedMarkedIdx={null}
            labels={labels}
            dimBackground
            interactive={false}
            fitIndices={fitIndices}
            fitMinSpan={story.mode === "glow" ? 0.62 : undefined}
            markedGlow={story.mode === "glow"}
            freqByYear={data.freqByYear}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted font-mono text-sm">
            {error ?? "loading the map…"}
          </div>
        )}

        {/* story tabs + play-the-film toggle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 px-3">
          <div className="flex flex-wrap justify-center gap-1.5">
            {STORIES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  setTour(false);
                  setStoryIdx(i);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors border tabular-nums ${
                  i === storyIdx
                    ? "bg-accent text-black border-accent"
                    : "border-white/10 text-muted hover:text-foreground hover:border-white/25 bg-black/30 backdrop-blur-md"
                }`}
              >
                {s.id} · {s.snapYear}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (tour) {
                setTour(false);
                setPlaying(false);
              } else {
                setTour(true);
                setStoryIdx(0);
                setYearIndex(0);
                setPlaying(true);
              }
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-mono tracking-wide transition-colors border ${
              tour
                ? "bg-accent/15 border-accent/50 text-accent"
                : "border-white/15 text-foreground/80 hover:text-foreground hover:border-white/35 bg-black/40 backdrop-blur-md"
            }`}
          >
            {tour ? "⏸ touring — stop" : "▶ play the film"}
          </button>
        </div>

        {/* active story header */}
        <div className="absolute top-20 left-6 lg:left-10 z-10 max-w-xs pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-mono mb-1">
            {story.mode === "glow"
              ? `story · lights up from ${story.snapYear}`
              : `story · the snap of ${story.snapYear}`}
          </div>
          <h2 className="font-display text-2xl lg:text-3xl leading-tight mb-2">
            {story.title}
          </h2>
          <p className="text-foreground/55 text-xs lg:text-sm leading-relaxed">
            {story.blurb}
          </p>
        </div>

        {/* legend */}
        <div className="absolute bottom-28 left-6 lg:left-10 z-10 space-y-1">
          {story.mode === "glow" ? (
            <>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{ background: story.accent, color: story.accent }}
                />
                <span className="text-foreground">{story.words.length} words</span>
                <span className="text-muted">· brighten = more common</span>
              </div>
              <div className="text-[11px] font-mono text-foreground/55 max-w-[180px] leading-snug pl-4">
                {story.words.slice(0, 6).map((sw) => sw.w).join(", ")}…
              </div>
            </>
          ) : (
            story.words.map((sw) => (
              <div key={sw.w} className="flex items-center gap-2 text-[11px] font-mono">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{ background: ROLE_COLOR[sw.role], color: ROLE_COLOR[sw.role] }}
                />
                <span className="text-foreground">{sw.w}</span>
                {sw.role === "toward" && <span className="text-[#5dffd9]/70">→ joins</span>}
                {sw.role === "away" && <span className="text-[#ff5da2]/70">← leaves</span>}
                {sw.role === "hero" && <span className="text-accent/70">the word</span>}
              </div>
            ))
          )}
        </div>

        {/* chapter caption */}
        <div className="absolute top-1/2 right-6 lg:right-10 -translate-y-1/2 z-10 w-[min(80vw,340px)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${story.id}-${chapter.year}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="backdrop-blur-xl bg-black/55 border border-white/10 rounded-2xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-accent text-[11px] font-mono uppercase tracking-wider">
                  {chapter.title}
                </span>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {chapter.year}
                </span>
              </div>
              <p className="text-foreground/85 text-sm leading-relaxed">{chapter.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* transport — drag-first; the slider invites the drag */}
        {data && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[min(86vw,560px)] backdrop-blur-md bg-black/45 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
            {/* drag hint */}
            <AnimatePresence>
              {!dragged && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-accent pointer-events-none whitespace-nowrap"
                >
                  <motion.span animate={{ x: [0, -4, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                    ‹
                  </motion.span>
                  drag the years
                  <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                    ›
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => {
                setTour(false);
                if (atEnd) setYearIndex(0);
                setPlaying((p) => (atEnd ? true : !p));
              }}
              className="font-mono text-xs uppercase tracking-wider text-foreground/80 hover:text-accent transition-colors w-12 text-left shrink-0"
            >
              {atEnd ? "replay" : playing ? "pause" : "play"}
            </button>

            <motion.div
              key={storyIdx}
              className="flex-1"
              animate={dragged ? { x: 0 } : { x: [0, -6, 6, -5, 5, 0] }}
              transition={
                dragged
                  ? { duration: 0.2 }
                  : { duration: 1.1, delay: 0.6, repeat: 1, repeatDelay: 0.9, ease: "easeInOut" }
              }
            >
              <input
                type="range"
                min={0}
                max={years.length - 1}
                step={1}
                value={yearIndex}
                onChange={(e) => {
                  setTour(false);
                  setPlaying(false);
                  setDragged(true);
                  setYearIndex(parseInt(e.target.value, 10));
                }}
                className="w-full year-slider"
              />
            </motion.div>

            <span className="font-mono text-base tabular-nums text-foreground w-14 text-right shrink-0">
              {currentYear}
            </span>
          </div>
        )}
      </section>

      {/* cta */}
      <section className="py-28 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-[clamp(32px,5vw,64px)] leading-[1.05]">
            These are four words. <em>The map holds&nbsp;the&nbsp;rest.</em>
          </h2>
          <div className="mt-9 flex items-center justify-center">
            <Link
              href="/space"
              className="inline-block px-8 py-4 rounded-full bg-accent text-black font-mono text-sm uppercase tracking-widest hover:bg-accent/85 transition-colors"
            >
              Roam the full space →
            </Link>
          </div>
        </motion.div>
      </section>

      {/* method */}
      <section className="px-6 lg:px-10 py-20 max-w-3xl mx-auto text-foreground/70 text-sm leading-relaxed border-t border-white/[0.06]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-4">
          method
        </div>
        <p>
          Twelve per-year Word2Vec models (300d, trained on ~1B tokens of Common
          Crawl each) share one frozen <em>compass</em>, so all years live in the
          same coordinate system. Every word-year is then projected to 2D with a
          single joint UMAP — which is why a word can sit still for years and then
          jump to a new neighborhood the moment its meaning shifts. The map holds{" "}
          {data ? data.index.n_words.toLocaleString() : "52,894"} words; each story
          above just lights a few of them up.
        </p>
      </section>
    </main>
  );
}
