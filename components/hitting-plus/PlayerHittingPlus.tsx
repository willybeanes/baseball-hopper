"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Player } from "@/lib/hitting-plus/types";
import { cardReferences, percentilesBySeason } from "@/lib/hitting-plus/context";
import PlayerCard from "./PlayerCard";

/** Hitting+ card for the player page. Season lives in ?season= so links can target one. */
export default function PlayerHittingPlus({
  history,
  pools,
}: {
  history: Player[];
  pools: Record<number, Player[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const latest = history[history.length - 1].game_year;

  const [season, setSeason] = useState<number>(() => {
    const q = Number(searchParams.get("season"));
    return history.some((h) => h.game_year === q) ? q : latest;
  });

  const selectSeason = useCallback(
    (year: number) => {
      setSeason(year);
      const params = new URLSearchParams(searchParams.toString());
      if (year === latest) params.delete("season");
      else params.set("season", String(year));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [latest, pathname, router, searchParams],
  );

  const pctBySeason = useMemo(() => percentilesBySeason(pools), [pools]);
  const refs = useMemo(() => cardReferences(pools[season] ?? []), [pools, season]);
  const row = history.find((h) => h.game_year === season) ?? history[history.length - 1];
  const pct = pctBySeason[row.game_year];
  if (!pct) return null;

  return (
    <PlayerCard
      player={row}
      pct={pct}
      {...refs}
      history={history}
      pctBySeason={pctBySeason}
      onSelectSeason={selectSeason}
    />
  );
}
