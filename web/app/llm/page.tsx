"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { DATA_BASE } from "@/lib/data-source";
import type { ParticleData } from "@/components/DistributionField";

const DistributionField = dynamic(
  () => import("@/components/DistributionField").then((m) => m.DistributionField),
  { ssr: false },
);

type HoverInfo = { w: string; lift: number; x: number; y: number };

type Cat = "register" | "coinage" | "gambling" | "adult" | "tech" | "other";
type Riser = {
  w: string;
  pm: number[];
  base: number;
  rec: number;
  x: number;
  rank: number;
  common: boolean;
  cat: Cat;
};
type Ridge = {
  base_years: number[];
  n_words: number;
  bins: number[];
  rows: number[][];
  spread: number[];
};
type LLMData = {
  years: number[];
  chatgpt_x: number;
  n_ranked: number;
  risers: Riser[];
  fallers: Riser[];
  ridge: Ridge;
  register_words: string[];
  composite_register: number[];
  composite_register_n: number;
  composite_median: number[];
  composite_gambling: number[];
  stats: {
    register_top100: number;
    coinage_top100: number;
    gambling_top100: number;
    med_reg_lift: number;
    register_pre_chatgpt: number;
    register_2025: number;
    median_2025: number;
    gambling_2025: number;
    ridge_spread_2025: number;
    ridge_n: number;
  };
};

const CAT_META: Record<Cat, { color: string; label: string }> = {
  register: { color: "#f4b860", label: "ordinary English" },
  coinage: { color: "#6ea8ff", label: "new coinage" },
  gambling: { color: "#ff6b9d", label: "gambling / SEO" },
  adult: { color: "#8a8d99", label: "adult-spam" },
  tech: { color: "#5ed3c0", label: "tech / product" },
  other: { color: "#b8b6ae", label: "other" },
};

type Filter = "register" | "all" | "coinage" | "gambling";
const FILTERS: { key: Filter; label: string; test: (r: Riser) => boolean }[] = [
  { key: "register", label: "ordinary English", test: (r) => r.cat === "register" },
  { key: "all", label: "everything", test: () => true },
  { key: "coinage", label: "new coinage", test: (r) => r.cat === "coinage" },
  { key: "gambling", label: "the other floods", test: (r) => r.cat === "gambling" || r.cat === "adult" },
];

export default function LLMPage() {
  const [data, setData] = useState<LLMData | null>(null);
  const [filter, setFilter] = useState<Filter>("register");
  const [limit, setLimit] = useState(30);
  const [pdata, setPdata] = useState<ParticleData | null>(null);
  const [pYear, setPYear] = useState(0);
  const [pPlaying, setPPlaying] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const pPlayRef = useRef<number | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const autoPlayed = useRef(false);

  useEffect(() => {
    fetch(`${DATA_BASE}/llm.json`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  // load the per-word particle field (every established word, per year)
  useEffect(() => {
    (async () => {
      try {
        const [jr, br] = await Promise.all([
          fetch(`${DATA_BASE}/llm_particles.json`),
          fetch(`${DATA_BASE}/llm_particles.bin`),
        ]);
        if (!jr.ok || !br.ok) return;
        const idx = (await jr.json()) as { words: string[]; years: number[]; n: number; base_years: number[] };
        const all = new Float32Array(await br.arrayBuffer());
        const { n, years } = idx;
        const pm: Float32Array[] = [];
        for (let yi = 0; yi < years.length; yi++) pm.push(all.subarray(yi * n, (yi + 1) * n));
        const bi = idx.base_years.map((y) => years.indexOf(y));
        const base = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          let s = 0;
          for (const b of bi) s += pm[b][i];
          base[i] = s / bi.length;
        }
        setPdata({ words: idx.words, years, pm, base });
      } catch {
        /* particle field unavailable */
      }
    })();
  }, []);

  const pYears = pdata?.years ?? data?.years ?? [];
  const pAtEnd = pYears.length > 0 && pYear >= pYears.length - 1;

  // play loop for the particle field
  useEffect(() => {
    if (!pPlaying || !pdata) return;
    const tick = () => {
      setPYear((y) => {
        if (y + 1 >= pdata.years.length) {
          setPPlaying(false);
          return y;
        }
        return y + 1;
      });
      pPlayRef.current = window.setTimeout(tick, 1050);
    };
    pPlayRef.current = window.setTimeout(tick, 1050);
    return () => {
      if (pPlayRef.current !== null) window.clearTimeout(pPlayRef.current);
    };
  }, [pPlaying, pdata]);

  // auto-play once when the field scrolls into view (the "wow" lands on arrival)
  useEffect(() => {
    if (!pdata) return;
    const el = fieldRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !autoPlayed.current) {
            autoPlayed.current = true;
            setPYear(0);
            setPPlaying(true);
          }
        }
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pdata]);

  // narration that tracks the playhead
  const phase = (() => {
    const y = pYears[pYear];
    if (y === undefined) return "";
    if (y <= 2019) return "For years the whole language holds in one tight spike — everything roughly where it was.";
    if (y <= 2022) return "It starts to spread. A few words pull away from the center.";
    if (y === 2023) return "ChatGPT ships. The spike begins to tear open.";
    if (y === 2024) return "The biggest lurch of the decade — a gold tail of surging words, a blue mass sinking.";
    return "The distribution has come apart: the whole language re-weighted in three years.";
  })();

  const shown = useMemo(() => {
    if (!data) return [];
    const t = FILTERS.find((f) => f.key === filter)!.test;
    return data.risers.filter(t);
  }, [data, filter]);

  return (
    <main className="min-h-screen w-full bg-[#070707] pt-20 pb-24 px-5 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* ---------- hero ---------- */}
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-2">
          the shape of a language
        </div>
        <h1 className="font-display text-4xl lg:text-6xl leading-[1.02] mb-5">
          You can watch the
          <br />
          distribution come apart.
        </h1>
        <p className="text-foreground/65 text-sm lg:text-lg max-w-2xl leading-relaxed">
          Forget individual words for a moment. Here is{" "}
          <em>every common English word at once</em> —{" "}
          {data ? data.ridge.n_words.toLocaleString() : "44,714"}{" "}of them — and how
          far each drifted from its 2014 frequency, year by year. For most of the decade the
          web&apos;s vocabulary barely moved: one tall, narrow spike, everything holding
          its place. Then it begins to spread. After ChatGPT, it tears open.
        </p>

        {!data && <div className="mt-16 text-muted font-mono text-sm">loading the distribution…</div>}

        {data && (
          <>
            {/* ---------- THE LIVING DISTRIBUTION (particle hero) ---------- */}
            <section className="mt-10">
              <div ref={fieldRef} className="relative rounded-2xl overflow-hidden border border-white/[0.06]">
                {pdata ? (
                  <DistributionField data={pdata} yearIndex={pYear} onHover={setHover} />
                ) : (
                  <div className="h-[60vh] min-h-[420px] grid place-items-center text-muted font-mono text-sm">
                    loading 44,714 words…
                  </div>
                )}

                {/* big year + phase narration */}
                <div className="absolute top-4 left-5 right-5 z-10 pointer-events-none flex items-start justify-between gap-4">
                  <p className="text-foreground/70 text-xs lg:text-sm max-w-md leading-snug min-h-[2.5em]">
                    {phase}
                  </p>
                  <span className="font-display text-4xl lg:text-6xl leading-none tabular-nums text-foreground/90 drop-shadow">
                    {pYears[pYear]}
                  </span>
                </div>

                {/* legend */}
                <div className="absolute bottom-12 left-5 right-5 z-10 pointer-events-none flex justify-between text-[11px] font-mono uppercase tracking-wider">
                  <span className="text-[#6ea8ff]/80">← got rarer</span>
                  <span className="text-[#f4b860]/80">got more common →</span>
                </div>
                {hover && (
                  <div
                    className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono whitespace-nowrap -translate-x-1/2"
                    style={{ left: hover.x, top: Math.max(8, hover.y - 30) }}
                  >
                    <span style={{ color: hover.lift > 0.35 ? "#f4b860" : hover.lift < -0.35 ? "#6ea8ff" : "#cfd2da" }}>
                      {hover.w}
                    </span>
                    <span className="text-muted ml-2">
                      {hover.lift >= 0
                        ? `×${(2 ** hover.lift).toFixed(2 ** hover.lift >= 10 ? 0 : 1)}`
                        : `${Math.round(2 ** hover.lift * 100)}% of 2014`}
                    </span>
                  </div>
                )}
              </div>

              {/* transport */}
              <div className="mt-4 flex items-center gap-3 max-w-2xl">
                <button
                  onClick={() => {
                    if (pAtEnd) {
                      setPYear(0);
                      setPPlaying(true);
                    } else setPPlaying((p) => !p);
                  }}
                  className="px-4 py-1.5 rounded-full text-xs font-mono border border-accent/50 bg-accent/15 text-accent hover:bg-accent/25 transition-colors w-24 text-center shrink-0"
                >
                  {pAtEnd ? "↻ replay" : pPlaying ? "⏸ pause" : "▶ watch it"}
                </button>
                <div className="relative flex-1">
                  {pYears.length > 1 && (
                    <div
                      className="absolute -top-4 pointer-events-none"
                      style={{ left: `${(8.5 / (pYears.length - 1)) * 100}%` }}
                    >
                      <span className="-translate-x-1/2 inline-block text-[9px] font-mono uppercase tracking-wider text-accent/80 whitespace-nowrap">
                        ChatGPT ↓
                      </span>
                    </div>
                  )}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, pYears.length - 1)}
                    value={pYear}
                    onChange={(e) => {
                      setPPlaying(false);
                      setPYear(parseInt(e.target.value, 10));
                    }}
                    className="year-slider w-full"
                  />
                </div>
                <span className="font-mono text-base tabular-nums text-foreground w-14 text-right shrink-0">
                  {pYears[pYear]}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat big={`${data.stats.ridge_spread_2025}%`} small="of words have drifted more than 2× from their 2014 rate by 2025" />
                <Stat big="≈0%" small="…the same figure in 2015 — the distribution was flat for years" />
                <Stat big={data.stats.ridge_n.toLocaleString()} small="every established word is a particle above — none cherry-picked" />
                <Stat big="2024" small="the single biggest one-year jump in the whole decade" />
              </div>
              <p className="mt-5 text-foreground/55 text-sm max-w-2xl leading-relaxed">
                Each dot is one word. Left of center it got rarer than in 2014, right of
                center more common; height is how many words pile up there. Press{" "}
                <span className="text-accent">play</span> — for years the whole language
                holds in one tight, bright spike, then it <span className="text-foreground">tears
                open</span>: a long gold tail of words surging while a blue mass slides down.
                That&apos;s the distribution itself being re-weighted, accelerating exactly
                when machine-written text floods the web. Hover any dot to name it.
              </p>
            </section>

            {/* ---------- the same story, every year stacked ---------- */}
            <section className="mt-20">
              <SectionKicker n="01" t="every year at once" />
              <h2 className="font-display text-2xl lg:text-3xl leading-tight mt-2 mb-4 max-w-3xl">
                The same distribution, all twelve years stacked.
              </h2>
              <RidgePlot ridge={data.ridge} years={data.years} chatgptX={data.chatgpt_x} />
            </section>

            {/* ---------- what's driving the right tail ---------- */}
            <section className="mt-20">
              <SectionKicker n="02" t="what's in the tail" />
              <h2 className="font-display text-2xl lg:text-3xl leading-tight mt-2 mb-3 max-w-3xl">
                Pull out the words that climbed — the ordinary ones — and they read like an
                AI thesaurus.
              </h2>
              <p className="text-foreground/60 text-sm max-w-2xl leading-relaxed mb-6">
                The right edge of that fan isn&apos;t random. Take the{" "}
                {data.composite_register_n} already-ordinary English words that rose the
                most (chosen by size, not by timing) and average them: flat for eight years,
                then the same elbow. The typical word, in grey, did the opposite — it drifted
                down as the surging words ate its share.
              </p>
              <CompositeChart data={data} />
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat big={`×${data.stats.register_2025}`} small="the register words vs their pre-ChatGPT norm, by 2025" />
                <Stat big={`${data.stats.register_pre_chatgpt}×`} small="the same words averaged over 2018–21 — dead flat" />
                <Stat big={`${data.stats.median_2025}×`} small="the typical word: it didn't rise, it slid down" />
                <Stat big={data.stats.register_top100.toString()} small="of the 100 biggest risers are ordinary English, not jargon" />
              </div>
            </section>

            {/* ---------- the receipts: ranking board (secondary) ---------- */}
            <section className="mt-20">
              <SectionKicker n="03" t="the receipts" />
              <h2 className="font-display text-2xl lg:text-3xl leading-tight mt-2 mb-3 max-w-3xl">
                Want the actual words? Here&apos;s the ranking — all{" "}
                {data.n_ranked.toLocaleString()}, we picked none.
              </h2>
              <p className="text-foreground/60 text-sm max-w-2xl leading-relaxed mb-5">
                Every word sorted by post-ChatGPT lift. Default shows only words that
                already existed in ordinary English; the other tabs are the raw list —
                casino-SEO, crypto coinage, the lot. Each sparkline is that word&apos;s rate
                2014 → 2025, ChatGPT marked.
              </p>

              <div className="flex flex-wrap items-center gap-2 mb-5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setFilter(f.key);
                      setLimit(30);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors border ${
                      filter === f.key
                        ? "bg-accent text-black border-accent"
                        : "border-white/[0.08] text-muted hover:text-foreground hover:border-white/20"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <span className="text-[11px] text-muted font-mono ml-1">
                  {shown.length.toLocaleString()} words
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
                {shown.slice(0, limit).map((r) => (
                  <RiserRow key={r.w} r={r} years={data.years} chatgptX={data.chatgpt_x} />
                ))}
              </div>
              {shown.length > limit && (
                <div className="mt-6 text-center">
                  <button onClick={() => setLimit(limit + 40)} className="btn-ghost">
                    show more
                  </button>
                </div>
              )}
            </section>

            {/* ---------- the other floods ---------- */}
            <section className="mt-20 rounded-2xl border border-[#ff6b9d]/20 bg-[#ff6b9d]/[0.04] p-5 lg:p-7">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#ff6b9d] font-mono mb-2">
                the part that isn&apos;t about chatbots
              </div>
              <p className="text-foreground/75 text-sm lg:text-base max-w-3xl leading-relaxed">
                Honesty check: the fan&apos;s most extreme right tail isn&apos;t the
                register at all. Online-gambling and casino-SEO words are up{" "}
                <span className="text-[#ff6b9d] font-semibold tabular-nums">
                  ×{Math.round(data.stats.gambling_2025).toLocaleString()}
                </span>{" "}
                since 2018, and crypto coinage (<em>nft</em>, <em>defi</em>,{" "}
                <em>solana</em>) appeared from nothing. The web didn&apos;t only learn to{" "}
                <em>sound</em> like a machine — it filled with machine-generated spam of
                every kind. Switch the ranking to <em>the other floods</em> to watch the
                casino tide come in.
              </p>
            </section>

            {/* ---------- closer ---------- */}
            <section className="mt-20 border-t border-white/[0.06] pt-10">
              <p className="text-foreground/70 text-sm lg:text-base max-w-2xl leading-relaxed">
                None of this is a list we wrote. It&apos;s the shape that falls out of the
                corpus when you ask it one question: <em>what changed once the machines
                started writing?</em> Each word in the tail also shifted in{" "}
                <span className="text-foreground">meaning</span> — click one to watch its
                neighbors turn over, year by year.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {data.risers
                  .filter((r) => r.cat === "register")
                  .slice(0, 8)
                  .map((r) => (
                    <Link
                      key={r.w}
                      href={`/explore?w=${r.w}`}
                      className="px-3 py-1.5 rounded-full border border-white/10 text-sm text-foreground/75 hover:text-accent hover:border-accent/40 transition-colors font-mono"
                    >
                      {r.w} →
                    </Link>
                  ))}
              </div>
              <p className="mt-8 text-[11px] text-muted font-mono leading-relaxed max-w-2xl">
                method: per-year unigram frequencies from FineWeb / Common Crawl (~1B
                tokens/year). ridgeline = histogram of log₂(year rate / 2014–15 rate) over{" "}
                {data.ridge.n_words.toLocaleString()} words established by 2014–15. lift =
                log₂ of post-ChatGPT (2023–25) over pre-ChatGPT (2018–21) rate, smoothed.
                categories assigned by an objective baseline-frequency split plus named
                gambling/adult/product lexicons — never word by word.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* ===================== the ridgeline (joyplot) ===================== */
function RidgePlot({ ridge, years, chatgptX }: { ridge: Ridge; years: number[]; chatgptX: number }) {
  const W = 1000;
  const H = 600;
  const PAD = { l: 52, r: 24, t: 76, b: 40 };
  const { bins, rows } = ridge;
  const lo = bins[0];
  const hi = bins[bins.length - 1];
  const n = years.length;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const rowGap = plotH / (n - 1);
  const globalMax = Math.max(...rows.flat());
  const AMP = rowGap * 3.4; // peak height in px (older spike towers; recent rows splay low)

  const xFor = (v: number) => PAD.l + ((v - lo) / (hi - lo)) * plotW;
  const baseY = (i: number) => PAD.t + i * rowGap; // 2014 at top
  const lerp = (t: number) => {
    // dim violet (old) -> warm gold (recent)
    const r = Math.round(96 + (244 - 96) * t);
    const g = Math.round(82 + (184 - 82) * t);
    const b = Math.round(150 + (96 - 150) * t);
    return `rgb(${r},${g},${b})`;
  };
  const ridgePath = (dens: number[], i: number) => {
    const by = baseY(i);
    let d = `M${xFor(bins[0]).toFixed(1)},${by.toFixed(1)}`;
    dens.forEach((v, k) => {
      d += ` L${xFor(bins[k]).toFixed(1)},${(by - (v / globalMax) * AMP).toFixed(1)}`;
    });
    d += ` L${xFor(bins[bins.length - 1]).toFixed(1)},${by.toFixed(1)} Z`;
    return d;
  };

  // ChatGPT divider sits between the 2022 and 2023 rows
  const i2022 = years.indexOf(2022);
  const cgY = baseY(i2022) + rowGap / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
      {/* x gridlines at notable multiples: 0.5x(-1), 1x(0), 2x(1), 4x(2), 8x(3) */}
      {[-1, 0, 1, 2, 3].map((v) => (
        <g key={v}>
          <line x1={xFor(v)} x2={xFor(v)} y1={PAD.t - 14} y2={H - PAD.b + 6}
            stroke={v === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.06)"}
            strokeDasharray={v === 0 ? "" : "3 5"} />
          <text x={xFor(v)} y={H - PAD.b + 22} textAnchor="middle" className="fill-muted" fontSize="11" fontFamily="monospace">
            {v === 0 ? "same" : v < 0 ? `${Math.round(100 / 2 ** -v)}%` : `×${2 ** v}`}
          </text>
        </g>
      ))}

      {/* ridges, far (2014) first so nearer rows overlap upward */}
      {rows.map((dens, i) => {
        const t = i / (n - 1);
        return (
          <motion.path
            key={years[i]}
            d={ridgePath(dens, i)}
            fill={lerp(t)}
            fillOpacity={0.86}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={0.8}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          />
        );
      })}

      {/* year labels */}
      {years.map((yr, i) => (
        <text key={yr} x={PAD.l - 10} y={baseY(i) + 3} textAnchor="end"
          className={yr >= 2023 ? "fill-accent" : "fill-muted"} fontSize="11" fontFamily="monospace">
          {yr}
        </text>
      ))}

      {/* ChatGPT divider */}
      <line x1={PAD.l - 4} x2={W - PAD.r} y1={cgY} y2={cgY} stroke="rgba(244,184,96,0.55)" strokeWidth={1.2} strokeDasharray="6 4" />
      <text x={W - PAD.r} y={cgY - 6} textAnchor="end" className="fill-accent" fontSize="11" fontFamily="monospace">
        ↑ before ChatGPT · after ↓
      </text>
    </svg>
  );
}

/* ===================== composite chart ===================== */
function CompositeChart({ data }: { data: LLMData }) {
  const W = 1000;
  const H = 380;
  const PAD = { l: 44, r: 64, t: 28, b: 34 };
  const years = data.years;
  const n = years.length;
  const reg = data.composite_register;
  const med = data.composite_median;
  const yMax = Math.ceil(Math.max(...reg, ...med, 2));

  const xFor = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const xForYear = (yr: number) =>
    PAD.l + ((yr - years[0]) / (years[n - 1] - years[0])) * (W - PAD.l - PAD.r);
  const yFor = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i ? "L" : "M"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
      {Array.from({ length: yMax }, (_, k) => k + 1)
        .filter((m) => m === 1 || m % Math.ceil(yMax / 5) === 0)
        .map((m) => (
          <g key={m}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yFor(m)} y2={yFor(m)}
              stroke="rgba(255,255,255,0.06)" strokeDasharray={m === 1 ? "" : "3 5"} />
            <text x={PAD.l - 8} y={yFor(m) + 4} textAnchor="end" className="fill-muted" fontSize="12" fontFamily="monospace">{m}×</text>
          </g>
        ))}
      {years.map((yr, i) =>
        yr % 2 === 0 || yr === 2025 ? (
          <text key={yr} x={xFor(i)} y={H - 12} textAnchor="middle" className="fill-muted" fontSize="12" fontFamily="monospace">
            {`'${String(yr).slice(2)}`}
          </text>
        ) : null,
      )}
      <line x1={xForYear(data.chatgpt_x)} x2={xForYear(data.chatgpt_x)} y1={PAD.t} y2={H - PAD.b}
        stroke="rgba(244,184,96,0.45)" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={xForYear(data.chatgpt_x) + 6} y={PAD.t + 12} className="fill-accent" fontSize="12" fontFamily="monospace">ChatGPT ↓</text>
      <text x={(xFor(0) + xForYear(data.chatgpt_x)) / 2} y={yFor(1) - 10} textAnchor="middle" className="fill-muted" fontSize="11.5" fontFamily="monospace">flat for eight years</text>

      <motion.path d={path(med)} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth={1.75} strokeDasharray="2 4"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
      <text x={xFor(n - 1) + 6} y={yFor(med[n - 1]) + 4} className="fill-muted" fontSize="11.5" fontFamily="monospace">typical</text>

      <motion.path d={path(reg)} fill="none" stroke="#f4b860" strokeWidth={3.25} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: "easeOut" }} />
      <text x={xFor(n - 1) + 6} y={yFor(reg[n - 1]) + 4} className="fill-accent" fontSize="13" fontFamily="monospace" fontWeight="bold">×{reg[n - 1].toFixed(1)}</text>
    </svg>
  );
}

/* ===================== ranking row ===================== */
function RiserRow({ r, years, chatgptX }: { r: Riser; years: number[]; chatgptX: number }) {
  const meta = CAT_META[r.cat];
  return (
    <Link href={`/explore?w=${r.w}`}
      className="group flex items-center gap-3 lg:gap-5 px-3 lg:px-4 py-2.5 hover:bg-white/[0.025] transition-colors">
      <span className="w-9 text-right text-muted text-[11px] font-mono tabular-nums shrink-0">#{r.rank}</span>
      <span className="w-28 lg:w-40 shrink-0 truncate">
        <span className="font-display text-lg lg:text-xl group-hover:text-accent transition-colors">{r.w}</span>
      </span>
      <span className="hidden sm:flex items-center gap-1.5 w-32 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
        <span className="text-[10px] uppercase tracking-wider text-muted font-mono">{meta.label}</span>
      </span>
      <span className="flex-1 min-w-0">
        <MiniSparkline pm={r.pm} years={years} chatgptX={chatgptX} color={meta.color} />
      </span>
      <span className="w-14 lg:w-16 text-right shrink-0">
        <span className="font-mono text-sm tabular-nums" style={{ color: meta.color }}>
          ×{r.x >= 10 ? Math.round(r.x) : r.x.toFixed(1)}
        </span>
      </span>
    </Link>
  );
}

function MiniSparkline({ pm, years, chatgptX, color }: { pm: number[]; years: number[]; chatgptX: number; color: string }) {
  const W = 220;
  const H = 30;
  const max = Math.max(...pm, 1e-9);
  const xFor = (i: number) => (i / (pm.length - 1)) * W;
  const yFor = (v: number) => H - 2 - (v / max) * (H - 4);
  const d = pm.map((v, i) => `${i ? "L" : "M"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
  const cgX = ((chatgptX - years[0]) / (years[years.length - 1] - years[0])) * W;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" height={H}>
      <line x1={cgX} x2={cgX} y1={0} y2={H} stroke="rgba(244,184,96,0.3)" strokeWidth={1} strokeDasharray="2 3" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===================== small bits ===================== */
function SectionKicker({ n, t }: { n: string; t: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono">
      <span className="text-accent">{n}</span>
      <span className="text-muted">{t}</span>
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="font-display text-2xl lg:text-3xl text-accent tabular-nums leading-none mb-1.5">{big}</div>
      <div className="text-[11px] text-foreground/55 leading-snug">{small}</div>
    </div>
  );
}
