import type { SwingPlusData } from "./types";

/** Parse swingplus_latest.json (it writes bare NaN) and merge in wRC+ by name and season. */
export function parseSwingPlus(raw: string, wrcMap: Record<string, Record<string, number>>): SwingPlusData {
  const data = JSON.parse(raw.replace(/\bNaN\b/g, "null")) as SwingPlusData;
  for (const p of data.players) {
    p.wrc_plus = wrcMap[p.player_name]?.[String(p.game_year)] ?? null;
  }
  return data;
}

/**
 * Set each row's FanGraphs rookie flag from per-season MLBAM id lists. A season with no
 * list stays unflagged, and the explorer falls back to first-season-in-dataset.
 */
export function applyRookieFlags(
  data: SwingPlusData,
  ids: Record<string, number>,
  rookies: Record<string, number[]>,
): void {
  const sets = new Map(Object.entries(rookies).map(([y, list]) => [Number(y), new Set(list)]));
  for (const p of data.players) {
    const set = sets.get(p.game_year);
    const id = ids[p.player_name];
    if (set && id != null) p.rookie = set.has(id);
  }
}
