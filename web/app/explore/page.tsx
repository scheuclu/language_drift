"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { Constellation } from "@/components/Constellation";
import { SearchBar } from "@/components/SearchBar";
import { loadManifest, loadWord } from "@/lib/data";
import type { Manifest, WordData } from "@/lib/types";

const DEFAULT_WORD = "distancing";

function ExplorePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlWord = searchParams.get("w");

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [word, setWordState] = useState<string>(urlWord ?? DEFAULT_WORD);
  const [data, setData] = useState<WordData | null>(null);
  const [yearIndex, setYearIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ["start start", "end end"],
  });

  const setWord = useCallback(
    (w: string) => {
      const lower = w.toLowerCase();
      setWordState(lower);
      const params = new URLSearchParams(searchParams.toString());
      params.set("w", lower);
      router.replace(`/explore?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (urlWord && urlWord !== word) setWordState(urlWord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlWord]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadWord(word).then((d) => {
      if (cancelled) return;
      if (!d) {
        setError(`'${word}' isn't in the vocab.`);
        setData(null);
        return;
      }
      setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  const nYears = data?.y.length ?? 13;

  const freqByWord = useMemo(() => {
    if (!manifest) return undefined;
    const m = new Map<string, number>();
    for (const w of manifest.words) m.set(w.w, w.fm);
    return m;
  }, [manifest]);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const idx = Math.min(nYears - 1, Math.max(0, Math.floor(v * nYears)));
    setYearIndex(idx);
  });

  return (
    <main className="flex-1 relative">
      {/* sticky viz fills the screen */}
      <div
        ref={scrollRef}
        className="relative"
        style={{ height: `${nYears * 100}vh` }}
      >
        <div className="sticky top-0 h-screen w-full">
          {/* background atmosphere */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[140px]"
              style={{ background: "radial-gradient(circle, rgba(244,184,96,0.06), rgba(139,108,255,0.03) 50%, transparent 70%)" }}
            />
          </div>

          {data ? (
            <Constellation
              data={data}
              yearIndex={yearIndex}
              showCount={12}
              onSelect={setWord}
              freqByWord={freqByWord}
              minFreq={10000}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted text-sm font-mono">
              {error ?? "loading…"}
            </div>
          )}

          {/* floating search bar */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            {manifest && (
              <SearchBar
                words={manifest.words}
                value={word}
                onSelect={setWord}
                placeholder="search a word…"
              />
            )}
          </div>

          {/* year ladder on left */}
          {data && (
            <YearLadder
              years={data.y}
              current={yearIndex}
              onPick={(yi) => {
                const el = scrollRef.current;
                if (!el) return;
                const top = el.offsetTop + (yi / nYears) * el.offsetHeight;
                window.scrollTo({ top, behavior: "smooth" });
              }}
            />
          )}

          {/* scroll hint */}
          <ScrollHint />

          {/* hint: click any neighbor */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none text-[11px] font-mono uppercase tracking-[0.18em] text-muted">
            click any word to dive in · scroll to scrub years
          </div>

          {error && (
            <div className="absolute top-36 left-1/2 -translate-x-1/2 text-xs text-red-400/80 font-mono">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 grid place-items-center text-muted text-sm font-mono">
          loading…
        </div>
      }
    >
      <ExplorePageInner />
    </Suspense>
  );
}

function YearLadder({
  years,
  current,
  onPick,
}: {
  years: number[];
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 font-mono text-xs pointer-events-auto">
      {years.map((y, i) => (
        <button
          key={y}
          onClick={() => onPick(i)}
          className={`px-2 py-0.5 rounded transition-colors tabular-nums text-left ${
            i === current
              ? "text-accent font-bold"
              : "text-muted/60 hover:text-foreground"
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

function ScrollHint() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 50) setHidden(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (hidden) return null;
  return (
    <div className="absolute bottom-20 right-6 lg:right-10 text-[11px] font-mono uppercase tracking-[0.2em] text-muted/80 pointer-events-none animate-pulse">
      scroll ↓
    </div>
  );
}
