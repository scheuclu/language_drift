"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { loadManifest } from "@/lib/data";
import type { Manifest } from "@/lib/types";
import { WordSearch } from "@/components/WordSearch";
import { notableMovers } from "@/lib/movers";

export default function WordIndexPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => {});
  }, []);

  const movers = useMemo(
    () => (manifest ? notableMovers(manifest, 40) : []),
    [manifest],
  );
  const total = manifest?.words.length ?? 0;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-28 sm:pt-32 pb-20 px-5 sm:px-6 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[460px] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(139,108,255,0.13), rgba(244,184,96,0.06) 50%, transparent 72%)" }}
      />
      <div className="relative max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-4">
            word dossier
          </div>
          <h1 className="font-display text-[clamp(40px,7vw,84px)] leading-[0.95] tracking-tight">
            Look up <em className="text-shimmer">any word.</em>
          </h1>
          <p className="text-foreground/65 text-base sm:text-lg mt-6 max-w-xl leading-relaxed">
            See how its meaning drifted from 2014 to 2025 — the neighbours it
            gained and shed, and its rise or fall in usage.
            {total > 0 && (
              <>
                {" "}
                <span className="text-foreground/80 tabular-nums">
                  {total.toLocaleString()}
                </span>{" "}
                words tracked.
              </>
            )}
          </p>
          <div className="mt-8">
            {manifest ? (
              <WordSearch
                words={manifest.words.map((w) => w.w)}
                placeholder="type a word…"
                className="max-w-lg"
                large
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2.5 text-muted text-sm font-mono">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
                </span>
                loading the vocabulary…
              </div>
            )}
          </div>
          <Link
            href="/compare"
            className="inline-block mt-4 text-xs font-mono text-muted hover:text-accent transition-colors"
          >
            or compare two words →
          </Link>
        </motion.div>

        {movers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          >
            <div className="hairline my-12" />
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-2">
              common words that changed most
            </div>
            <p className="text-foreground/50 text-xs font-mono mb-5">
              2014–2025 · gated to everyday words, ranked by drift
            </p>
            <div className="flex flex-wrap gap-2">
              {movers.map((m) => (
                <Link
                  key={m.w}
                  href={`/w/${encodeURIComponent(m.w)}`}
                  className="group inline-flex items-baseline gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-sm font-mono text-foreground/85 hover:text-foreground hover:border-accent/40 hover:bg-accent/[0.06] transition-colors"
                >
                  {m.w}
                  <span className="text-[10px] tabular-nums text-muted group-hover:text-accent/80">
                    {m.d.toFixed(1)}
                  </span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
