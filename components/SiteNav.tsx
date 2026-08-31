"use client";

import { useEffect, useRef, useState } from "react";

const TOOLS = [
  { label: "Hitting+",           href: "https://hitting-plus.vercel.app",          external: true  },
  { label: "Percentile Compare", href: "/compare",                                  external: false },
  { label: "Battery Splits",     href: "/battery",                                  external: false },
  { label: "Stuff Splits",       href: "https://stuff-splits.vercel.app",           external: true  },
  { label: "Scatter Plot",       href: "/scatter",                                  external: false },
  { label: "WAR Breakdown",      href: "/war",                                      external: false },
  { label: "Play-by-Play",       href: "/pbp",                                      external: false },
  { label: "Opposing Probables", href: "/probables",                               external: false },
  { label: "xR Philosophy",      href: "https://willybeanes.github.io/xr-philosophy/", external: true },
  { label: "All-Star Ballot",    href: "/ballot",                                   external: false },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--rule)] bg-[var(--panel)] backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between gap-4">

        {/* Wordmark */}
        <a
          href="/"
          className="flex items-center gap-2 group shrink-0"
          aria-label="Baseball Hopper home"
        >
          <span className="text-base leading-none">⚾</span>
          <span className="font-bold text-[15px] tracking-tight group-hover:text-[var(--accent)] transition-colors">
            Baseball Hopper
          </span>
          <span className="hidden sm:inline text-[11px] text-[var(--dimmer)] ml-0.5 font-normal">
            · Balls &amp; Sticks
          </span>
        </a>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Tool switcher */}
          <div ref={ref} className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--dim)] hover:text-[var(--text)] transition-colors px-2 py-1 rounded-md hover:bg-[var(--bg)]"
              aria-haspopup="true"
              aria-expanded={open}
            >
              All tools
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
              >
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--elevated-shadow)] py-1.5 z-50">
                {TOOLS.map((tool) => (
                  <a
                    key={tool.label}
                    href={tool.href}
                    {...(tool.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between px-3.5 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                  >
                    {tool.label}
                    {tool.external && (
                      <span className="text-[var(--dimmer)] text-[10px]">↗</span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
