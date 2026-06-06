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
  const [yearIndex, setYearIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dragged, setDragged] = useState(false);
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

  // landing page tells one story: AI slop
  const story = STORIES.find((s) => s.id === "ai-slop") ?? STORIES[0];
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
      {/* hero — cinematic staggered reveal over a drifting aurora */}
      <section className="relative min-h-[72svh] sm:min-h-[82svh] flex flex-col items-center justify-center px-6 pt-28 sm:pt-32 pb-12 text-center overflow-hidden">
        {/* aurora atmosphere */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.8, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] sm:w-[760px] sm:h-[760px] rounded-full blur-[100px] sm:blur-[140px]"
            style={{ background: "radial-gradient(circle, rgba(120,80,200,0.14), rgba(244,184,96,0.06) 45%, transparent 70%)" }}
          />
          <div className="aurora aurora-a" style={{ top: "-12%", left: "8%", width: "min(46vw,520px)", aspectRatio: "1", background: "radial-gradient(circle, rgba(244,184,96,0.22), transparent 70%)" }} />
          <div className="aurora aurora-b" style={{ top: "2%", right: "0%", width: "min(50vw,560px)", aspectRatio: "1", background: "radial-gradient(circle, rgba(139,108,255,0.22), transparent 70%)" }} />
          <div className="aurora aurora-c" style={{ bottom: "-24%", left: "32%", width: "min(54vw,620px)", aspectRatio: "1.3", background: "radial-gradient(circle, rgba(93,213,232,0.13), transparent 70%)" }} />
        </motion.div>

        <motion.div
          variants={HERO_CONTAINER}
          initial="hidden"
          animate="show"
          className="relative max-w-3xl"
        >
          <motion.div variants={HERO_ITEM} className="flex justify-center mb-7">
            <span className="kicker">
              <span className="kicker-dot" />
              Word2Vec · 2014 → 2025
            </span>
          </motion.div>
          <h1 className="font-display text-[clamp(46px,8.4vw,124px)] leading-[0.92] tracking-[-0.02em]">
            <motion.span variants={HERO_ITEM} className="block text-foreground">
              English changes
            </motion.span>
            <motion.em variants={HERO_ITEM} className="block text-shimmer">
              while you&apos;re looking away.
            </motion.em>
          </h1>
          <motion.p
            variants={HERO_ITEM}
            className="text-foreground/65 text-base sm:text-lg lg:text-xl mt-8 max-w-2xl mx-auto leading-relaxed"
          >
            Twelve years of word embeddings, projected into a single map. Drag through
            the years and watch a word <span className="text-foreground">tear loose</span> from
            its old neighbors and <span className="text-foreground">snap onto new ones</span> —
            the exact moment a meaning flips.
          </motion.p>
          <motion.div
            variants={HERO_ITEM}
            className="mt-10 flex flex-col items-center gap-2 text-muted"
          >
            <span className="text-[11px] font-mono uppercase tracking-[0.25em]">
              drag the years
            </span>
            <motion.span
              animate={{ y: [0, 7, 0], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
              className="block w-px h-8 bg-gradient-to-b from-accent to-transparent"
            />
          </motion.div>
        </motion.div>
      </section>

      {/* the player */}
      <section className="relative h-[100svh] w-full border-y border-white/[0.06] overflow-hidden bg-[#070707]">
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
            dimBackground={story.mode === "glow"}
            interactive={false}
            fitIndices={fitIndices}
            fitMinSpan={2.2}
            markedGlow={story.mode === "glow"}
            cinematic
            progress={years.length > 1 ? yearIndex / (years.length - 1) : 0}
            freqByYear={data.freqByYear}
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

        {/* active story header */}
        <div className="absolute top-16 sm:top-20 left-5 sm:left-6 lg:left-10 z-10 max-w-[62vw] sm:max-w-xs pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-mono mb-1">
            {story.mode === "glow"
              ? `story · lights up from ${story.snapYear}`
              : `story · the snap of ${story.snapYear}`}
          </div>
          <h2 className="font-display text-xl sm:text-2xl lg:text-3xl leading-tight mb-2">
            {story.title}
          </h2>
          <p className="hidden sm:block text-foreground/55 text-xs lg:text-sm leading-relaxed">
            {story.blurb}
          </p>
        </div>

        {/* legend — desktop only; on mobile the screen is too tight to spare the room */}
        <div className="hidden sm:block absolute bottom-28 left-6 lg:left-10 z-10 space-y-1">
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

        {/* chapter caption — bottom card on mobile, right-rail on desktop */}
        <div className="absolute z-10 left-1/2 -translate-x-1/2 bottom-32 w-[88vw] sm:left-auto sm:translate-x-0 sm:right-6 lg:right-10 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:w-[min(80vw,340px)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${story.id}-${chapter.year}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="backdrop-blur-xl bg-black/55 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl"
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
          <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 w-[min(92vw,560px)] backdrop-blur-md bg-black/45 border border-white/10 rounded-xl px-3 sm:px-4 py-3 flex items-center gap-2.5 sm:gap-3">
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
                if (atEnd) setYearIndex(0);
                setPlaying((p) => (atEnd ? true : !p));
              }}
              className="font-mono text-xs uppercase tracking-wider text-foreground/80 hover:text-accent transition-colors w-12 text-left shrink-0"
            >
              {atEnd ? "replay" : playing ? "pause" : "play"}
            </button>

            <motion.div
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

      {/* stats band — the project in five numbers */}
      <section className="relative px-6 lg:px-10 py-16 sm:py-24 overflow-hidden">
        <div className="hairline max-w-5xl mx-auto mb-14 sm:mb-20" />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
          className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10 text-center"
        >
          {[
            { n: "12", l: "years · 2014–2025" },
            { n: data ? data.index.n_words.toLocaleString() : "52,894", l: "words mapped" },
            { n: "300", l: "dimensions / word" },
            { n: "~1B", l: "tokens trained / year" },
          ].map((s) => (
            <motion.div
              key={s.l}
              variants={{
                hidden: { opacity: 0, y: 18 },
                show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
              }}
            >
              <div className="font-display text-[clamp(40px,6vw,76px)] leading-none text-gold-violet tabular-nums">
                {s.n}
              </div>
              <div className="mt-3 text-[11px] sm:text-xs font-mono uppercase tracking-[0.18em] text-muted">
                {s.l}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* cta */}
      <section className="relative py-24 sm:py-36 px-6 text-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(244,184,96,0.10), transparent 70%)" }}
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="relative"
        >
          <h2 className="font-display text-[clamp(34px,5.5vw,72px)] leading-[1.04]">
            This is one story.{" "}
            <em className="text-shimmer">The map holds&nbsp;the&nbsp;rest.</em>
          </h2>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/space" className="btn-glow group">
              Roam the full space
              <span className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              href="/w"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/15 text-foreground/75 hover:text-foreground hover:border-white/30 font-mono text-xs uppercase tracking-widest transition-colors"
            >
              Look up a word
            </Link>
            <Link
              href="/arith"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/15 text-foreground/75 hover:text-foreground hover:border-white/30 font-mono text-xs uppercase tracking-widest transition-colors"
            >
              Try word arithmetic
            </Link>
          </div>
        </motion.div>
      </section>

      {/* method */}
      <section className="px-6 lg:px-10 py-20 sm:py-28 max-w-2xl mx-auto">
        <div className="hairline mb-12 sm:mb-16" />
        <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-mono mb-6">
          method
        </div>
        <p className="text-foreground/75 text-base sm:text-lg leading-relaxed">
          <span className="float-left font-display text-[64px] leading-[0.7] pr-3 pt-2 text-gold-violet">
            T
          </span>
          welve per-year Word2Vec models (300d, trained on ~1B tokens of Common
          Crawl each) share one frozen <em>compass</em>, so all years live in the
          same coordinate system. Every word-year is then projected to 2D with a
          single joint UMAP — which is why a word can sit still for years and then
          jump to a new neighborhood the moment its meaning shifts. The map holds{" "}
          {data ? data.index.n_words.toLocaleString() : "52,894"} words; the story
          above just lights a few of them up.
        </p>
      </section>
    </main>
  );
}
