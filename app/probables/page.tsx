import type { Metadata } from "next";
import Link from "next/link";

// Disabled for the offseason: FanGraphs started returning 403 for the probables-grid
// endpoint, and there are no regular-season probables until spring. The grid UI
// (./grid.tsx) and fetcher (lib/probables) are kept; restore the previous version of
// this page from git history to turn it back on.

export const metadata: Metadata = {
  title: "Opposing Probables — Baseball Hopper",
  robots: { index: false },
};

export default function ProbablesPage() {
  return (
    <main className="flex-1 w-full">
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Opposing Probables</h1>
        <p className="mt-3 text-sm text-[var(--dim)]">
          Off for the offseason. It&rsquo;ll be back when probable starters are announced next
          spring.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-[var(--accent)] hover:underline"
        >
          ← Back to Baseball Hopper
        </Link>
      </div>
    </main>
  );
}
