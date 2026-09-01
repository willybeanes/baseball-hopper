import type { Metadata } from "next";
import { promises as fs } from "fs";
import path from "path";
import { Suspense } from "react";
import Explorer from "@/components/hitting-plus/Explorer";
import { SwingPlusData } from "@/lib/hitting-plus/types";

export const metadata: Metadata = {
  title: "Hitting+ — Baseball Hopper",
  description:
    "Four graded inputs to a swing, in the order they happen: Decision+, Timing+, Contact+ and Power+, refit into Hitting+.",
};

async function getData(): Promise<SwingPlusData | null> {
  const file = path.join(process.cwd(), "public", "data", "swingplus_latest.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const sanitized = raw.replace(/\bNaN\b/g, "null");
    const data = JSON.parse(sanitized) as SwingPlusData;

    const wrcFile = path.join(process.cwd(), "public", "data", "wrc_plus.json");
    let wrcMap: Record<string, Record<string, number>> = {};
    try {
      wrcMap = JSON.parse(await fs.readFile(wrcFile, "utf8"));
    } catch {
      // wrc_plus.json not yet generated; players get null wrc_plus
    }
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
          <p className="text-xl font-bold">No data file found</p>
          <p className="mt-3 text-sm text-[var(--dim)]">
            Expected <code className="text-[var(--accent)]">public/data/swingplus_latest.json</code>.
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
