"use client";

import { useEffect, useRef, useState } from "react";

const NAV_GROUPS = [
  {
    label: "Hitters",
    tools: [
      { label: "Hitting+", href: "/hitting-plus", external: false },
      { label: "Percentile Compare", href: "/compare", external: false },
    ],
  },
  {
    label: "Pitchers",
    tools: [
      { label: "Battery Splits", href: "/battery", external: false },
      { label: "Stuff Splits", href: "/stuff/platoon", external: false },
    ],
  },
  {
    label: "Games",
    tools: [
      { label: "Play-by-Play", href: "/pbp", external: false },
      { label: "Opposing Probables", href: "/probables", external: false },
    ],
  },
  {
    label: "More",
    tools: [
      { label: "Scatter Plot", href: "https://fg-scatter.vercel.app/", external: true },
      { label: "WAR Breakdown", href: "/war", external: false },
      { label: "xR Philosophy", href: "https://willybeanes.github.io/xr-philosophy/", external: true },
      { label: "All-Star Ballot", href: "/ballot", external: false },
    ],
  },
];

const ALL_TOOLS = NAV_GROUPS.flatMap((g) => g.tools);

export default function SiteNav() {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--rule)] bg-[var(--panel)] backdrop-blur-sm">
      <div ref={navRef} className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between gap-4">

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

        {/* Desktop nav groups */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="relative">
              <button
                onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                className={`flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                  openGroup === group.label
                    ? "text-[var(--text)] bg-[var(--bg)]"
                    : "text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                }`}
              >
                {group.label}
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className={`transition-transform duration-150 ${openGroup === group.label ? "rotate-180" : ""}`}
                >
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {openGroup === group.label && (
                <div className="absolute left-0 top-full mt-1.5 min-w-44 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--elevated-shadow)] py-1.5 z-50">
                  {group.tools.map((tool) => (
                    <a
                      key={tool.label}
                      href={tool.href}
                      {...(tool.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      onClick={() => setOpenGroup(null)}
                      className="flex items-center justify-between px-3.5 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                    >
                      {tool.label}
                      {tool.external && <span className="text-[var(--dimmer)] text-[10px]">↗</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <div className="lg:hidden relative">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--dim)] hover:text-[var(--text)] transition-colors px-2 py-1 rounded-md hover:bg-[var(--bg)]"
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {mobileOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--elevated-shadow)] py-1.5 z-50">
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div className="my-1 border-t border-[var(--panel-border)]" />}
                  <p className="px-3.5 py-1 text-[10px] font-semibold text-[var(--dimmer)] uppercase tracking-wider">
                    {group.label}
                  </p>
                  {group.tools.map((tool) => (
                    <a
                      key={tool.label}
                      href={tool.href}
                      {...(tool.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between px-3.5 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                    >
                      {tool.label}
                      {tool.external && <span className="text-[var(--dimmer)] text-[10px]">↗</span>}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
