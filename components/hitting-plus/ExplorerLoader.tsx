"use client";

import { useEffect, useState } from "react";
import type { SwingPlusData } from "@/lib/hitting-plus/types";
import type { MlbInfo } from "@/lib/hitting-plus/headshot";
import { applyRookieFlags, parseSwingPlus } from "@/lib/hitting-plus/merge";
import Explorer from "./Explorer";

const HP_DATA = "https://hitting-plus.vercel.app/data";

type Loaded = { data: SwingPlusData; ids: Record<string, number>; info: Record<string, MlbInfo> };

/**
 * Loads the Hitting+ dataset in the browser, straight from hitting-plus.vercel.app's static
 * files. Building the ~2.7 MB dataset into this page made it a ~5 MB Vercel ISR write on
 * every rebuild; now the page only carries the small rookie lists.
 */
export default function ExplorerLoader({ rookies }: { rookies: Record<string, number[]> | null }) {
  const [loaded, setLoaded] = useState<Loaded | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dataRes, wrcRes, infoRes] = await Promise.all([
          fetch(`${HP_DATA}/swingplus_latest.json`),
          fetch(`${HP_DATA}/wrc_plus.json`),
          fetch(`${HP_DATA}/player_info.json`),
        ]);
        if (!dataRes.ok) throw new Error(`swingplus ${dataRes.status}`);
        const wrcMap = wrcRes.ok ? await wrcRes.json() : {};
        const info: Record<string, MlbInfo> = infoRes.ok ? await infoRes.json() : {};
        const data = parseSwingPlus(await dataRes.text(), wrcMap);
        const ids: Record<string, number> = {};
        for (const [name, v] of Object.entries(info)) ids[name] = v.id;
        if (rookies && Object.keys(ids).length) applyRookieFlags(data, ids, rookies);
        if (!cancelled) setLoaded({ data, ids, info });
      } catch (err) {
        console.error("Hitting+ data:", err);
        if (!cancelled) setLoaded("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rookies]);

  if (loaded === "error") {
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
  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--dim)] text-sm">
        Loading Hitting+…
      </div>
    );
  }
  return <Explorer data={loaded.data} ids={loaded.ids} info={loaded.info} />;
}
