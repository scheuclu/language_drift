"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Triangle, type Trajectory } from "@/components/Triangle";
import { loadManifest } from "@/lib/data";
import {
  cosine,
  loadVectors,
  VECTOR_N_YEARS,
  yearVec,
  type YearVecs,
} from "@/lib/vectors";
import type { Manifest, ManifestWord } from "@/lib/types";

const DEFAULT_ANCHORS: [string, string, string] = ["encryption", "scam", "money"];
const DEFAULT_TARGETS = ["crypto"];
const TARGET_COLORS = ["#f4b860", "#ff5da2", "#5dd5e8"];
const MAX_TARGETS = 3;

export default function TernaryPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [anchors, setAnchors] = useState<[string, string, string]>(DEFAULT_ANCHORS);
  const [targets, setTargets] = useState<string[]>(DEFAULT_TARGETS);
  const [vectors, setVectors] = useState<Map<string, YearVecs>>(new Map());
  const [missing, setMissing] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => {});
  }, []);

  // Lazy-fetch vectors for any anchor/target not yet cached.
  useEffect(() => {
    const needed = new Set<string>();
    for (const a of anchors) if (a) needed.add(a);
    for (const t of targets) if (t) needed.add(t);

    const toFetch: string[] = [];
    needed.forEach((w) => {
      if (!vectors.has(w) && !missing.has(w)) toFetch.push(w);
    });
    if (toFetch.length === 0) return;

    let cancelled = false;
    Promise.all(toFetch.map((w) => loadVectors(w).then((v) => [w, v] as const))).then(
      (results) => {
        if (cancelled) return;
        const nextVecs = new Map(vectors);
        const nextMissing = new Set(missing);
        for (const [w, v] of results) {
          if (v) nextVecs.set(w, v);
          else nextMissing.add(w);
        }
        setVectors(nextVecs);
        setMissing(nextMissing);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [anchors, targets, vectors, missing]);

  const years = useMemo(
    () => manifest?.years ?? Array.from({ length: VECTOR_N_YEARS }, (_, i) => 2014 + i),
    [manifest],
  );

  const anchorVecs = anchors.map((a) => (a ? vectors.get(a) : undefined));
  const anchorsReady = anchorVecs.every((v) => v !== undefined);

  const trajectories: Trajectory[] = useMemo(() => {
    if (!anchorsReady) return [];
    return targets
      .map((t, ti) => {
        const tv = vectors.get(t);
        if (!tv) return null;
        const sims: Trajectory["sims"] = [];
        for (let yi = 0; yi < VECTOR_N_YEARS; yi++) {
          const tyv = yearVec(tv, yi);
          const triple: [number, number, number] = [
            cosine(tyv, yearVec(anchorVecs[0]!, yi)),
            cosine(tyv, yearVec(anchorVecs[1]!, yi)),
            cosine(tyv, yearVec(anchorVecs[2]!, yi)),
          ];
          sims.push(triple);
        }
        return {
          target: t,
          color: TARGET_COLORS[ti % TARGET_COLORS.length],
          sims,
        };
      })
      .filter((x): x is Trajectory => x !== null);
  }, [anchorsReady, anchorVecs, targets, vectors]);

  function setAnchor(i: 0 | 1 | 2, w: string) {
    const next: [string, string, string] = [...anchors] as typeof anchors;
    next[i] = w.toLowerCase();
    setAnchors(next);
  }

  function setTarget(i: number, w: string) {
    const next = [...targets];
    next[i] = w.toLowerCase();
    setTargets(next);
  }

  function addTarget() {
    if (targets.length >= MAX_TARGETS) return;
    setTargets([...targets, ""]);
  }

  function removeTarget(i: number) {
    setTargets(targets.filter((_, j) => j !== i));
  }

  return (
    <main className="h-screen pt-16 lg:pt-20 px-6 lg:px-10 pb-6 flex flex-col">
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-mono mb-1">
            ternary
          </div>
          <h1 className="font-display text-2xl lg:text-3xl leading-none">
            Three poles. One word. Twelve years.
          </h1>
        </div>
        <p className="text-foreground/60 text-xs lg:text-sm max-w-md leading-relaxed text-right">
          Each axis is rescaled to the observed range. Each corner shows the
          maximum cosine reached for that anchor.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 flex-1 min-h-0">
        {/* picker column */}
        <aside className="flex flex-col gap-6 text-sm">
          {manifest && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
                  anchors
                </div>
                <div className="space-y-2">
                  {(["top", "bottom-left", "bottom-right"] as const).map((label, i) => (
                    <WordPicker
                      key={i}
                      label={label}
                      value={anchors[i as 0 | 1 | 2]}
                      words={manifest.words}
                      missing={missing.has(anchors[i as 0 | 1 | 2])}
                      onSelect={(w) => setAnchor(i as 0 | 1 | 2, w)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted font-mono">
                    targets
                  </div>
                  {targets.length < MAX_TARGETS && (
                    <button
                      onClick={addTarget}
                      className="text-[10px] uppercase tracking-widest text-muted hover:text-accent font-mono transition-colors"
                    >
                      + add
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {targets.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: TARGET_COLORS[i % TARGET_COLORS.length] }}
                      />
                      <div className="flex-1">
                        <WordPicker
                          label={`target ${i + 1}`}
                          value={t}
                          words={manifest.words}
                          missing={missing.has(t)}
                          onSelect={(w) => setTarget(i, w)}
                        />
                      </div>
                      {targets.length > 1 && (
                        <button
                          onClick={() => removeTarget(i)}
                          className="text-muted hover:text-foreground text-xs px-1"
                          title="remove"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* triangle */}
        <section className="relative min-h-[60vh] lg:min-h-0">
          <Triangle years={years} anchors={anchors} trajectories={trajectories} />
        </section>
      </div>
    </main>
  );
}

function WordPicker({
  label,
  value,
  words,
  missing,
  onSelect,
}: {
  label: string;
  value: string;
  words: ManifestWord[];
  missing: boolean;
  onSelect: (w: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return words.slice(0, 6);
    const exact: ManifestWord[] = [];
    const prefix: ManifestWord[] = [];
    for (const w of words) {
      if (w.w === q) exact.push(w);
      else if (w.w.startsWith(q)) prefix.push(w);
      if (exact.length + prefix.length > 30) break;
    }
    return [...exact, ...prefix].slice(0, 8);
  }, [query, words]);

  const handlePick = useCallback(
    (w: string) => {
      onSelect(w);
      setQuery(w);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onSelect],
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="text-[10px] text-muted/60 font-mono mb-0.5">{label}</div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
            setOpen(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            const target = suggestions[activeIdx]?.w ?? query.trim();
            if (target) handlePick(target);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`w-full bg-white/[0.03] border ${
          missing
            ? "border-red-500/50"
            : "border-white/10 focus:border-accent"
        } rounded px-2 py-1.5 text-base font-mono outline-none transition-colors`}
        autoComplete="off"
        spellCheck={false}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 z-30 backdrop-blur-md bg-black/70 border border-white/10 rounded shadow-2xl max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.w}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => handlePick(s.w)}
              className={`block w-full text-left px-2 py-1 text-sm font-mono transition-colors ${
                i === activeIdx ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              {s.w}
            </button>
          ))}
        </div>
      )}
      {missing && (
        <div className="text-[10px] text-red-400/80 font-mono mt-0.5">
          no vector
        </div>
      )}
    </div>
  );
}
