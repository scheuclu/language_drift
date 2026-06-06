"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { loadManifest } from "@/lib/data";
import type { Manifest } from "@/lib/types";
import {
  loadVectors,
  yearVec,
  cosine,
  VECTOR_N_YEARS,
  type YearVecs,
} from "@/lib/vectors";
import { Sparkline } from "@/components/Sparkline";
import { WordSearch } from "@/components/WordSearch";

const A_HEX = "#5dd5e8"; // cyan
const B_HEX = "#ff5da2"; // pink

// undefined = loading, null = not in vocab, array = ready
type VState = YearVecs | null | undefined;

function Pole({
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
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-2.5 mb-2.5">
        <span
          className="inline-block w-3 h-3 rounded-full shrink-0"
          style={{ background: hex, boxShadow: `0 0 8px ${hex}` }}
        />
        <span className="font-display text-2xl leading-none lowercase">{word}</span>
        <Link
          href={`/w/${encodeURIComponent(word)}`}
          className="ml-auto text-[11px] font-mono text-muted hover:text-accent transition-colors"
          title={`open ${word} dossier`}
        >
          dossier ↗
        </Link>
      </div>
      <WordSearch words={words} placeholder="change word…" onPick={onPick} />
    </div>
  );
}

export default function ComparePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [a, setA] = useState("remote");
  const [b, setB] = useState("work");
  const [va, setVa] = useState<VState>(undefined);
  const [vb, setVb] = useState<VState>(undefined);
  const [yi, setYi] = useState(VECTOR_N_YEARS - 1);
  const hydrated = useRef(false);

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => {});
  }, []);

  // shareable URL: ?a=word&b=word
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qa = sp.get("a");
    const qb = sp.get("b");
    if (qa) setA(qa.toLowerCase());
    if (qb) setB(qb.toLowerCase());
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    const sp = new URLSearchParams();
    sp.set("a", a);
    sp.set("b", b);
    window.history.replaceState(null, "", `?${sp.toString()}`);
  }, [a, b]);

  useEffect(() => {
    let c = false;
    setVa(undefined);
    loadVectors(a).then((v) => {
      if (!c) setVa(v);
    });
    return () => {
      c = true;
    };
  }, [a]);
  useEffect(() => {
    let c = false;
    setVb(undefined);
    loadVectors(b).then((v) => {
      if (!c) setVb(v);
    });
    return () => {
      c = true;
    };
  }, [b]);

  const years = useMemo(() => {
    if (manifest?.years && manifest.years.length === VECTOR_N_YEARS) return manifest.years;
    return Array.from({ length: VECTOR_N_YEARS }, (_, i) => 2014 + i);
  }, [manifest]);

  const sims = useMemo(() => {
    if (!va || !vb) return null;
    const out: number[] = [];
    for (let i = 0; i < VECTOR_N_YEARS; i++) {
      out.push(cosine(yearVec(va, i), yearVec(vb, i)));
    }
    return out;
  }, [va, vb]);

  const verdict = useMemo(() => {
    if (!sims) return null;
    const s0 = sims[0];
    const sN = sims[sims.length - 1];
    const delta = sN - s0;
    const kind = delta > 0.03 ? "converging" : delta < -0.03 ? "diverging" : "steady";
    return { s0, sN, delta, kind };
  }, [sims]);

  const words = useMemo(() => manifest?.words.map((w) => w.w) ?? [], [manifest]);
  const loading = va === undefined || vb === undefined;
  const missing = va === null ? a : vb === null ? b : null;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-28 sm:pt-32 pb-20 px-5 sm:px-6 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[460px] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(93,213,232,0.10), rgba(255,93,162,0.08) 55%, transparent 75%)" }}
      />
      <div className="relative max-w-3xl mx-auto">
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-4">
          convergence
        </div>
        <h1 className="font-display text-[clamp(36px,6vw,72px)] leading-[0.95] tracking-tight mb-3">
          Did two words <em className="text-shimmer">grow together?</em>
        </h1>
        <p className="text-foreground/65 text-base sm:text-lg max-w-xl leading-relaxed mb-8">
          Cosine similarity between any two words, year by year. Watch them pull
          together or drift apart as the language moves.
        </p>

        {/* the two pickers */}
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <Pole hex={A_HEX} word={a} words={words} onPick={(w) => setA(w)} />
          <button
            onClick={() => {
              setA(b);
              setB(a);
            }}
            className="self-center shrink-0 rounded-full border border-white/12 bg-white/[0.03] w-9 h-9 grid place-items-center text-muted hover:text-foreground hover:border-white/30 transition-colors"
            title="swap"
            aria-label="swap words"
          >
            ⇄
          </button>
          <Pole hex={B_HEX} word={b} words={words} onPick={(w) => setB(w)} />
        </div>

        <div className="hairline my-10" />

        {missing ? (
          <p className="text-foreground/60 text-sm font-mono">
            “{missing}” isn&apos;t a tracked word — try another above.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2.5 text-muted text-sm font-mono">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
            </span>
            measuring…
          </div>
        ) : sims && verdict ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* verdict line */}
            <p className="text-foreground/80 text-base sm:text-lg leading-relaxed mb-6">
              In {years[0]},{" "}
              <span style={{ color: A_HEX }}>{a}</span> and{" "}
              <span style={{ color: B_HEX }}>{b}</span> sat at{" "}
              <span className="tabular-nums">{verdict.s0.toFixed(2)}</span>. By{" "}
              {years[years.length - 1]}, they were at{" "}
              <span className="tabular-nums">{verdict.sN.toFixed(2)}</span> —{" "}
              <span
                className={
                  verdict.kind === "converging"
                    ? "text-accent"
                    : verdict.kind === "diverging"
                      ? "text-[#ff5da2]"
                      : "text-muted"
                }
              >
                {verdict.kind}
              </span>
              .
            </p>

            {/* stat chips */}
            <div className="flex flex-wrap gap-2.5 mb-8">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2">
                <div className="font-display text-xl text-gold-violet leading-none tabular-nums">
                  {sims[yi].toFixed(3)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted font-mono">
                  cosine in {years[yi]}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2">
                <div className="font-display text-xl text-gold-violet leading-none tabular-nums">
                  {verdict.delta >= 0 ? "+" : ""}
                  {verdict.delta.toFixed(3)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted font-mono">
                  change since {years[0]}
                </div>
              </div>
            </div>

            {/* trajectory */}
            <Sparkline
              values={sims}
              highlightIndex={yi}
              label="cosine similarity over time"
              height={84}
            />
            <div className="mt-4 flex items-center gap-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted w-10 shrink-0">
                {years[0]}
              </span>
              <input
                type="range"
                min={0}
                max={VECTOR_N_YEARS - 1}
                step={1}
                value={yi}
                onChange={(e) => setYi(parseInt(e.target.value, 10))}
                className="flex-1 year-slider"
              />
              <span className="font-mono text-base tabular-nums text-foreground w-14 text-right shrink-0">
                {years[yi]}
              </span>
            </div>
          </motion.div>
        ) : null}
      </div>
    </main>
  );
}
