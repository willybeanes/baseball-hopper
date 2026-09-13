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

async function getData(): Promise<SwingPlusData | null> {
  try {
    const [dataRes, wrcRes] = await Promise.all([
      fetch(`${BASE}/swingplus_latest.json`, { next: { revalidate: 1800 } }),
      fetch(`${BASE}/wrc_plus.json`, { next: { revalidate: 1800 } }),
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
