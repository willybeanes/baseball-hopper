import type { Metadata } from "next";
import HitterUniverse from "@/components/universe/HitterUniverse";

export const metadata: Metadata = {
  title: "Hitter Universe — Baseball Hopper",
  description:
    "Every qualified hitter-season from 2024 to 2026 with an 11-coordinate address: seven swing styles and four Hitting+ components. Find who is closest to whom, across seasons.",
};

export default function UniversePage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8 sm:px-5">
      <h1 className="text-[26px] font-bold tracking-tight text-[var(--text)]">Hitter Universe</h1>
      <p className="mb-5 mt-1 max-w-[68ch] text-[13px] leading-relaxed text-[var(--dim)]">
        Every qualified hitter-season has an address built from 11 coordinates: seven swing styles and the four Hitting+ components. Search a hitter to read his address and see who is closest to him, in any season.
      </p>
      <HitterUniverse />
    </main>
  );
}
