import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import ExplorerLoader from "@/components/hitting-plus/ExplorerLoader";
import { getSwingPlusData } from "@/lib/hitting-plus/data";

export const metadata: Metadata = {
  title: "Hitting+ — Baseball Hopper",
  description:
    "Four graded inputs to a swing, in the order they happen: Decision+, Timing+, Contact+ and Power+, refit into Hitting+.",
};

// Rebuild once a day; see HP_REVALIDATE. (Segment config has to be a literal.)
export const revalidate = 86400;

const FG_PROXY = "https://fg-proxy.vercel.app/api/fangraphs";

/** MLBAM ids FanGraphs flags as rookies for a season (its `ind=2` leaderboard). Null on failure. */
async function getRookieIds(season: number): Promise<number[] | null> {
  try {
    const qs = new URLSearchParams({
      pos: "all", stats: "bat", lg: "all", qual: "0", type: "8",
      season: String(season), season1: String(season), month: "0", ind: "2",
      pageitems: "2000000000", pagenum: "1",
    });
    const res = await fetch(`${FG_PROXY}?${qs}`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json();
    const rows: { xMLBAMID?: number }[] = Array.isArray(json) ? json : json.data ?? [];
    return rows.map((r) => r.xMLBAMID).filter((id): id is number => id != null);
  } catch {
    return null;
  }
}

/**
 * Rookie MLBAM ids per season, cached as one small blob for a day. The FanGraphs
 * leaderboards behind it are ~5 MB each, too big for Next's fetch cache, so cache the
 * answer instead. Throws when nothing came back so a failure isn't cached.
 */
const getRookies = unstable_cache(
  async () => {
    const data = await getSwingPlusData();
    if (!data) throw new Error("Hitting+ data unavailable");
    const out: Record<string, number[]> = {};
    for (const y of data.seasons) {
      const ids = await getRookieIds(y);
      if (ids) out[y] = ids;
    }
    if (!Object.keys(out).length) throw new Error("No rookie lists from FanGraphs");
    return out;
  },
  ["hitting-plus-rookies"],
  { revalidate: 86400 },
);

export default async function HittingPlusPage() {
  const rookies = await getRookies().catch(() => null);
  return (
    <Suspense fallback={null}>
      <ExplorerLoader rookies={rookies} />
    </Suspense>
  );
}
