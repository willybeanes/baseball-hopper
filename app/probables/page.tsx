import type { Metadata } from "next";
import { fetchProbablesData } from "@/lib/probables/fetch-probables";
import type { GridData } from "@/lib/probables/types";
import { Grid } from "./grid";

export const revalidate = 10800; // 3 hours

export const metadata: Metadata = {
  title: "Opposing Probables — Baseball Hopper",
  description:
    "See which pitchers your MLB team is facing — an inverted FanGraphs Probables Grid.",
};

export default async function ProbablesPage() {
  let data: GridData | null = null;
  try {
    data = await fetchProbablesData();
  } catch (err) {
    // At runtime, rethrow so ISR keeps serving the last good page. At build time there is
    // no previous page, and a FanGraphs outage/block shouldn't fail the whole deploy.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw err;
    console.error("Probables unavailable at build time:", err);
  }

  return (
    <main className="flex-1 w-full">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <a
            href="/"
            className="text-xs text-[var(--dimmer)] hover:text-[var(--dim)] transition-colors"
          >
            ← Baseball Hopper
          </a>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            Opposing Probables
          </h1>
          <p className="mt-1 text-sm text-[var(--dim)]">
            Which pitchers is your team facing? Inverted from the FanGraphs Probables Grid.
          </p>
        </div>

        {data ? (
          <>
            <Grid data={data} />

            <footer className="mt-6 text-center text-xs text-[var(--dim)]">
              Data from FanGraphs · Updated{" "}
              {new Date(data.lastUpdated).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </footer>
          </>
        ) : (
          <p className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 text-sm text-[var(--dim)]">
            FanGraphs probables data is temporarily unavailable. Check back in a few hours.
          </p>
        )}
      </div>
    </main>
  );
}
