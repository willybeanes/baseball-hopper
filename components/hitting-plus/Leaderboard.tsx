"use client";

import { useEffect, useMemo, useState } from "react";
import { Player, StatKey } from "@/lib/hitting-plus/types";
import { fmtNum, fmtSigned, formatName } from "@/lib/hitting-plus/metrics";
import { ramp } from "@/lib/hitting-plus/ramp";
import { MlbInfo, resolveMlbInfo } from "@/lib/hitting-plus/headshot";
import Headshot from "./Headshot";

type PctFn = (x: number | null | undefined) => number | null;

interface Row extends Player {
  gap: number | null;
}

const COLUMNS: { key: keyof Row | "gap"; label: string; pctKey?: StatKey }[] = [
  { key: "player_name", label: "Hitter" },
  { key: "Hitting+", label: "Hitting+", pctKey: "Hitting+" },
  { key: "Decision+", label: "Decision+", pctKey: "Decision+" },
  { key: "Timing+", label: "Timing+", pctKey: "Timing+" },
  { key: "Contact+", label: "Contact+", pctKey: "Contact+" },
  { key: "Power+", label: "Power+", pctKey: "Power+" },
  { key: "xwoba", label: "xwOBA", pctKey: "xwoba" },
  { key: "wrc_plus", label: "wRC+", pctKey: "wrc_plus" },
  { key: "gap", label: "Gap" },
];

/** Resolves team/position for a batch of names with limited concurrency, caching across calls. */
function usePlayerInfo(names: string[]) {
  const [info, setInfo] = useState<Record<string, MlbInfo | null>>({});

  useEffect(() => {
    let cancelled = false;
    const CONCURRENCY = 12;
    const toFetch = names.filter((n) => !(n in info));
    if (toFetch.length === 0) return;

    let idx = 0;
    async function worker() {
      while (idx < toFetch.length) {
        const name = toFetch[idx++];
        const result = await resolveMlbInfo(name);
        if (cancelled) return;
        setInfo((prev) => (name in prev ? prev : { ...prev, [name]: result }));
      }
    }
    for (let i = 0; i < Math.min(CONCURRENCY, toFetch.length); i++) worker();

    return () => {
      cancelled = true;
    };
  }, [names, info]);

  return info;
}

export default function Leaderboard({
  players,
  pct,
  onSelect,
  minPA,
  season,
  teamFilter,
  onChangeTeamFilter,
}: {
  players: Player[];
  pct: Record<StatKey, PctFn>;
  onSelect: (name: string) => void;
  minPA: number;
  season: number;
  teamFilter: string;
  onChangeTeamFilter: (team: string) => void;
}) {
  const seasonKey = String(season);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "Hitting+", dir: -1 });
  const [posFilter, setPosFilter] = useState("");

  const names = useMemo(() => Array.from(new Set(players.map((p) => p.player_name))), [players]);
  const info = usePlayerInfo(names);
  const resolvedCount = useMemo(() => names.filter((n) => n in info).length, [names, info]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of names) {
      for (const t of info[n]?.teamsBySeason?.[seasonKey] ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [names, info, seasonKey]);

  const posOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of names) {
      const p = info[n]?.position;
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [names, info]);

  const rows: Row[] = useMemo(() => {
    return players
      .filter((r) => !teamFilter || (info[r.player_name]?.teamsBySeason?.[seasonKey]?.includes(teamFilter) ?? false))
      .filter((r) => !posFilter || info[r.player_name]?.position === posFilter)
      .map((r) => {
        const hp = pct["Hitting+"](r["Hitting+"]);
        const xp = pct["xwoba"](r.xwoba);
        return { ...r, gap: hp != null && xp != null ? hp - xp : null };
      });
  }, [players, pct, teamFilter, posFilter, info, seasonKey]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const A = a[sort.k as keyof Row];
      const B = b[sort.k as keyof Row];
      if (typeof A === "string" || typeof B === "string") {
        return sort.dir * String(A ?? "").localeCompare(String(B ?? ""));
      }
      const an = A as number | null;
      const bn = B as number | null;
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      return sort.dir * (an - bn);
    });
    return copy;
  }, [rows, sort]);

  function onSort(k: string) {
    setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "player_name" ? 1 : -1 }));
  }

  const loadingInfo = resolvedCount < names.length;

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-6 shadow-[var(--panel-shadow)] sm:px-7 sm:py-6">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          Hitters with {minPA}+ PA
        </h2>
        <span className="text-xs text-[var(--dimmer)]">{sorted.length} shown</span>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <select
          value={teamFilter}
          onChange={(e) => onChangeTeamFilter(e.target.value)}
          className="rounded-lg border border-[var(--rule)] bg-white px-2.5 py-1.5 text-xs text-[var(--text)]"
        >
          <option value="">All teams</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="rounded-lg border border-[var(--rule)] bg-white px-2.5 py-1.5 text-xs text-[var(--text)]"
        >
          <option value="">All positions</option>
          {posOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {loadingInfo && (
          <span className="text-[11px] text-[var(--dimmer)]">
            loading teams and positions ({resolvedCount}/{names.length})...
          </span>
        )}
      </div>
      <p className="mb-3.5 -mt-1 text-[11px] text-[var(--dimmer)]">
        Team reflects who the player logged plate appearances for in the selected season; a player traded mid-year
        shows every club he hit for that year. Position comes from his current MLB roster listing.
      </p>

      <div className="max-h-[70vh] overflow-auto rounded-[10px] border border-[var(--rule)]">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  onClick={() => onSort(c.key as string)}
                  aria-sort={sort.k === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`sticky top-0 cursor-pointer select-none whitespace-nowrap border-b border-[var(--rule)] bg-[var(--panel)] px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] shadow-[0_1px_0_var(--rule)] hover:text-[var(--text)] ${
                    c.key === "player_name" ? "left-0 z-20 text-left" : "z-10 text-right"
                  } ${sort.k === c.key ? "text-[var(--accent)]" : "text-[var(--dim)]"}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const rowInfo = info[r.player_name];
              // Team(s) for THIS season, so the label agrees with the season-aware filter;
              // fall back to the current club only when no season history is available.
              const seasonTeams = rowInfo?.teamsBySeason?.[seasonKey];
              const teamLabel = seasonTeams?.length ? seasonTeams.join("/") : rowInfo?.team ?? null;
              return (
                <tr
                  key={r.player_name}
                  onClick={() => onSelect(r.player_name)}
                  className="group cursor-pointer border-t border-[var(--rule)] hover:bg-[var(--track)]"
                >
                  <td className="sticky left-0 z-[1] bg-[var(--panel)] px-2.5 py-2 text-left font-medium group-hover:bg-[var(--track)] group-hover:text-[var(--accent)]">
                    <span className="flex items-center gap-2">
                      <Headshot name={r.player_name} size={22} />
                      <span>
                        <span className="block">{formatName(r.player_name)}</span>
                        {rowInfo && (teamLabel || rowInfo.position) && (
                          <span className="block text-[11px] font-normal text-[var(--dimmer)]">
                            {[teamLabel, rowInfo.position].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  {COLUMNS.slice(1).map((c) => {
                    const value = c.key === "gap" ? r.gap : (r[c.key as keyof Row] as number | null);
                    const p50 = c.pctKey ? pct[c.pctKey](value) : c.key === "gap" ? null : null;
                    const color =
                      c.key === "gap"
                        ? r.gap == null
                          ? "var(--dim)"
                          : r.gap > 25
                          ? "var(--accent)"
                          : r.gap < -25
                          ? "var(--cool)"
                          : "var(--dim)"
                        : p50 != null
                        ? ramp(p50)
                        : "var(--text)";
                    const digits = c.key === "xwoba" ? 3 : 0;
                    const text = c.key === "gap" ? (r.gap == null ? "--" : fmtSigned(r.gap, 0)) : fmtNum(value, digits);
                    return (
                      <td
                        key={c.key}
                        className={`px-2.5 py-2 text-right tabular-nums ${c.key === "Hitting+" || c.key === "gap" ? "font-bold" : ""}`}
                        style={{ color }}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
