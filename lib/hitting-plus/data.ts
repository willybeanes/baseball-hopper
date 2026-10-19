import { unstable_cache } from "next/cache";
import { Player, SwingPlusData } from "./types";
import type { MlbInfo } from "./headshot";

export const HP_DATA = "https://hitting-plus.vercel.app/data";

/**
 * Refresh the Hitting+ data once a day. The /hitting-plus and /player pages that use it are
 * large (the leaderboard page is ~5 MB), so every refresh is a costly Vercel ISR write.
 */
export const HP_REVALIDATE = 86400;

/**
 * The full Hitting+ dataset with wRC+ merged in. The JSON is ~2.7 MB, over Next's 2 MB
 * fetch-cache limit, so callers that only need a slice should go through a cached
 * derivation (see getPlayerHittingPlus) rather than calling this per request.
 */
export async function getSwingPlusData(): Promise<SwingPlusData | null> {
  try {
    const [dataRes, wrcRes] = await Promise.all([
      fetch(`${HP_DATA}/swingplus_latest.json`, { next: { revalidate: HP_REVALIDATE } }),
      fetch(`${HP_DATA}/wrc_plus.json`, { next: { revalidate: HP_REVALIDATE } }),
    ]);
    if (!dataRes.ok) return null;
    const raw = await dataRes.text();
    const data = JSON.parse(raw.replace(/\bNaN\b/g, "null")) as SwingPlusData;
    const wrcMap: Record<string, Record<string, number>> = wrcRes.ok ? await wrcRes.json() : {};
    for (const p of data.players) {
      p.wrc_plus = wrcMap[p.player_name]?.[String(p.game_year)] ?? null;
    }
    return data;
  } catch {
    return null;
  }
}

/** "Last, First" → MLBAM info, from the snapshot hitting-plus resolves offline. */
export async function getHittingPlusPlayerInfo(): Promise<Record<string, MlbInfo>> {
  try {
    const res = await fetch(`${HP_DATA}/player_info.json`, { next: { revalidate: HP_REVALIDATE } });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

/** Fields the player card's percentiles and reference lines read from the league pool. */
const POOL_FIELDS = [
  "player_name", "game_year", "qualified",
  "Hitting+", "Decision+", "Timing+", "Contact+", "Power+", "xwoba", "wrc_plus",
  "depth_FB", "depth_BR", "depth_OS", "whiff_rate", "exp_whiff", "paBS", "paAA",
] as const;

export interface PlayerHittingPlus {
  generated: string;
  source: string;
  /** Every season row for this hitter, oldest first. */
  history: Player[];
  /** Qualified pool per season, trimmed to POOL_FIELDS. */
  pools: Record<number, Player[]>;
}

/**
 * Slim per-season pools, cached as one small blob so a player page never has to ship
 * (or refetch) the full dataset.
 */
const getPools = unstable_cache(
  async () => {
    const data = await getSwingPlusData();
    if (!data) return null;
    const pools: Record<number, Player[]> = {};
    for (const p of data.players) {
      if (!p.qualified) continue;
      const slim = Object.fromEntries(POOL_FIELDS.map((k) => [k, p[k]])) as unknown as Player;
      (pools[p.game_year] ??= []).push(slim);
    }
    return { generated: data.generated, source: data.source, pools };
  },
  ["hitting-plus-pools"],
  { revalidate: HP_REVALIDATE },
);

const getHistory = unstable_cache(
  async (mlbamId: number) => {
    const [data, info] = await Promise.all([getSwingPlusData(), getHittingPlusPlayerInfo()]);
    if (!data) return null;
    const name = Object.entries(info).find(([, v]) => v.id === mlbamId)?.[0];
    if (!name) return [];
    return data.players
      .filter((p) => p.player_name === name)
      .sort((a, b) => a.game_year - b.game_year);
  },
  ["hitting-plus-history"],
  { revalidate: HP_REVALIDATE },
);

/** Hitting+ rows for one hitter plus what's needed to grade them. Null if not in the data. */
export async function getPlayerHittingPlus(mlbamId: number): Promise<PlayerHittingPlus | null> {
  const [history, pools] = await Promise.all([getHistory(mlbamId), getPools()]);
  if (!history?.length || !pools) return null;
  return { ...pools, history };
}
