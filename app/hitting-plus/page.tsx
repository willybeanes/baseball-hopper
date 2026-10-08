import type { Metadata } from "next";
import { Suspense } from "react";
import Explorer from "@/components/hitting-plus/Explorer";
import { SwingPlusData } from "@/lib/hitting-plus/types";

export const metadata: Metadata = {
  title: "Hitting+ — Baseball Hopper",
  description:
    "Four graded inputs to a swing, in the order they happen: Decision+, Timing+, Contact+ and Power+, refit into Hitting+.",
};

const BASE = "https://hitting-plus.vercel.app/data";

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

async function getData(): Promise<SwingPlusData | null> {
  try {
    const [dataRes, wrcRes, infoRes] = await Promise.all([
      fetch(`${BASE}/swingplus_latest.json`, { next: { revalidate: 1800 } }),
      fetch(`${BASE}/wrc_plus.json`, { next: { revalidate: 1800 } }),
      fetch(`${BASE}/player_info.json`, { next: { revalidate: 1800 } }),
    ]);
    if (!dataRes.ok) return null;
    const raw = await dataRes.text();
    const sanitized = raw.replace(/\bNaN\b/g, "null");
    const data = JSON.parse(sanitized) as SwingPlusData;
    let wrcMap: Record<string, Record<string, number>> = {};
    if (wrcRes.ok) wrcMap = await wrcRes.json();
    for (const p of data.players) {
      p.wrc_plus = wrcMap[p.player_name]?.[String(p.game_year)] ?? null;
    }

    // FanGraphs rookie flag, joined on MLBAM id. Left undefined if either side is missing,
    // and the explorer then falls back to first-season-in-dataset.
    if (infoRes.ok) {
      const info: Record<string, { id: number }> = await infoRes.json();
      const rookieIds = new Map(
        await Promise.all(data.seasons.map(async (y) => [y, await getRookieIds(y)] as const))
      );
      for (const p of data.players) {
        const ids = rookieIds.get(p.game_year);
        const id = info[p.player_name]?.id;
        if (ids && id != null) p.rookie = ids.has(id);
      }
    }
    return data;
  } catch {
    return null;
  }
}

export default async function HittingPlusPage() {
  const data = await getData();

  if (!data) {
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
      <Explorer data={data} />
    </Suspense>
  );
}
