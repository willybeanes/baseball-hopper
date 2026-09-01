/**
 * Shared player-ID layer for Baseball Hopper.
 *
 * Canonical identifier: MLBAM id (integer).
 * Primary data source:  MLB Stats API (free, public, authoritative).
 *
 * FanGraphs id is available from the FanGraphs leaderboard API as `playerid`
 * alongside `xMLBAMID` — fetch it on demand when building tool-specific links
 * that require it. It is intentionally not baked in here so this module stays
 * source-neutral (MLBAM id is the stable spine; FG id is a downstream detail).
 */

export interface PlayerInfo {
  mlbamId: number;
  /** Display name, e.g. "Ronald Acuña Jr." */
  displayName: string;
  /** Stored name in "Last, First" format — matches hitting-plus player_info.json keys */
  storedName: string;
  /** Current team abbreviation, e.g. "ATL". Null if retired / not on a roster. */
  team: string | null;
  /** Primary position abbreviation, e.g. "RF", "SP". */
  position: string | null;
}

interface MlbPersonResponse {
  people: Array<{
    id: number;
    fullName: string;
    lastFirstName: string;
    currentTeam?: { abbreviation?: string };
    primaryPosition?: { abbreviation?: string };
  }>;
}

/**
 * Look up a player by MLBAM id.
 * Uses ISR caching at the page level — this function itself is uncached so the
 * caller controls revalidation via `next: { revalidate }` or React's `cache()`.
 */
export async function fetchPlayerInfo(mlbamId: number): Promise<PlayerInfo | null> {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${mlbamId}?hydrate=currentTeam`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as MlbPersonResponse;
    const p = data.people?.[0];
    if (!p) return null;
    return {
      mlbamId,
      displayName: p.fullName,
      storedName: p.lastFirstName,
      team: p.currentTeam?.abbreviation ?? null,
      position: p.primaryPosition?.abbreviation ?? null,
    };
  } catch {
    return null;
  }
}

// ── URL helpers ────────────────────────────────────────────────────────────────

const SHELL = process.env.NEXT_PUBLIC_SHELL_URL ?? "https://baseball-hopper.vercel.app";

/** Canonical player profile URL (on this shell). */
export function playerUrl(mlbamId: number): string {
  return `${SHELL}/player/${mlbamId}`;
}

/** Headshot from MLB's CDN. Falls back to the generic silhouette. */
export function headshotUrl(mlbamId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbamId}/headshot/67/current`;
}

/**
 * Hitting+ deep-link for a player.
 * hitting-plus accepts ?player=Last,+First&season=YYYY
 */
export function hittingPlusUrl(player: PlayerInfo, season?: number): string {
  const params = new URLSearchParams({ player: player.storedName });
  if (season) params.set("season", String(season));
  return `https://hitting-plus.vercel.app/?${params}`;
}

/**
 * Percentile Compare deep-link for a player as Player A.
 * player-compare accepts ?tab=hitter&a=First+Last&yearA=YYYY
 * Routed through the shell's /compare rewrite.
 */
export function compareUrl(player: PlayerInfo, season?: number): string {
  const params = new URLSearchParams({ tab: "hitter", a: player.displayName });
  if (season) params.set("yearA", String(season));
  return `${SHELL}/compare?${params}`;
}

/**
 * Battery Splits link.
 * No page-level deep-link yet — links to the tool root.
 */
export function batteryUrl(): string {
  return `${SHELL}/battery`;
}

/**
 * Stuff Splits link.
 * No page-level deep-link yet — links to the tool root.
 */
export function stuffUrl(): string {
  return `${SHELL}/stuff/platoon`;
}
