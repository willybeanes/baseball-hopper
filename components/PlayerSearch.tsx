"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerIndexRow } from "@/app/api/players/route";

/** Strip accents and case so "acuna" finds "Acuña". */
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

let indexPromise: Promise<PlayerIndexRow[]> | null = null;
function loadIndex() {
  indexPromise ??= fetch("/api/players")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => {
      indexPromise = null;
      return [];
    });
  return indexPromise;
}

const MAX_RESULTS = 8;

/** Navbar player search. Loads the index on first focus and filters it locally. */
export default function PlayerSearch({
  autoFocus = false,
  onNavigate,
  className = "",
}: {
  autoFocus?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<{ row: PlayerIndexRow; key: string }[] | null>(null);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  function ensureIndex() {
    if (index) return;
    loadIndex().then((rows) => setIndex(rows.map((row) => ({ row, key: norm(row[1]) }))));
  }

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      ensureIndex();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  // "/" focuses the search from anywhere, unless the user is already typing somewhere.
  useEffect(() => {
    if (autoFocus) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!inputRef.current?.offsetParent) return;
      e.preventDefault();
      inputRef.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [autoFocus]);

  const results = useMemo(() => {
    const q = norm(term.trim());
    if (!q || !index) return [];
    const scored: { row: PlayerIndexRow; score: number }[] = [];
    for (const { row, key } of index) {
      const at = key.indexOf(q);
      if (at < 0) continue;
      // Whole-name prefix beats a word prefix ("judge") beats a match mid-word.
      const score = at === 0 ? 0 : key[at - 1] === " " ? 1 : 2;
      scored.push({ row, score });
    }
    return scored
      .sort((a, b) => a.score - b.score || b.row[4] - a.row[4] || a.row[1].localeCompare(b.row[1]))
      .slice(0, MAX_RESULTS)
      .map((s) => s.row);
  }, [term, index]);

  function go(id: number) {
    setTerm("");
    setOpen(false);
    setActive(0);
    inputRef.current?.blur();
    onNavigate?.();
    router.push(`/player/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      onNavigate?.();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active][0]);
    }
  }

  const showList = open && term.trim().length > 0;

  return (
    <div className={`relative ${className}`}>
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dim)]"
      >
        <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search players"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search players"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          ensureIndex();
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="h-8 w-full rounded-md border border-[var(--rule)] bg-[var(--bg)] pl-8 pr-7 text-sm text-[var(--text)] placeholder:text-[var(--dim)] focus-visible:border-[var(--accent)] focus-visible:outline-none"
      />
      {!autoFocus && !term && (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--rule)] px-1 text-[11px] leading-4 text-[var(--dim)]">
          /
        </kbd>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[360px] overflow-auto rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] py-1.5 shadow-[var(--elevated-shadow)]"
        >
          {!index && <li className="px-3.5 py-2 text-xs text-[var(--dim)]">Loading players…</li>}
          {index && results.length === 0 && (
            <li className="px-3.5 py-2 text-xs text-[var(--dim)]">No player by that name</li>
          )}
          {results.map(([id, name, team, pos, season], i) => (
            <li
              key={id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(id)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2 text-sm ${
                i === active ? "bg-[var(--bg)]" : ""
              }`}
            >
              <span className="truncate text-[var(--text)]">{name}</span>
              <span className="shrink-0 text-xs text-[var(--dim)]">
                {[pos, team, season < new Date().getFullYear() ? String(season) : null].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
