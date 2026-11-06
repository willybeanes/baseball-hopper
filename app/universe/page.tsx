import type { Metadata } from "next";
import HitterUniverse from "@/components/universe/HitterUniverse";

export const metadata: Metadata = {
  title: "Hitter Universe — Baseball Hopper",
  description:
    "Every qualified hitter-season from 2024 to 2026, placed by how he swings and stands in the box. Find which hitters look alike on video, across seasons.",
};

export default function UniversePage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8 sm:px-5">
      <h1 className="text-[26px] font-bold tracking-tight text-[var(--text)]">Hitter Universe</h1>
      <p className="mb-5 mt-1 max-w-[68ch] text-[13px] leading-relaxed text-[var(--dim)]">
        Every qualified hitter-season has an address built from 14 coordinates: how he swings, the shape of his swing and his stance. It leaves out how well things turned out, so two hitters can look alike on video and still get very different results. Search a hitter to read his address and see who is closest to him, in any season.
      </p>
      <HitterUniverse />
    </main>
  );
}
