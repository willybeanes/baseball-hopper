import type { Metadata } from "next";

import type { Season } from "@/lib/hhps";
import { SEASONS, parseGames } from "@/lib/hhps";
import { getHhpsLeaderboard } from "@/lib/hhpsLeaderboard";
import HHPSClientShell from "@/components/hhps/HHPSClientShell";

export const metadata: Metadata = {
  title: "3D Pitch Explorer — Baseball Hopper",
  description:
    "3D map of where each pitcher's pitches get hit hard, barreled, hit softly or swung through, in the space around the hitter's body.",
};

export const revalidate = 1800;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function HHPSPitchersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const seasonParam = Number(params.season);
  const season: Season = (SEASONS as readonly number[]).includes(seasonParam)
    ? (seasonParam as Season)
    : SEASONS[0];

  const games = parseGames(params.games);
  const leaderboard = await getHhpsLeaderboard(SUPABASE_URL, SUPABASE_ANON_KEY, "pitcher", season, games);

  return (
    <HHPSClientShell
      side="pitcher"
      leaderboard={leaderboard}
      season={season}
      games={games}
      supabaseUrl={SUPABASE_URL}
      initialWhiff={params.whiff === "1"}
      initialWthr={Number.isFinite(Number(params.wthr)) && params.wthr ? Number(params.wthr) : undefined}
      initialView={params.view === "circles" ? "circles" : "cubes"}
      initialThr={Number.isFinite(Number(params.thr)) && params.thr ? Number(params.thr) : undefined}
      initialPlayer={params.player ? Number(params.player) : undefined}
      initialOutcome={(params.outcome as "hard" | "barrel" | "whiff" | "soft") ?? "hard"}
      initialPaths={params.paths === "1"}
      initialTypes={params.types}
      initialRes={params.res}
      initialMode={(params.mode as "contact" | "swing") ?? "contact"}
      initialHand={(params.hand as "all" | "R" | "L" | "F" | "B" | "O" | "RF" | "LF" | "RB" | "LB" | "RO" | "LO") ?? "all"}
    />
  );
}
