/**
 * Video lookup for the 3D Swing Explorer.
 *
 * An event carries Statcast's game_pk, at_bat_number and pitch_number. The MLB stats API's play-by-play for that game lists
 * every at-bat (allPlays[at_bat_number - 1]) and every pitch in it (playEvents with pitchNumber), and each pitch has a playId.
 * Baseball Savant's sporty-videos page plays that pitch's clip. The stats API allows browser requests from any origin.
 */
import type { EventPoint } from "@/lib/hhps";

/** Flight physics from the game feed (feet, seconds, ft/s, ft/s^2; Statcast frame: y from 50 ft down to the plate). */
export interface Trajectory {
  x0: number; y0: number; z0: number;
  vx0: number; vy0: number; vz0: number;
  ax: number; ay: number; az: number;
  plateTime: number | null;
  startSpeed: number | null;
  endSpeed: number | null;
  spinRate: number | null;
  spinDirection: number | null;
  breakH: number | null;           // horizontal break, inches
  breakVInduced: number | null;    // induced vertical break, inches
}

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
  traj: Trajectory | null;
}

interface StatsApiPlay {
  about: { atBatIndex: number; inning: number; halfInning: string; startTime?: string };
  matchup: { batter: { fullName: string }; pitcher: { fullName: string } };
  result: { description?: string };
  playEvents: {
    pitchNumber?: number;
    playId?: string;
    details?: { description?: string; type?: { description?: string } };
    pitchData?: {
      startSpeed?: number;
      endSpeed?: number;
      plateTime?: number;
      coordinates?: Record<string, number>;
      breaks?: { spinRate?: number; spinDirection?: number; breakHorizontal?: number; breakVerticalInduced?: number };
    };
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
  const c = pitch?.pitchData?.coordinates;
  const br = pitch?.pitchData?.breaks;
  const traj: Trajectory | null =
    c && [c.x0, c.y0, c.z0, c.vX0, c.vY0, c.vZ0, c.aX, c.aY, c.aZ].every((v) => typeof v === "number")
      ? {
          x0: c.x0, y0: c.y0, z0: c.z0, vx0: c.vX0, vy0: c.vY0, vz0: c.vZ0, ax: c.aX, ay: c.aY, az: c.aZ,
          plateTime: pitch?.pitchData?.plateTime ?? null,
          startSpeed: pitch?.pitchData?.startSpeed ?? null,
          endSpeed: pitch?.pitchData?.endSpeed ?? null,
          spinRate: br?.spinRate ?? null,
          spinDirection: br?.spinDirection ?? null,
          breakH: br?.breakHorizontal ?? null,
          breakVInduced: br?.breakVerticalInduced ?? null,
        }
      : null;
  return {
    traj,
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

/** Stable key for an event's pitch (game, at-bat, pitch number). */
export const evKey = (ev: EventPoint) => `${ev[7]}-${ev[8]}-${ev[9]}`;

export const savantVideoUrl = (playId: string) => `https://baseballsavant.mlb.com/sporty-videos?playId=${playId}`;
