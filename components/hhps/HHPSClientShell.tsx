"use client";

import dynamic from "next/dynamic";
import type { HHPSLeaderboardRow, Season } from "@/lib/hhps";

const HHPSExplorer = dynamic(() => import("./HHPSExplorer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 text-[var(--dim)] text-sm">
      Loading explorer…
    </div>
  ),
});

interface Props {
  leaderboard: HHPSLeaderboardRow[];
  season: Season;
  supabaseUrl: string;
  initialPlayer?: number;
  initialOutcome?: "hard" | "barrel";
  initialMode?: "contact" | "swing";
  initialHand?: "all" | "R" | "L";
}

export default function HHPSClientShell(props: Props) {
  return <HHPSExplorer {...props} />;
}
