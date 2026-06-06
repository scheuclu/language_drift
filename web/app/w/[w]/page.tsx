"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { loadWord, loadManifest } from "@/lib/data";
import type { WordData, Manifest } from "@/lib/types";
import { Sparkline } from "@/components/Sparkline";
import { WordSearch } from "@/components/WordSearch";
import { notableMovers } from "@/lib/movers";

// tri-colour pulsing dots, matching the rest of the app's loaders
function Loader({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-muted text-sm font-mono">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
      </span>
      {text}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2">
      <div className="font-display text-xl text-gold-violet leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted font-mono">
        {label}
      </div>
    </div>
  );
}

// a clickable neighbour pill, opacity scaled by similarity
function NeighborChip({
  word,
  sim,
  tone = "plain",
}: {
  word: string;
  sim?: number;
  tone?: "plain" | "arrived" | "left";
}) {
  const op = sim === undefined ? 1 : 0.55 + 0.45 * Math.max(0, Math.min(1, sim));
  const cls =
    tone === "arrived"
      ? "border-accent/45 text-accent bg-accent/[0.06]"
      : tone === "left"
        ? "border-white/10 text-muted line-through decoration-muted/50"
        : "border-white/12 text-foreground/85 hover:border-white/30";
  return (
    <Link
      href={`/w/${encodeURIComponent(word)}`}
      style={{ opacity: op }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono transition-colors hover:text-foreground ${cls}`}
    >
      {word}
      {sim !== undefined && (
        <span className="text-[10px] tabular-nums text-muted/70">{sim.toFixed(2)}</span>
      )}
    </Link>
  );
}

export default function WordPage() {
  const params = useParams<{ w: string | string[] }>();
  const raw = Array.isArray(params.w) ? params.w[0] : params.w;
  const word = decodeURIComponent(raw ?? "").toLowerCase();

  const [data, setData] = useState<WordData | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [yi, setYi] = useState(0);
  const [yearAIdx, setYearAIdx] = useState(0);
  const [yearBIdx, setYearBIdx] = useState(0);

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);
    if (!word) {
      setStatus("notfound");
      return;
    }
    loadWord(word).then((d) => {
      if (cancelled) return;
      if (!d) {
        setStatus("notfound");
        return;
      }
      setData(d);
      setYi(d.y.length - 1); // open on the most recent year
      setYearAIdx(0);
      setYearBIdx(d.y.length - 1);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  // rank of this word among all words by total drift (built once per manifest)
  const rankIndex = useMemo(() => {
    if (!manifest) return null;
    const sorted = [...manifest.words].sort((a, b) => b.d - a.d);
    const m = new Map<string, number>();
    sorted.forEach((x, i) => m.set(x.w, i + 1));
    return { map: m, total: sorted.length };
  }, [manifest]);
  const ranking =
    rankIndex && rankIndex.map.has(word)
      ? { rank: rankIndex.map.get(word)!, total: rankIndex.total }
      : null;

  // common words that drifted most — used for not-found suggestions + the footer
  const notable = useMemo(
    () => (manifest ? notableMovers(manifest, 16) : []),
    [manifest],
  );

  const years = data?.y ?? [];
  const drift = data?.d ?? [];
  const freq = data?.f ?? [];
  const lastIdx = years.length - 1;
  const baseYear = manifest?.base_year ?? 2018;

  // the single year where it moved the most relative to the year before
  const biggestMove = useMemo(() => {
    if (drift.length < 2) return null;
    let bi = 1;
    let bv = -Infinity;
    for (let i = 1; i < drift.length; i++) {
      const dv = drift[i] - drift[i - 1];
      if (dv > bv) {
        bv = dv;
        bi = i;
      }
    }
    return { from: years[bi - 1], to: years[bi] };
  }, [drift, years]);

  // custom A-year vs B-year neighbourhoods, with arrivals / departures
  const shift = useMemo(() => {
    if (!data || !data.n.length) return null;
    const TOP = 10;
    const first = (data.n[yearAIdx] ?? []).slice(0, TOP);
    const last = (data.n[yearBIdx] ?? []).slice(0, TOP);
    const firstSet = new Set(first.map(([w]) => w));
    const lastSet = new Set(last.map(([w]) => w));
    return { first, last, firstSet, lastSet };
  }, [data, yearAIdx, yearBIdx]);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-20 pb-20 px-5 sm:px-6 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[680px] h-[420px] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(139,108,255,0.12), rgba(244,184,96,0.05) 50%, transparent 72%)" }}
      />
      <div className="relative max-w-4xl mx-auto">
        {/* top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono">
            word dossier
          </div>
          {manifest && (
            <WordSearch
              words={manifest.words.map((w) => w.w)}
              placeholder="look up another word…"
            />
          )}
        </div>

        {status === "loading" && <Loader text={`opening “${word}”…`} />}

        {status === "notfound" && (
          <div>
            <h1 className="font-display text-3xl sm:text-4xl leading-tight mb-3">
              No dossier for “{word}”.
            </h1>
            <p className="text-foreground/60 text-sm max-w-xl leading-relaxed mb-8">
              A word needs to clear the frequency filter in (almost) every year to
              earn a tracked vector. Try the search above, or one of the common
              words that changed the most:
            </p>
            <div className="flex flex-wrap gap-2">
              {notable.map((g) => (
                <NeighborChip key={g.w} word={g.w} />
              ))}
            </div>
          </div>
        )}

        {status === "ready" && data && (
          <>
            {/* hero */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <h1 className="font-display text-shimmer text-[clamp(48px,9vw,108px)] leading-[0.9] tracking-tight lowercase">
                {data.w}
              </h1>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Stat value={data.td.toFixed(2)} label="total drift" />
                {ranking && (
                  <Stat
                    value={`#${ranking.rank.toLocaleString()}`}
                    label={`of ${ranking.total.toLocaleString()} by drift`}
                  />
                )}
                {biggestMove && (
                  <Stat
                    value={`${biggestMove.from}→${biggestMove.to}`}
                    label="biggest shift"
                  />
                )}
              </div>
            </motion.div>

            {/* charts */}
            <div className="hairline my-10" />
            <div className="grid sm:grid-cols-2 gap-8">
              <Sparkline
                values={drift}
                highlightIndex={yi}
                yMin={0}
                label={`drift from ${baseYear}`}
                height={68}
              />
              <Sparkline
                values={freq}
                highlightIndex={yi}
                label="usage over time"
                height={68}
              />
            </div>
            {/* year scrubber */}
            <div className="mt-6 flex items-center gap-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted w-10 shrink-0">
                {years[0]}
              </span>
              <input
                type="range"
                min={0}
                max={lastIdx}
                step={1}
                value={yi}
                onChange={(e) => setYi(parseInt(e.target.value, 10))}
                className="flex-1 year-slider"
              />
              <span className="font-mono text-base tabular-nums text-foreground w-14 text-right shrink-0">
                {years[yi]}
              </span>
            </div>

            {/* neighbourhood shift — the headline insight */}
            {shift && (
              <>
                <div className="hairline my-10" />
                <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-2">
                  the company it keeps
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <span className="text-foreground/60 text-sm">Nearest words in</span>
                  <select
                    value={yearAIdx}
                    onChange={(e) => setYearAIdx(parseInt(e.target.value, 10))}
                    className="bg-white/[0.06] border border-white/10 rounded px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {years.map((y, idx) => (
                      <option key={y} value={idx} disabled={idx >= yearBIdx} className="bg-[#07080c] text-foreground">
                        {y}
                      </option>
                    ))}
                  </select>
                  <span className="text-foreground/60 text-sm">vs</span>
                  <select
                    value={yearBIdx}
                    onChange={(e) => setYearBIdx(parseInt(e.target.value, 10))}
                    className="bg-white/[0.06] border border-white/10 rounded px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {years.map((y, idx) => (
                      <option key={y} value={idx} disabled={idx <= yearAIdx} className="bg-[#07080c] text-foreground">
                        {y}
                      </option>
                    ))}
                  </select>
                  <span className="text-foreground/45 text-[11px] font-mono ml-auto">
                    <span className="text-accent font-semibold">gold</span> = newly close ·{" "}
                    <span className="text-muted line-through decoration-muted/50 font-semibold">struck</span> = drifted away
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:gap-8">
                  <div>
                    <div className="text-xs font-mono tabular-nums text-muted mb-3">
                      {years[yearAIdx]}
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      {shift.first.map(([w, sim]) => (
                        <NeighborChip
                          key={w}
                          word={w}
                          sim={sim}
                          tone={shift.lastSet.has(w) ? "plain" : "left"}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-mono tabular-nums text-muted mb-3">
                      {years[yearBIdx]}
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      {shift.last.map(([w, sim]) => (
                        <NeighborChip
                          key={w}
                          word={w}
                          sim={sim}
                          tone={shift.firstSet.has(w) ? "plain" : "arrived"}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* this year's neighbourhood (driven by the scrubber) */}
            {data.n[yi] && data.n[yi].length > 0 && (
              <div className="mt-10">
                <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
                  nearest in {years[yi]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.n[yi]
                    .slice(0, 16)
                    .filter(([w]) => w !== data.w)
                    .map(([w, sim]) => (
                      <NeighborChip key={w} word={w} sim={sim} />
                    ))}
                </div>
              </div>
            )}

            {/* notable movers — keep exploring */}
            {notable.length > 0 && (
              <div className="mt-12">
                <div className="hairline mb-8" />
                <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
                  common words that changed most, 2014–2025
                </div>
                <div className="flex flex-wrap gap-2">
                  {notable
                    .filter((g) => g.w !== data.w)
                    .map((g) => (
                      <NeighborChip key={g.w} word={g.w} />
                    ))}
                </div>
              </div>
            )}

            {/* back to the map, with this word pre-marked */}
            <div className="mt-12">
              <Link
                href={`/space?mark=${encodeURIComponent(data.w)}&y=${years[lastIdx]}`}
                className="inline-flex items-center gap-2 text-sm font-mono text-foreground/70 hover:text-accent transition-colors"
              >
                see {data.w} on the full map →
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
