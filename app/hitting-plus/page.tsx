import type { Metadata } from "next";
import { Suspense } from "react";
import Explorer from "@/components/hitting-plus/Explorer";
import { SwingPlusData } from "@/lib/hitting-plus/types";
import { getHittingPlusPlayerInfo, getSwingPlusData } from "@/lib/hitting-plus/data";

export const metadata: Metadata = {
  title: "Hitting+ — Baseball Hopper",
  description:
    "Four graded inputs to a swing, in the order they happen: Decision+, Timing+, Contact+ and Power+, refit into Hitting+.",
};

const FG_PROXY = "https://fg-proxy.vercel.app/api/fangraphs";

/** MLBAM ids FanGraphs flags as rookies for a season (its `ind=2` leaderboard). Null on failure. */
async function getRookieIds(season: number): Promise<Set<number> | null> {
  try {
    const qs = new URLSearchParams({
      pos: "all", stats: "bat", lg: "all", qual: "0", type: "8",
      season: String(season), season1: String(season), month: "0", ind: "2",
      pageitems: "2000000000", pagenum: "1",
    });
    const res = await fetch(`${FG_PROXY}?${qs}`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const json = await res.json();
    const rows: { xMLBAMID?: number }[] = Array.isArray(json) ? json : json.data ?? [];
    return new Set(rows.map((r) => r.xMLBAMID).filter((id): id is number => id != null));
  } catch {
    return null;
  }
}

async function getData(): Promise<{ data: SwingPlusData; ids: Record<string, number> } | null> {
  const [data, info] = await Promise.all([getSwingPlusData(), getHittingPlusPlayerInfo()]);
  if (!data) return null;
  const ids: Record<string, number> = {};
  for (const [name, v] of Object.entries(info)) ids[name] = v.id;

  // FanGraphs rookie flag, joined on MLBAM id. Left undefined if either side is missing,
  // and the explorer then falls back to first-season-in-dataset.
  if (Object.keys(ids).length) {
    const rookieIds = new Map(
      await Promise.all(data.seasons.map(async (y) => [y, await getRookieIds(y)] as const))
    );
    for (const p of data.players) {
      const set = rookieIds.get(p.game_year);
      const id = ids[p.player_name];
      if (set && id != null) p.rookie = set.has(id);
    }
  }
  return { data, ids };
}

export default async function HittingPlusPage() {
  const loaded = await getData();

  if (!loaded) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-8 text-center shadow-[var(--panel-shadow)]">
          <p className="text-xl font-bold">Data unavailable</p>
          <p className="mt-3 text-sm text-[var(--dim)]">
            Could not fetch from <code className="text-[var(--accent)]">hitting-plus.vercel.app</code>. Try again shortly.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={null}>
      <Explorer data={loaded.data} ids={loaded.ids} />
    </Suspense>
  );
}
