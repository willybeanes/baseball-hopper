"use client";

import { useEffect, useMemo, useState } from "react";
import { Player, StatKey } from "@/lib/hitting-plus/types";
import { fmtNum, formatName } from "@/lib/hitting-plus/metrics";
import { ramp } from "@/lib/hitting-plus/ramp";

type PctFn = (x: number | null | undefined) => number | null;

interface PlayerInfo {
  id: number;
  team: string;
  position: string;
  teamsBySeason: Record<string, string[]>;
}

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

type SortKey = keyof Omit<TeamRow, "team">;

const GRADE_COLS: { key: keyof TeamRow; label: string; pctKey?: StatKey; decimals?: number }[] = [
  { key: "Hitting+",  label: "Hit+",  pctKey: "Hitting+" },
  { key: "Decision+", label: "Dec+",  pctKey: "Decision+" },
  { key: "Timing+",   label: "Tim+",  pctKey: "Timing+" },
  { key: "Contact+",  label: "Con+",  pctKey: "Contact+" },
  { key: "Power+",    label: "Pow+",  pctKey: "Power+" },
  { key: "xwoba",     label: "xwOBA", decimals: 3 },
  { key: "wrc_plus",  label: "wRC+",  pctKey: "wrc_plus" },
];

function weightedMean(pairs: [number, number][]) {
  let num = 0, den = 0;
  for (const [v, w] of pairs) { num += v * w; den += w; }
  return den > 0 ? num / den : null;
}

function usePlayerInfo() {
  const [info, setInfo] = useState<Record<string, PlayerInfo> | null>(null);
  useEffect(() => {
    fetch("/data/player_info.json")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({}));
  }, []);
  return info;
}

export default function Teams({
  players,
  season,
  pct,
  onSelectPlayer,
}: {
  players: Player[];
  season: number;
  pct: Record<StatKey, PctFn>;
  onSelectPlayer: (name: string) => void;
}) {
  const info = usePlayerInfo();
  const [sortKey, setSortKey] = useState<SortKey>("Hitting+");
  const [sortAsc, setSortAsc] = useState(false);

  // Assign each player a team for this season
  const teamRows = useMemo<TeamRow[]>(() => {
    if (!info) return [];

    const byTeam = new Map<string, Player[]>();
    for (const p of players) {
      const pi = info[p.player_name];
      if (!pi) continue;
      const seasons = pi.teamsBySeason?.[String(season)];
      // Use the last team listed for the season (most recent), or fall back to current
      const team = seasons?.length ? seasons[seasons.length - 1] : pi.team;
      if (!team) continue;
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team)!.push(p);
    }

    const rows: TeamRow[] = [];
    for (const [team, ps] of byTeam) {
      if (ps.length === 0) continue;
      const qual = ps;
      const totalPA = qual.reduce((s, p) => s + p.pa, 0);

      function wavg(key: keyof Player) {
        const pairs = qual
          .map((p) => [p[key] as number | null, p.pa] as [number | null, number])
          .filter((pair): pair is [number, number] => pair[0] != null);
        return weightedMean(pairs);
      }

      rows.push({
        team,
        players: qual.length,
        pa: totalPA,
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
  }, [info, players, season]);

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
    if (!expandedTeam || !info) return [];
    return players
      .filter((p) => {
        const pi = info[p.player_name];
        if (!pi) return false;
        const seasons = pi.teamsBySeason?.[String(season)];
        const team = seasons?.length ? seasons[seasons.length - 1] : pi.team;
        return team === expandedTeam;
      })
      .sort((a, b) => (b["Hitting+"] ?? -Infinity) - (a["Hitting+"] ?? -Infinity));
  }, [expandedTeam, info, players, season]);

  if (!info) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] text-sm text-[var(--dimmer)] shadow-[var(--panel-shadow)]">
        Loading…
      </div>
    );
  }

  const thBase =
    "py-2.5 pr-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)] cursor-pointer select-none hover:text-[var(--text)]";

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--panel-shadow)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--rule)]">
              <th className="py-2.5 pl-5 pr-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
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
                <>
                  <tr
                    key={row.team}
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
                    <tr key={row.team + "-expanded"} className="border-t border-[var(--rule)] bg-[var(--track)]">
                      <td colSpan={3 + GRADE_COLS.length} className="px-5 pb-3 pt-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--dimmer)] mb-2">
                          {row.team} — {season} ({row.players} batters)
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {expandedPlayers.map((p) => {
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
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 pb-4 pt-3 text-[11px] text-[var(--dimmer)]">
        Grades are PA-weighted averages across all batters with data for the season. Team assigned by most recent roster entry.
      </p>
    </div>
  );
}
