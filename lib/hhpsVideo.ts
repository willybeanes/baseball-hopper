/**
 * Video lookup for the 3D Swing Explorer.
 *
 * An event carries Statcast's game_pk, at_bat_number and pitch_number. The MLB stats API's play-by-play for that game lists
 * every at-bat (allPlays[at_bat_number - 1]) and every pitch in it (playEvents with pitchNumber), and each pitch has a playId.
 * Baseball Savant's sporty-videos page plays that pitch's clip. The stats API allows browser requests from any origin.
 */
import type { EventPoint } from "@/lib/hhps";

export interface PlayInfo {
  playId: string | null;
  batter: string;
  pitcher: string;
  inning: string;        // e.g. "Bot 5"
  date: string | null;   // e.g. "Sep 22, 2026"
  result: string;        // the at-bat result sentence
  pitchResult: string;   // e.g. "Swinging Strike", "In play, out(s)"
  pitchSpeed: number | null;
  pitchType: string | null;
}

interface StatsApiPlay {
  about: { atBatIndex: number; inning: number; halfInning: string; startTime?: string };
  matchup: { batter: { fullName: string }; pitcher: { fullName: string } };
  result: { description?: string };
  playEvents: {
    pitchNumber?: number;
    playId?: string;
    details?: { description?: string; type?: { description?: string } };
    pitchData?: { startSpeed?: number };
  }[];
}

const games = new Map<number, Promise<StatsApiPlay[] | null>>();

function gamePlays(gamePk: number): Promise<StatsApiPlay[] | null> {
  let p = games.get(gamePk);
  if (!p) {
    p = fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.allPlays ?? null) as StatsApiPlay[] | null)
      .catch(() => null);
    games.set(gamePk, p);
  }
  return p;
}

export async function resolvePlay(ev: EventPoint): Promise<PlayInfo | null> {
  const [, , , , , , , gpk, ab, pn] = ev;
  if (gpk == null || ab == null || pn == null) return null;
  const plays = await gamePlays(gpk);
  if (!plays) return null;
  const play = plays.find((p) => p.about.atBatIndex === ab - 1) ?? plays[ab - 1];
  if (!play) return null;
  const pitch = play.playEvents.find((e) => e.pitchNumber === pn);
  const half = play.about.halfInning === "top" ? "Top" : "Bot";
  const date = play.about.startTime
    ? new Date(play.about.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
  return {
    playId: pitch?.playId ?? null,
    batter: play.matchup.batter.fullName,
    pitcher: play.matchup.pitcher.fullName,
    inning: `${half} ${play.about.inning}`,
    date,
    result: play.result.description ?? "",
    pitchResult: pitch?.details?.description ?? "",
    pitchSpeed: pitch?.pitchData?.startSpeed ?? null,
    pitchType: pitch?.details?.type?.description ?? null,
  };
}

export const savantVideoUrl = (playId: string) => `https://baseballsavant.mlb.com/sporty-videos?playId=${playId}`;
