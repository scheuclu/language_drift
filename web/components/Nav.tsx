"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MAIN_LINKS = [
  { href: "/", label: "intro" },
  { href: "/space", label: "galaxy map" },
  { href: "/explore", label: "neighborhood" },
];

const TOOL_LINKS = [
  {
    href: "/arith",
    label: "word math",
    desc: "Add and subtract word vectors to resolve meaning.",
  },
  {
    href: "/llm",
    label: "llm impact",
    desc: "See how machine-written text reshapes vocabulary.",
  },
  {
    href: "/ternary",
    label: "ternary orbits",
    desc: "Map trajectories relative to three anchor words.",
  },
  {
    href: "/gallery",
    label: "drift gallery",
    desc: "Explore top drifting words ranked by total drift.",
  },
];

export function Nav() {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close menus when pathname changes
  useEffect(() => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/40">
      <div className="hairline absolute bottom-0 inset-x-0" />
      <div className="px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          className="font-display text-base sm:text-lg leading-none flex items-baseline gap-2 shrink-0 hover:text-accent transition-colors"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_1px_rgba(244,184,96,0.7)] animate-pulse" />
          WordDrift
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2 lg:gap-3 text-sm">
          <ul className="flex items-center gap-0.5 sm:gap-2">
            {MAIN_LINKS.map((l) => {
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
                        ? "text-foreground bg-white/[0.06] border border-white/10"
                        : "text-muted hover:text-foreground hover:bg-white/[0.03] border border-transparent"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* Tools Dropdown trigger */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-full transition-all font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 border ${
                dropdownOpen || TOOL_LINKS.some((t) => pathname === t.href)
                  ? "text-accent bg-white/[0.06] border-white/10"
                  : "text-muted hover:text-foreground hover:bg-white/[0.03] border-transparent"
              }`}
            >
              tools
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Dropdown menu */}
            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-72 rounded-xl border border-white/10 bg-black/85 backdrop-blur-xl p-2.5 shadow-2xl z-50"
                >
                  <div className="grid gap-1">
                    {TOOL_LINKS.map((tool) => {
                      const active = pathname === tool.href;
                      return (
                        <Link
                          key={tool.href}
                          href={tool.href}
                          className={`group flex flex-col p-2.5 rounded-lg transition-colors text-left ${
                            active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <span className="font-mono text-xs uppercase tracking-wider text-foreground group-hover:text-accent transition-colors">
                            {tool.label}
                          </span>
                          <span className="text-[10px] text-muted leading-normal mt-0.5 group-hover:text-foreground/75 transition-colors">
                            {tool.desc}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-muted hover:text-foreground transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="md:hidden border-b border-white/10 bg-black/95 backdrop-blur-2xl overflow-hidden"
          >
            <div className="px-5 pt-3 pb-6 space-y-4">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-1">core space</div>
                {MAIN_LINKS.map((l) => {
                  const active =
                    l.href === "/"
                      ? pathname === "/"
                      : pathname === l.href || pathname.startsWith(l.href + "/");
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`block py-2 text-sm font-mono uppercase tracking-wider transition-colors ${
                        active ? "text-accent" : "text-foreground/80 hover:text-foreground"
                      }`}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </div>
              <div className="space-y-1 border-t border-white/5 pt-3">
                <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-1">analysis & tools</div>
                {TOOL_LINKS.map((tool) => {
                  const active = pathname === tool.href;
                  return (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className={`block py-2 text-sm font-mono uppercase tracking-wider transition-colors ${
                        active ? "text-accent" : "text-foreground/80 hover:text-foreground"
                      }`}
                    >
                      {tool.label}
                      <span className="block text-[10px] text-muted normal-case tracking-normal font-sans mt-0.5">
                        {tool.desc}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
