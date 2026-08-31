"use client";

import { useMemo, Fragment } from "react";
import type { GridData, OpposingProbable } from "@/lib/probables/types";

const DIVISION_LABELS: Record<string, string> = {
  "AL-E": "AL East",
  "AL-C": "AL Central",
  "AL-W": "AL West",
  "NL-E": "NL East",
  "NL-C": "NL Central",
  "NL-W": "NL West",
};

const TEAM_COLORS: Record<string, { bg: string; text: string }> = {
  ARI: { bg: "#a71930", text: "#fff" },
  ATH: { bg: "#003831", text: "#fff" },
  ATL: { bg: "#b71234", text: "#fff" },
  BAL: { bg: "#ed4c09", text: "#000" },
  BOS: { bg: "#c60c30", text: "#fff" },
  CHC: { bg: "#003279", text: "#fff" },
  CHW: { bg: "#c0c0c0", text: "#000" },
  CIN: { bg: "#c6011f", text: "#fff" },
  CLE: { bg: "#d30335", text: "#fff" },
  COL: { bg: "#333366", text: "#fff" },
  DET: { bg: "#de4406", text: "#fff" },
  HOU: { bg: "#ff7f00", text: "#000" },
  KCR: { bg: "#74b4fa", text: "#000" },
  LAA: { bg: "#b71234", text: "#fff" },
  LAD: { bg: "#083c6b", text: "#fff" },
  MIA: { bg: "#00a3e0", text: "#fff" },
  MIL: { bg: "#13294b", text: "#fff" },
  MIN: { bg: "#072754", text: "#fff" },
  NYM: { bg: "#fb4f14", text: "#000" },
  NYY: { bg: "#1c2841", text: "#fff" },
  PHI: { bg: "#ba0c2f", text: "#fff" },
  PIT: { bg: "#fdb829", text: "#000" },
  SDP: { bg: "#473729", text: "#fff" },
  SEA: { bg: "#005c5c", text: "#fff" },
  SFG: { bg: "#f2552c", text: "#000" },
  STL: { bg: "#c41e3a", text: "#fff" },
  TBR: { bg: "#ffd700", text: "#000" },
  TEX: { bg: "#bd1021", text: "#fff" },
  TOR: { bg: "#003da5", text: "#fff" },
  WSN: { bg: "#ba122b", text: "#fff" },
};

function formatDateHeader(dateStr: string): { day: string; date: string } {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: days[d.getDay()]!,
    date: `${d.getMonth() + 1}/${d.getDate()}`,
  };
}

function GameCell({ game }: { game: OpposingProbable | null }) {
  if (!game) {
    return (
      <div className="flex h-full items-center justify-center py-2">
        <span className="text-[10px] font-bold text-off-text">OFF</span>
      </div>
    );
  }

  const locationPrefix = game.isAway ? "@ " : "";
  const pitcherDisplay = game.pitcher
    ? `${game.pitcher} (${game.hand})`
    : "TBD";

  return (
    <div className="flex h-full flex-col items-center justify-center px-1.5 py-1.5 text-center">
      <div className="text-[10px] font-semibold leading-tight">
        {locationPrefix}{game.opponent}
        {game.dh > 0 && (
          <span className="ml-0.5 text-[9px] text-tbd font-medium">G{game.dh}</span>
        )}
      </div>
      <div
        className={`text-[10px] font-semibold leading-tight ${
          game.pitcher ? "text-text-primary" : "text-tbd italic"
        }`}
      >
        {pitcherDisplay}
      </div>
    </div>
  );
}

export function Grid({ data }: { data: GridData }) {
  const teamGameMap = useMemo(() => {
    const map = new Map<string, Map<string, OpposingProbable[]>>();
    for (const team of data.teams) {
      const dateMap = new Map<string, OpposingProbable[]>();
      for (const game of team.games) {
        if (!dateMap.has(game.date)) dateMap.set(game.date, []);
        dateMap.get(game.date)!.push(game);
      }
      map.set(team.abbName, dateMap);
    }
    return map;
  }, [data.teams]);

  const groupedTeams = useMemo(() => {
    const groups: { divKey: string; label: string; teams: typeof data.teams }[] = [];
    const divMap = new Map<string, typeof data.teams>();
    for (const team of data.teams) {
      const key = `${team.league}-${team.division}`;
      if (!divMap.has(key)) divMap.set(key, []);
      divMap.get(key)!.push(team);
    }
    for (const [key, teams] of divMap) {
      groups.push({ divKey: key, label: DIVISION_LABELS[key] || key, teams });
    }
    return groups;
  }, [data.teams]);

  return (
    <div>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            {groupedTeams.map((group) => (
              <Fragment key={group.divKey}>
                <tr>
                  <td className="sticky left-0 z-10 bg-header-bg px-2 py-1.5 text-center text-[10px] font-bold text-header-text w-16 border-b-2 border-r-2 border-white">
                    {group.label}
                  </td>
                  {data.dates.map((date) => {
                    const { day, date: dateStr } = formatDateHeader(date);
                    return (
                      <td
                        key={date}
                        className="bg-header-bg px-2 py-1.5 text-center text-[10px] font-bold text-header-text min-w-[110px] border-l border-b-2 border-white"
                      >
                        <div>{day}</div>
                        <div>{dateStr}</div>
                      </td>
                    );
                  })}
                </tr>
                {group.teams.map((team) => {
                  const dateMap = teamGameMap.get(team.abbName);
                  const teamColor = TEAM_COLORS[team.abbName] || { bg: "#666", text: "#fff" };
                  return (
                    <tr
                      key={team.abbName}
                      className="border-b-2 border-white"
                    >
                      <td
                        className="sticky left-0 z-10 px-2 py-1.5 text-center text-[10px] font-semibold border-r-2 border-white"
                        style={{
                          backgroundColor: teamColor.bg,
                          color: teamColor.text,
                        }}
                      >
                        {team.abbName}
                      </td>
                      {data.dates.map((date) => {
                        const games = dateMap?.get(date);
                        if (!games || games.length === 0) {
                          return (
                            <td
                              key={date}
                              className="border-l-2 border-white bg-surface px-1 py-1 text-center"
                            >
                              <span className="text-[10px] font-bold text-off-text">
                                OFF
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td
                            key={date}
                            className="border-l-2 border-white bg-cell px-0 py-0"
                          >
                            {games.map((game, i) => (
                              <div
                                key={`${date}-${i}`}
                                className={
                                  i > 0 ? "border-t border-border" : ""
                                }
                              >
                                <GameCell game={game} />
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
