"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Player, StatKey } from "@/lib/hitting-plus/types";
import type { MlbInfo } from "@/lib/hitting-plus/headshot";
import { fmtNum, formatName } from "@/lib/hitting-plus/metrics";
import { ramp } from "@/lib/hitting-plus/ramp";
import { TEAM_ABBR } from "@/lib/hitting-plus/teams";

type PctFn = (x: number | null | undefined) => number | null;

interface TeamRow {
  team: string;
  players: number;
  pa: number;
  "Hitting+": number | null;
  "Decision+": number | null;
  "Timing+": number | null;
  "Contact+": number | null;
  "Power+": number | null;
  xwoba: number | null;
  wrc_plus: number | null;
}

/** A player's share of one team's season: `pa` is his PA credited to that team. */
interface Stint {
  player: Player;
  pa: number;
  split: boolean;
}

type SortKey = keyof Omit<TeamRow, "team">;

const GRADE_COLS: { key: keyof TeamRow; label: string; pctKey?: StatKey; decimals?: number }[] = [
  { key: "Hitting+",  label: "Hit+",  pctKey: "Hitting+" },
  { key: "Decision+", label: "Dec+",  pctKey: "Decision+" },
  { key: "Timing+",   label: "Tim+",  pctKey: "Timing+" },
  { key: "Contact+",  label: "Con+",  pctKey: "Contact+" },
  { key: "Power+",    label: "Pow+",  pctKey: "Power+" },
  { key: "xwoba",     label: "xwOBA", pctKey: "xwoba", decimals: 3 },
  { key: "wrc_plus",  label: "wRC+",  pctKey: "wrc_plus" },
];

const MLB_API = "https://statsapi.mlb.com/api/v1";

function weightedMean(pairs: [number, number][]) {
  let num = 0, den = 0;
  for (const [v, w] of pairs) { num += v * w; den += w; }
  return den > 0 ? num / den : null;
}

/** Teams a player logged hitting stats for in `season`, per player_info. */
function seasonTeams(pi: MlbInfo, season: number): string[] {
  const listed = pi.teamsBySeason?.[String(season)];
  if (listed?.length) return listed;
  return pi.team ? [pi.team] : [];
}

/**
 * Per-team PA for every player who played for more than one club in `season`, keyed by
 * MLBAM id, from the MLB Stats API (one batched request per 100 players). The dataset
 * only has season totals, so this is what lets a traded player count toward each team.
 * Null while loading; an empty map if the API is unreachable.
 */
function useTeamSplits(players: Player[], info: Record<string, MlbInfo>, season: number) {
  const ids = useMemo(() => {
    const out: number[] = [];
    for (const p of players) {
      const pi = info[p.player_name];
      if (pi && seasonTeams(pi, season).length > 1) out.push(pi.id);
    }
    return out.sort((a, b) => a - b);
  }, [players, info, season]);
  const key = `${season}:${ids.join(",")}`;

  const [splits, setSplits] = useState<{ key: string; byId: Record<number, Record<string, number>> } | null>(null);
  useEffect(() => {
    if (!ids.length) { setSplits({ key, byId: {} }); return; }
    let cancelled = false;
    (async () => {
      const byId: Record<number, Record<string, number>> = {};
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const url =
            `${MLB_API}/people?personIds=${ids.slice(i, i + 100).join(",")}` +
            `&hydrate=stats(group=[hitting],type=[season],season=${season})`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`statsapi ${res.status}`);
          const json = await res.json();
          for (const person of json.people ?? []) {
            const byTeam: Record<string, number> = {};
            for (const group of person.stats ?? []) {
              for (const s of group.splits ?? []) {
                const team = TEAM_ABBR[s.team?.name];
                const pa = s.stat?.plateAppearances;
                if (team && pa > 0) byTeam[team] = (byTeam[team] ?? 0) + pa;
              }
            }
            byId[person.id] = byTeam;
          }
        }
      } catch (err) {
        console.error("Team splits:", err);
      }
      if (!cancelled) setSplits({ key, byId });
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return splits?.key === key ? splits.byId : null;
}

export default function Teams({
  players,
  info,
  season,
  pct,
  onSelectPlayer,
}: {
  players: Player[];
  info: Record<string, MlbInfo>;
  season: number;
  pct: Record<StatKey, PctFn>;
  onSelectPlayer: (name: string) => void;
}) {
  const splits = useTeamSplits(players, info, season);
  const [sortKey, setSortKey] = useState<SortKey>("Hitting+");
  const [sortAsc, setSortAsc] = useState(false);

  // Credit each player's PA to the teams he played for. A traded player's PA is divided
  // by his actual per-team PA; without a split he goes to his current (or last listed) team.
  const stintsByTeam = useMemo(() => {
    const byTeam = new Map<string, Stint[]>();
    if (!splits) return byTeam;
    const add = (team: string, stint: Stint) => {
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team)!.push(stint);
    };
    for (const p of players) {
      const pi = info[p.player_name];
      if (!pi) continue;
      const teams = seasonTeams(pi, season);
      if (!teams.length) continue;
      const split = teams.length > 1 ? splits[pi.id] : undefined;
      const total = split ? Object.values(split).reduce((s, n) => s + n, 0) : 0;
      if (split && total > 0) {
        for (const [team, n] of Object.entries(split)) add(team, { player: p, pa: (p.pa * n) / total, split: true });
      } else {
        const team = pi.team && teams.includes(pi.team) ? pi.team : teams[teams.length - 1];
        add(team, { player: p, pa: p.pa, split: false });
      }
    }
    return byTeam;
  }, [splits, info, players, season]);

  const teamRows = useMemo<TeamRow[]>(() => {
    const rows: TeamRow[] = [];
    for (const [team, stints] of stintsByTeam) {
      function wavg(key: keyof Player) {
        const pairs = stints
          .map((s) => [s.player[key] as number | null, s.pa] as [number | null, number])
          .filter((pair): pair is [number, number] => pair[0] != null);
        return weightedMean(pairs);
      }

      rows.push({
        team,
        players: stints.length,
        pa: Math.round(stints.reduce((s, st) => s + st.pa, 0)),
        "Hitting+": wavg("Hitting+"),
        "Decision+": wavg("Decision+"),
        "Timing+": wavg("Timing+"),
        "Contact+": wavg("Contact+"),
        "Power+": wavg("Power+"),
        xwoba: wavg("xwoba"),
        wrc_plus: wavg("wrc_plus"),
      });
    }
    return rows;
  }, [stintsByTeam]);

  const sorted = useMemo(() => {
    return [...teamRows].sort((a, b) => {
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortAsc ? av - bv : bv - av;
    });
  }, [teamRows, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  // Players on the selected team, sorted by Hitting+
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const expandedPlayers = useMemo(() => {
    if (!expandedTeam) return [];
    return [...(stintsByTeam.get(expandedTeam) ?? [])].sort(
      (a, b) => (b.player["Hitting+"] ?? -Infinity) - (a.player["Hitting+"] ?? -Infinity),
    );
  }, [expandedTeam, stintsByTeam]);

  if (!splits) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] text-sm text-[var(--dimmer)] shadow-[var(--panel-shadow)]">
        Loading…
      </div>
    );
  }

  const thBase =
    "py-2.5 pr-3 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dim)] cursor-pointer select-none hover:text-[var(--text)]";

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--panel-shadow)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--rule)]">
              <th className="py-2.5 pl-5 pr-3 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
                Team
              </th>
              <th
                className={thBase + (sortKey === "players" ? " text-[var(--text)]" : "")}
                onClick={() => handleSort("players")}
              >
                Batters{sortKey === "players" ? (sortAsc ? " ↑" : " ↓") : ""}
              </th>
              <th
                className={thBase + (sortKey === "pa" ? " text-[var(--text)]" : "")}
                onClick={() => handleSort("pa")}
              >
                PA{sortKey === "pa" ? (sortAsc ? " ↑" : " ↓") : ""}
              </th>
              {GRADE_COLS.map(({ key, label }) => (
                <th
                  key={key}
                  className={thBase + (sortKey === key ? " text-[var(--text)]" : "")}
                  onClick={() => handleSort(key as SortKey)}
                >
                  {label}{sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isExpanded = expandedTeam === row.team;
              return (
                <Fragment key={row.team}>
                  <tr
                    className="cursor-pointer border-t border-[var(--rule)] transition-colors hover:bg-[var(--track)]"
                    onClick={() => setExpandedTeam(isExpanded ? null : row.team)}
                  >
                    <td className="py-2.5 pl-5 pr-3 text-left">
                      <span className="text-sm font-bold">{row.team}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[13px] text-[var(--dimmer)]">
                      {row.players}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[13px] text-[var(--dimmer)]">
                      {row.pa.toLocaleString()}
                    </td>
                    {GRADE_COLS.map(({ key, pctKey, decimals }) => {
                      const v = row[key] as number | null;
                      const p = pctKey ? pct[pctKey](v) : null;
                      const color = p != null ? ramp(p) : v != null ? ramp(Math.max(0, Math.min(100, ((v - 70) / 60) * 100))) : "var(--dimmer)";
                      return (
                        <td
                          key={key}
                          className={`py-2.5 pr-3 text-right tabular-nums text-[13px] ${key === "Hitting+" ? "font-bold" : ""}`}
                          style={{ color: v != null ? color : "var(--dimmer)" }}
                        >
                          {fmtNum(v, decimals ?? 0)}
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded && expandedPlayers.length > 0 && (
                    <tr className="border-t border-[var(--rule)] bg-[var(--track)]">
                      <td colSpan={3 + GRADE_COLS.length} className="px-5 pb-3 pt-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dimmer)] mb-2">
                          {row.team} — {season} ({row.players} batters)
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {expandedPlayers.map(({ player: p, pa, split }) => {
                            const hp = pct["Hitting+"](p["Hitting+"]);
                            return (
                              <button
                                key={p.player_name}
                                onClick={(e) => { e.stopPropagation(); onSelectPlayer(p.player_name); }}
                                className="flex items-center gap-1.5 text-[12px] hover:underline text-left"
                              >
                                <span
                                  className="font-semibold"
                                  style={{ color: hp != null ? ramp(hp) : "var(--text)" }}
                                >
                                  {fmtNum(p["Hitting+"], 0)}
                                </span>
                                <span className="text-[var(--dim)]">{formatName(p.player_name)}</span>
                                {split && (
                                  <span className="text-[11px] text-[var(--dimmer)]">{Math.round(pa)} PA here</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 pb-4 pt-3 text-[11px] text-[var(--dimmer)]">
        Grades are PA-weighted averages across all batters with data for the season (10+ PA).
        Traded players count toward each team by the PA they had there (per the MLB Stats API),
        but their grades are full-season figures, not split by team.
      </p>
    </div>
  );
}
