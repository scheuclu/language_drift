import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] grid place-items-center px-6 text-center">
      {/* aurora atmosphere, matching the rest of the site */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] sm:w-[720px] sm:h-[720px] rounded-full blur-[110px]"
          style={{ background: "radial-gradient(circle, rgba(120,80,200,0.14), rgba(244,184,96,0.06) 45%, transparent 70%)" }}
        />
        <div className="aurora aurora-a" style={{ top: "-10%", left: "12%", width: "min(46vw,460px)", aspectRatio: "1", background: "radial-gradient(circle, rgba(244,184,96,0.18), transparent 70%)" }} />
        <div className="aurora aurora-c" style={{ bottom: "-22%", right: "10%", width: "min(50vw,520px)", aspectRatio: "1.2", background: "radial-gradient(circle, rgba(93,213,232,0.12), transparent 70%)" }} />
      </div>

      <div className="relative max-w-lg">
        <div className="flex justify-center mb-6">
          <span className="kicker">
            <span className="kicker-dot" />
            404 · off the map
          </span>
        </div>
        <h1 className="font-display text-[clamp(40px,8vw,88px)] leading-[0.95] tracking-tight">
          This word <em className="text-shimmer">drifted away.</em>
        </h1>
        <p className="text-foreground/60 text-base sm:text-lg mt-5 leading-relaxed">
          That page isn&apos;t on the map. Words come and go over twelve years —
          try one of the ones that stayed.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/" className="btn-glow">
            Back to the intro
          </Link>
          <Link
            href="/space"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/15 text-foreground/75 hover:text-foreground hover:border-white/30 font-mono text-xs uppercase tracking-widest transition-colors"
          >
            Explore the map
          </Link>
        </div>
      </div>
    </main>
  );
}
