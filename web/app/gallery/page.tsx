"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadGallery, loadManifest } from "@/lib/data";
import type { DriftGallery, Manifest, ManifestWord } from "@/lib/types";

const FREQ_TIERS = [
  { label: "any (≥ 3k)", value: 3000 },
  { label: "≥ 5k/yr", value: 5000 },
  { label: "≥ 10k/yr", value: 10000 },
  { label: "≥ 20k/yr", value: 20000 },
];

export default function GalleryPage() {
  const [gallery, setGallery] = useState<DriftGallery | null>(null);
  const [, setManifest] = useState<Manifest | null>(null);
  const [minFreq, setMinFreq] = useState(10000);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    loadGallery().then(setGallery);
    loadManifest().then(setManifest);
  }, []);

  const filtered = useMemo<ManifestWord[]>(() => {
    if (!gallery) return [];
    return gallery.top.filter((w) => w.fm >= minFreq).slice(0, limit);
  }, [gallery, minFreq, limit]);

  const maxDrift = useMemo(() => {
    if (filtered.length === 0) return 1;
    return Math.max(...filtered.map((w) => w.d));
  }, [filtered]);

  return (
    <main className="flex-1 px-6 lg:px-10 pt-24 lg:pt-28 pb-12 max-w-6xl mx-auto w-full">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-mono mb-1">
        gallery
      </div>
      <h1 className="font-display text-3xl lg:text-4xl leading-none mb-2">
        Top drifters, 2014 → 2025.
      </h1>
      <p className="text-muted text-sm lg:text-base max-w-2xl">
        Ranked by total cosine distance summed across all years. Frequency
        filter below — at low thresholds you get rare names; push it up to find
        the words that moved most while staying common.
      </p>

      <div className="mt-6 max-w-2xl rounded-xl border border-accent/25 bg-accent/[0.04] p-4 lg:p-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-accent font-mono mb-1.5">
          why so many odd words?
        </div>
        <p className="text-foreground/70 text-sm leading-relaxed">
          Many of the biggest post-2022 drifters aren&apos;t events — they&apos;re
          words large language models overuse: <em>delve</em>,{" "}
          <em>underscores</em>, <em>resonates</em>, <em>prioritizing</em>,{" "}
          <em>multifaceted</em>. As AI-generated text floods Common Crawl, their
          company blurs toward a flat, promotional register. You&apos;re watching
          the web start to sound like ChatGPT.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {FREQ_TIERS.map((t) => (
          <button
            key={t.value}
            onClick={() => setMinFreq(t.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors border ${
              minFreq === t.value
                ? "bg-accent text-black border-accent"
                : "border-white/[0.08] text-muted hover:text-foreground hover:border-white/20"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((w, i) => (
          <Link
            key={w.w}
            href={`/explore?w=${w.w}`}
            className="group p-4 rounded-xl border border-white/[0.06] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04] transition-all"
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="font-display text-2xl group-hover:text-accent transition-colors">
                {w.w}
              </span>
              <span className="text-muted text-[10px] font-mono tabular-nums">
                #{i + 1}
              </span>
            </div>
            <div className="text-[11px] text-muted font-mono mb-2">
              {compactNum(w.fm)} max yearly · drift {w.d.toFixed(2)}
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: `${(w.d / maxDrift) * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </div>

      {gallery && filtered.length >= limit && limit < gallery.top.length && (
        <div className="mt-10 text-center">
          <button
            onClick={() => setLimit(limit + 60)}
            className="btn-ghost"
          >
            show more
          </button>
        </div>
      )}
      {gallery && filtered.length === 0 && (
        <div className="mt-12 text-muted text-sm">
          no words meet this filter.
        </div>
      )}
    </main>
  );
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
