import { normalize } from "./metrics";
import { TEAM_ABBR } from "./teams";

export interface MlbInfo {
  id: number;
  team: string | null;
  position: string | null;
  /** Teams the player logged hitting stats for, keyed by season (e.g. { "2025": ["BOS"] }).
   *  Absent for names resolved only via the live fallback. Lets the leaderboard filter and
   *  label by the roster for the selected season, not the player's current club. */
  teamsBySeason?: Record<string, string[]>;
}

const infoCache = new Map<string, MlbInfo | null>();
const inflight = new Map<string, Promise<MlbInfo | null>>();

export function headshotUrl(id: number, size = 213): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${size},q_auto:best/v1/people/${id}/headshot/67/current`;
}

interface MlbPerson {
  id: number;
  lastFirstName?: string;
  currentTeam?: { name?: string };
  primaryPosition?: { abbreviation?: string };
}

// Every unique player in the data has already been resolved once, offline, into this
// static file (see scripts/resolve-players.ts), the same way FanGraphs bakes MLBAM id
// and team into its own exports. Preloading it means the app almost never has to call
// MLB's live API from the browser at all; live lookup is only a fallback for names
// added since the snapshot was last regenerated.
let preloadPromise: Promise<void> | null = null;

function preloadStaticInfo(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = fetch("/data/player_info.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: Record<string, MlbInfo>) => {
        for (const [name, info] of Object.entries(data)) {
          if (!infoCache.has(name)) infoCache.set(name, info);
        }
      })
      .catch(() => {});
  }
  return preloadPromise;
}

async function fetchLive(name: string): Promise<MlbInfo | null> {
  const [last, first] = name.split(",").map((s) => s.trim());
  const query = first ? `${first} ${last}` : name;

  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(query)}&hydrate=currentTeam`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { people?: MlbPerson[] };
    const people = data.people ?? [];
    const target = normalize(name);
    const match = people.find((p) => normalize(p.lastFirstName ?? "") === target) ?? people[0];
    if (!match) return null;
    // currentTeam can be a minor-league affiliate for optioned or depth players; only
    // surface it when it maps to one of the 30 MLB clubs, since this leaderboard is
    // MLB-level and an unrecognized minor-league name would just clutter the filter.
    const rawTeamName = match.currentTeam?.name ?? null;
    const abbr = rawTeamName ? TEAM_ABBR[rawTeamName] : undefined;
    return {
      id: match.id,
      team: abbr ?? null,
      position: match.primaryPosition?.abbreviation ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves "Last, First" to MLBAM identity info (id, current team, current position).
 * Reads from the pre-resolved static snapshot first; only calls MLB's live API for a
 * name that snapshot doesn't have. Caches by name for the session either way. Team and
 * position reflect the player's CURRENT assignment, not necessarily what they played in
 * a given past season.
 */
export function resolveMlbInfo(name: string): Promise<MlbInfo | null> {
  if (infoCache.has(name)) return Promise.resolve(infoCache.get(name) ?? null);
  const existing = inflight.get(name);
  if (existing) return existing;

  const promise = preloadStaticInfo()
    .then(() => {
      if (infoCache.has(name)) return infoCache.get(name) ?? null;
      return fetchLive(name);
    })
    .then((info) => {
      infoCache.set(name, info);
      inflight.delete(name);
      return info;
    });

  inflight.set(name, promise);
  return promise;
}

export function resolveHeadshotId(name: string): Promise<number | null> {
  return resolveMlbInfo(name).then((info) => info?.id ?? null);
}
