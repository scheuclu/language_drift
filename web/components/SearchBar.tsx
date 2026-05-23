"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ManifestWord } from "@/lib/types";

type Props = {
  words: ManifestWord[];
  value: string;
  onSelect: (w: string) => void;
  placeholder?: string;
};

export function SearchBar({ words, value, onSelect, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (!q) {
      return words.slice(0, 8);
    }
    const exact: ManifestWord[] = [];
    const prefix: ManifestWord[] = [];
    const contains: ManifestWord[] = [];
    for (const w of words) {
      if (w.w === q) exact.push(w);
      else if (w.w.startsWith(q)) prefix.push(w);
      else if (w.w.includes(q)) contains.push(w);
      if (exact.length + prefix.length + contains.length > 80) break;
    }
    return [...exact, ...prefix, ...contains].slice(0, 12);
  }, [query, words]);

  function pick(w: string) {
    onSelect(w);
    setQuery(w);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
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
            if (target) pick(target);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder ?? "type a word…"}
        className="w-full bg-transparent border-b border-white/15 focus:border-accent text-2xl py-3 outline-none placeholder:text-muted/60 transition-colors font-display italic"
        autoComplete="off"
        spellCheck={false}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 z-30 backdrop-blur-md bg-black/40 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          {suggestions.map((s, i) => (
            <button
              key={s.w}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => pick(s.w)}
              className={`block w-full text-left px-4 py-2 transition-colors ${
                i === activeIdx ? "bg-white/8" : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-display text-lg">{s.w}</span>
                <span className="text-xs text-muted font-mono">
                  drift {s.d.toFixed(2)}
                </span>
                <span className="text-xs text-muted/60 font-mono ml-auto">
                  {compactNum(s.fm)}/yr
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
