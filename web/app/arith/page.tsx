"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadArithCorpus, arithmeticTopK, type ArithCorpus, type Term } from "@/lib/arith";

const DEFAULT_TERMS: Term[] = [
  { sign: 1, word: "usa" },
  { sign: -1, word: "rich" },
];

const EXAMPLES: { label: string; terms: Term[] }[] = [
  {
    label: "king − man + woman",
    terms: [
      { sign: 1, word: "king" },
      { sign: -1, word: "man" },
      { sign: 1, word: "woman" },
    ],
  },
  {
    label: "paris − france + germany",
    terms: [
      { sign: 1, word: "paris" },
      { sign: -1, word: "france" },
      { sign: 1, word: "germany" },
    ],
  },
  {
    label: "usa − rich",
    terms: [
      { sign: 1, word: "usa" },
      { sign: -1, word: "rich" },
    ],
  },
];

const ARITH_YEAR = 2025;

export default function ArithPage() {
  const [terms, setTerms] = useState<Term[]>(DEFAULT_TERMS);
  const [corpus, setCorpus] = useState<ArithCorpus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadArithCorpus().then((c) => {
      if (!c) setError("corpus not available — run scripts/precompute_arithmetic.py");
      else setCorpus(c);
    });
  }, []);

  const allValid = corpus
    ? terms.every((t) => corpus.wordToIdx.has(t.word.toLowerCase()))
    : false;

  const results = useMemo(() => {
    if (!corpus || !allValid || terms.length === 0) return null;
    return arithmeticTopK(terms, corpus, 12);
  }, [terms, corpus, allValid]);

  function setTerm(i: number, patch: Partial<Term>) {
    setTerms((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function removeTerm(i: number) {
    setTerms((prev) => prev.filter((_, j) => j !== i));
  }
  function addTerm() {
    setTerms((prev) => [...prev, { sign: 1, word: "" }]);
  }
  function addAsTerm(word: string) {
    setTerms((prev) => [...prev, { sign: 1, word }]);
  }

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-20 pb-16 px-5 sm:px-6 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[680px] h-[420px] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(139,108,255,0.12), rgba(244,184,96,0.05) 50%, transparent 72%)" }}
      />
      <div className="relative max-w-4xl mx-auto">
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-2">
          vector arithmetic
        </div>
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl leading-tight sm:leading-none mb-3">
          Geometry that encodes meaning.
        </h1>
        <p className="text-foreground/60 text-sm sm:text-base max-w-2xl leading-relaxed mb-6">
          The {ARITH_YEAR} aligned embeddings form a vector space where direction
          carries sense. Add and subtract word vectors, then read off the nearest
          real words. Tap an example, or build your own.
        </p>
        {/* example equations — click to load */}
        <div className="flex flex-wrap items-center gap-2 mb-10">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setTerms(ex.terms)}
              className="px-3 py-1.5 rounded-full text-xs font-mono border border-white/12 bg-white/[0.03] text-foreground/75 hover:text-foreground hover:border-accent/40 hover:bg-accent/[0.07] transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Equation */}
        <div className="flex flex-wrap items-center gap-2 mb-8 font-mono">
          {terms.map((t, i) => (
            <TermPill
              key={i}
              term={t}
              showSign={i > 0}
              onSignChange={(s) => setTerm(i, { sign: s })}
              onWordChange={(w) => setTerm(i, { word: w })}
              onRemove={terms.length > 1 ? () => removeTerm(i) : undefined}
              corpus={corpus}
            />
          ))}
          <button
            type="button"
            onClick={addTerm}
            className="px-3 py-2 text-sm border border-dashed border-white/15 rounded-md text-muted hover:text-foreground hover:border-white/30 transition-colors"
          >
            + term
          </button>
        </div>

        {/* Results */}
        <div className="border-t border-white/10 pt-6">
          <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
            nearest in {ARITH_YEAR}
          </div>
          {!corpus ? (
            <div className="flex items-center gap-2.5 text-muted text-sm font-mono">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
              </span>
              {error ?? "loading corpus…"}
            </div>
          ) : !allValid ? (
            <div className="text-muted/60 text-sm font-mono italic">
              one or more terms aren&apos;t in the vocabulary (need freq ≥ 3,000 in any year)
            </div>
          ) : !results ? (
            <div className="text-muted/60 text-sm font-mono italic">add at least one term</div>
          ) : (
            <ol className="space-y-2.5">
              {results.map((r, i) => {
                const max = results[0]?.sim || 1;
                const pct = Math.max(4, (r.sim / max) * 100);
                return (
                  <li key={r.word} className="group">
                    <div className="flex items-baseline gap-3 sm:gap-4 font-mono">
                      <span className="text-muted/40 text-xs tabular-nums w-6 text-right shrink-0">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => addAsTerm(r.word)}
                        className="text-foreground text-lg hover:text-accent active:text-accent transition-colors -mx-1 px-1 py-0.5 rounded"
                        title="add to terms"
                      >
                        {r.word}
                      </button>
                      <span className="ml-auto text-muted text-sm tabular-nums">
                        {r.sim.toFixed(3)}
                      </span>
                    </div>
                    <div className="mt-1.5 ml-9 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-500 group-hover:to-accent-3"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </main>
  );
}

/** A single +/- (word) pill in the equation. */
function TermPill({
  term,
  showSign,
  onSignChange,
  onWordChange,
  onRemove,
  corpus,
}: {
  term: Term;
  showSign: boolean;
  onSignChange: (s: 1 | -1) => void;
  onWordChange: (w: string) => void;
  onRemove?: () => void;
  corpus: ArithCorpus | null;
}) {
  const valid =
    !corpus || term.word === ""
      ? true
      : corpus.wordToIdx.has(term.word.toLowerCase());

  return (
    <div className="flex items-stretch">
      {showSign && (
        <button
          type="button"
          onClick={() => onSignChange(term.sign === 1 ? -1 : 1)}
          className={`px-2.5 text-xl font-bold leading-none flex items-center transition-colors ${
            term.sign === 1
              ? "text-accent hover:text-accent/70"
              : "text-[#ff6b88] hover:text-[#ff6b88]/70"
          }`}
          title="toggle sign"
        >
          {term.sign === 1 ? "+" : "−"}
        </button>
      )}
      <WordInput
        value={term.word}
        onChange={onWordChange}
        valid={valid}
        corpus={corpus}
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="px-2 text-muted/50 hover:text-foreground transition-colors text-base leading-none flex items-center"
          title="remove"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Word input with substring/prefix autocomplete against the corpus word list. */
function WordInput({
  value,
  onChange,
  valid,
  corpus,
}: {
  value: string;
  onChange: (w: string) => void;
  valid: boolean;
  corpus: ArithCorpus | null;
}) {
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    if (!corpus) return [];
    const q = local.trim().toLowerCase();
    if (!q) return corpus.words.slice(0, 8);
    const exact: string[] = [];
    const prefix: string[] = [];
    const contains: string[] = [];
    for (const w of corpus.words) {
      if (w === q) exact.push(w);
      else if (w.startsWith(q)) prefix.push(w);
      else if (w.includes(q)) contains.push(w);
      if (exact.length + prefix.length + contains.length > 60) break;
    }
    return [...exact, ...prefix, ...contains].slice(0, 10);
  }, [local, corpus]);

  function pick(w: string) {
    setLocal(w);
    onChange(w);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Commit the current text as the word on blur so users can type freely.
          if (local !== value) onChange(local);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
            setOpen(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const target = suggestions[activeIdx] ?? local.trim();
            if (target) pick(target);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`bg-white/[0.04] border rounded-md px-3 py-2 text-base outline-none transition-colors w-[128px] sm:w-[140px] ${
          valid
            ? "border-white/15 focus:border-accent text-foreground"
            : "border-[#ff6b88]/50 focus:border-[#ff6b88] text-[#ff6b88]"
        }`}
        autoComplete="off"
        spellCheck={false}
        placeholder="word…"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-30 min-w-full backdrop-blur-md bg-black/70 border border-white/10 rounded-md overflow-hidden shadow-2xl max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                // mousedown (not click) so it fires before input blur.
                e.preventDefault();
                pick(s);
              }}
              className={`block w-full text-left px-3 py-1.5 text-sm transition-colors ${
                i === activeIdx ? "bg-white/8 text-foreground" : "text-foreground/80 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
