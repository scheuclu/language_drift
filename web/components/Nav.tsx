"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// NOTE: nav-hidden routes (still resolve by direct URL, just not linked):
//  - /llm: hidden in prod — not good enough yet; an improved version is in
//    progress on the `feature/llm-drama` branch. Re-add when it ships.
//  - /gallery, /ternary: candidates for deletion (gallery routes into the
//    removed /explore view); /explore is deep-link-only. See CLAUDE.md.
const LINKS = [
  { href: "/", label: "story" },
  { href: "/space", label: "space" },
  { href: "/arith", label: "arith" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/40 border-b border-white/[0.06]">
      <div className="px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          className="font-display text-base sm:text-lg leading-none flex items-baseline gap-2 shrink-0"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-accent" />
          {/* full name on roomy screens, just "Drift" when space is tight */}
          <span className="hidden sm:inline">Language&nbsp;Drift</span>
          <span className="sm:hidden">Drift</span>
        </Link>
        <ul className="flex items-center gap-0.5 sm:gap-2 lg:gap-3 text-sm">
          {LINKS.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-full transition-colors font-mono text-xs uppercase tracking-wider ${
                    active
                      ? "text-foreground bg-white/[0.06]"
                      : "text-muted hover:text-foreground hover:bg-white/[0.03]"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
