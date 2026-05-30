"use client";

import {
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Constellation } from "@/components/Constellation";
import { loadWord } from "@/lib/data";
import type { WordData } from "@/lib/types";

const HERO_WORD = "distancing";

type Chapter = {
  yearIndex: number;
  year: number;
  kicker: string;
  title: string;
  body: string;
};

const CHAPTERS: Chapter[] = [
  {
    yearIndex: 0,
    year: 2014,
    kicker: "Before everything",
    title: "You distanced yourself from an idea.",
    body:
      "In 2014 distancing was a stance, not a rule. You distanced yourself from a claim, a belief, a criticism — the word traveled with contradictory, irrational, guilt, embraced, absurd. It was something you did in your head.",
  },
  {
    yearIndex: 3,
    year: 2017,
    kicker: "Quiet drift",
    title: "A way of holding things at arm's length.",
    body:
      "Through the mid-2010s it stays abstract — perception, beliefs, oneself, deliberately. To distance was to take a position: from a person, an ideology, an uncomfortable truth. Nothing happens in this chapter — and that's the point.",
  },
  {
    yearIndex: 6,
    year: 2020,
    kicker: "Spring 2020",
    title: "Overwritten in a single season.",
    body:
      "By mid-2020 the whole neighborhood is replaced: pandemic, coronavirus, quarantine, masks, gatherings, lockdown. Overnight the word stops being a mental stance and becomes a measurement — how many feet apart to stand.",
  },
  {
    yearIndex: 8,
    year: 2022,
    kicker: "The meaning hardens",
    title: "Six feet. Masks. Gatherings.",
    body:
      "By 2022 every top neighbor is physical: masks, lockdown, quarantine, vaccinated, gatherings. The old sense isn't faded — it's gone. Distancing is now something bodies do in space, not something minds do with ideas.",
  },
  {
    yearIndex: 11,
    year: 2025,
    kicker: "After",
    title: "This one never goes back.",
    body:
      "Most words drift and partly return. Distancing doesn't. Five years on it's still pandemic, coronavirus, quarantine, vaccinated — the 2014 meaning, distancing yourself from an idea, erased completely.",
  },
];

export default function LandingPage() {
  const [data, setData] = useState<WordData | null>(null);
  const [yearIndex, setYearIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadWord(HERO_WORD).then((d) => {
      if (d) setData(d);
    });
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const segs = CHAPTERS.length;
    const seg = Math.min(segs - 1, Math.floor(v * segs));
    const targetIdx = CHAPTERS[seg].yearIndex;
    setYearIndex(targetIdx);
  });

  return (
    <main className="flex-1">
      {/* hero intro */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="max-w-3xl"
        >
          <div className="text-accent text-xs font-mono uppercase tracking-[0.25em] mb-6">
            Word2Vec · 2014 → 2025
          </div>
          <h1 className="font-display text-[clamp(48px,8vw,120px)] leading-[0.95] tracking-tight">
            English changes
            <br />
            <em>while you're looking away.</em>
          </h1>
          <p className="text-foreground/70 text-lg lg:text-xl mt-8 max-w-2xl mx-auto leading-relaxed">
            Twelve Word2Vec models, one per year, trained on a billion tokens of
            Common Crawl each and locked to a shared frame. Below:{" "}
            <em>distancing</em> — and the company it kept, year by year.
          </p>
          <div className="mt-10 text-muted text-sm font-mono">
            scroll to begin ↓
          </div>
        </motion.div>
      </section>

      {/* scrollytelling */}
      <div
        ref={containerRef}
        className="relative"
        style={{ height: `${(CHAPTERS.length + 1) * 100}vh` }}
      >
        <div className="sticky top-0 h-screen w-full">
          {data && <Constellation data={data} yearIndex={yearIndex} showCount={18} />}
          {!data && (
            <div className="h-full grid place-items-center text-muted font-mono text-sm">
              loading mask…
            </div>
          )}
        </div>

        <div className="relative -mt-[100vh] pointer-events-none">
          {/* spacer so first chapter aligns with the first sticky frame */}
          <div className="h-screen" />
          {CHAPTERS.map((c, i) => (
            <ChapterCard key={i} chapter={c} side={i % 2 === 0 ? "right" : "left"} />
          ))}
        </div>
      </div>

      {/* call to action */}
      <section className="py-32 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-[clamp(36px,5vw,72px)] leading-[1.05]">
            What word do <em>you</em> want to look at?
          </h2>
          <Link
            href="/explore"
            className="mt-10 inline-block px-8 py-4 rounded-full bg-accent text-black font-mono text-sm uppercase tracking-widest hover:bg-accent/85 transition-colors"
          >
            Open the explorer →
          </Link>
        </motion.div>
      </section>

      {/* more stories */}
      <MoreStoriesGrid />

      {/* method note */}
      <section className="px-6 lg:px-10 py-20 max-w-3xl mx-auto text-foreground/70 text-sm leading-relaxed border-t border-white/[0.06]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-4">
          method
        </div>
        <p>
          For each year 2014–2025, we train a fresh skip-gram-with-negative-sampling
          Word2Vec (300d, window 10, 15 negatives) on a 1B-token slice of Common
          Crawl. All twelve years are trained against one shared <em>compass</em> —
          a context space learned across the whole period and then frozen — so
          every year lands in the same coordinate system directly, with no
          post-hoc alignment. A word's drift in a given year is the cosine
          distance from its 2018 vector, summed across the other eleven years.
          Stable anchors like <em>music</em> or <em>father</em> stay under 1.0 —
          the noise floor of the method. The biggest movers — <em>nft</em>,{" "}
          <em>defi</em>, <em>omicron</em> — clear 8.
        </p>
      </section>
    </main>
  );
}

function ChapterCard({
  chapter,
  side,
}: {
  chapter: Chapter;
  side: "left" | "right";
}) {
  return (
    <section
      className={`h-screen flex items-center px-6 lg:px-16 ${
        side === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.45 }}
        transition={{ duration: 0.55 }}
        className="max-w-md backdrop-blur-xl bg-black/55 p-6 lg:p-7 rounded-2xl border border-white/10 pointer-events-auto shadow-2xl"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-accent text-xs font-mono uppercase tracking-wider">
            {chapter.kicker}
          </span>
          <span className="font-mono text-xs text-muted tabular-nums">
            {chapter.year}
          </span>
        </div>
        <h2 className="font-display text-2xl lg:text-3xl leading-tight mb-3">
          {chapter.title}
        </h2>
        <p className="text-foreground/80 text-sm lg:text-base leading-relaxed">
          {chapter.body}
        </p>
      </motion.div>
    </section>
  );
}

const MORE_STORIES = [
  {
    word: "crypto",
    blurb: "Cryptography → currency, in five years.",
  },
  { word: "lockdown", blurb: "An emergency protocol becomes everyday." },
  { word: "gummies", blurb: "Candy and vitamins → CBD and keto." },
  { word: "zoom", blurb: "A verb. Then a meeting." },
  { word: "viral", blurb: "From outbreaks to Instagram." },
  { word: "token", blurb: "A software token → a crypto token." },
];

function MoreStoriesGrid() {
  return (
    <section className="px-6 lg:px-10 py-24 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-4">
          more drifts
        </div>
        <h2 className="font-display text-[clamp(32px,4vw,56px)] leading-tight mb-12">
          A few more words that didn't stay put.
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {MORE_STORIES.map((s) => (
            <Link
              key={s.word}
              href={`/explore?w=${s.word}`}
              className="block p-6 rounded-2xl border border-white/[0.06] hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
            >
              <div className="font-display text-3xl lg:text-4xl mb-2 group-hover:text-accent transition-colors">
                {s.word}
              </div>
              <div className="text-foreground/65 text-sm leading-snug">
                {s.blurb}
              </div>
              <div className="mt-4 text-muted text-[11px] font-mono group-hover:text-foreground transition-colors">
                open →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
