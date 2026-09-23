import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

import type { HHPSLeaderboardRow, Season } from "@/lib/hhps";
import { SEASONS } from "@/lib/hhps";
import HHPSClientShell from "@/components/hhps/HHPSClientShell";

export const metadata: Metadata = {
  title: "3D Swing Explorer — Baseball Hopper",
  description:
    "3D map of where each hitter makes hard contact and barrels — the pockets of space around his body where a swing turns into damage.",
};

export const revalidate = 1800;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getLeaderboard(season: Season): Promise<HHPSLeaderboardRow[]> {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb
      .from("hhps_leaderboard")
      .select("*")
      .eq("season", season)
      .order("bip_hard_in3", { ascending: false });
    if (error) return [];
    return (data ?? []) as HHPSLeaderboardRow[];
  } catch {
    return [];
  }
}

export default async function HHPSPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const seasonParam = Number(params.season);
  const season: Season = (SEASONS as readonly number[]).includes(seasonParam)
    ? (seasonParam as Season)
    : SEASONS[0];

  const leaderboard = await getLeaderboard(season);

  return (
    <HHPSClientShell
      leaderboard={leaderboard}
      season={season}
      supabaseUrl={SUPABASE_URL}
      initialPlayer={params.player ? Number(params.player) : undefined}
      initialOutcome={(params.outcome as "hard" | "barrel") ?? "hard"}
      initialMode={(params.mode as "contact" | "swing") ?? "contact"}
      initialHand={(params.hand as "all" | "R" | "L") ?? "all"}
    />
  );
}
