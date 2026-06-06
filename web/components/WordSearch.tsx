"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Jump-to-word search with prefix/substring autocomplete over the vocab.
// Navigates to the word dossier (/w/[word]). Shared by the dossier + index.
export function WordSearch({
  words,
  placeholder,
  className,
  large = false,
  autoFocus = false,
  onPick,
}: {
  words: string[];
  placeholder: string;
  className?: string;
  large?: boolean;
  autoFocus?: boolean;
  // when provided, pick a word via this callback instead of navigating to /w
  onPick?: (w: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const pre: string[] = [];
    const con: string[] = [];
    for (const w of words) {
      if (w === s || w.startsWith(s)) pre.push(w);
      else if (w.includes(s)) con.push(w);
      if (pre.length + con.length > 40) break;
    }
    return [...pre, ...con].slice(0, 8);
  }, [q, words]);
  const go = (w: string) => {
    if (onPick) {
      onPick(w);
      setQ("");
      setOpen(false);
    } else {
      router.push(`/w/${encodeURIComponent(w)}`);
    }
  };
  return (
    <div className={`relative w-full ${className ?? "sm:max-w-xs"}`}>
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(hits.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            const t = hits[active] ?? q.trim();
            if (t) go(t);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`w-full bg-black/35 border border-white/12 focus:border-accent/60 font-mono text-foreground outline-none placeholder:text-muted/60 transition-colors ${
          large
            ? "rounded-xl px-4 py-3.5 text-base"
            : "rounded-lg px-3 py-2.5 text-sm"
        }`}
      />
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 backdrop-blur-md bg-black/85 border border-white/10 rounded-lg overflow-hidden max-h-72 overflow-y-auto scrollbar-thin">
          {hits.map((w, i) => (
            <button
              key={w}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                go(w);
              }}
              className={`block w-full text-left px-3 py-2 text-sm font-mono ${
                i === active ? "bg-white/10 text-foreground" : "text-foreground/80 hover:bg-white/5"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
