"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "intro" },
  { href: "/space", label: "explore" },
  { href: "/arith", label: "arith" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/40">
      <div className="hairline absolute bottom-0 inset-x-0" />
      <div className="px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          className="font-display text-base sm:text-lg leading-none flex items-baseline gap-2 shrink-0"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_1px_rgba(244,184,96,0.7)]" />
          WordDrift
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
