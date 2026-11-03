"use client";

import { useSearchParams } from "next/navigation";
import type { SwingProfileData } from "@/lib/swing-profile/types";
import SwingProfile from "./SwingProfile";

/** Swing Profile for the season the Hitting+ card is showing, which that card keeps in ?season=. */
export default function PlayerSwingProfile({ data, seasons }: { data: SwingProfileData; seasons: number[] }) {
  const q = Number(useSearchParams().get("season"));
  const season = seasons.includes(q) ? q : seasons[seasons.length - 1];
  const row = data.rows.find((r) => r.season === season);
  const league = data.leagues[season];
  if (!row || !league) return null;
  return <SwingProfile row={row} league={league} video={data.video} />;
}
