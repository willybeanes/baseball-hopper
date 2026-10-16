import { createClient } from "@supabase/supabase-js";

import type { Games, HHPSLeaderboardRow, Season, Side } from "@/lib/hhps";
import { leaderboardJsonUrl } from "@/lib/hhps";

/** Every leaderboard row (all splits) for one side, season and set of games. Empty on any failure. */
export async function getHhpsLeaderboard(
  supabaseUrl: string,
  anonKey: string,
  side: Side,
  season: Season,
  games: Games,
): Promise<HHPSLeaderboardRow[]> {
  try {
    if (games !== "reg") {
      const res = await fetch(leaderboardJsonUrl(supabaseUrl, season, side, games), { next: { revalidate: 1800 } });
      return res.ok ? ((await res.json()) as HHPSLeaderboardRow[]) : [];
    }
    const sb = createClient(supabaseUrl, anonKey);
    const PAGE = 1000;
    const rows: HHPSLeaderboardRow[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await sb
        .from(side === "pitcher" ? "hhps_pitcher_leaderboard" : "hhps_leaderboard")
        .select("*")
        .eq("season", season)
        .order("bip_hard_in3", { ascending: false })
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (error || !data?.length) break;
      rows.push(...(data as HHPSLeaderboardRow[]));
      if (data.length < PAGE) break;
    }
    return rows;
  } catch {
    return [];
  }
}
