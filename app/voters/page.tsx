import type { Metadata } from "next";
import VoterList from "@/components/voters/VoterList";
import { voterIndex } from "@/lib/voters";

export const metadata: Metadata = {
  title: "Voter Profiles — Baseball Hopper",
  description:
    "Every public BBWAA Hall of Fame ballot since 2009 and every BBWAA award ballot since 2012, organized by voter.",
};

export default function VotersPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8 sm:px-5">
      <h1 className="text-[26px] font-bold tracking-tight text-[var(--text)]">Voter Profiles</h1>
      <p className="mb-5 mt-1 max-w-[60ch] text-[13px] leading-relaxed text-[var(--dim)]">
        How each BBWAA writer votes: every public Hall of Fame ballot from 2009 to 2026, from Ryan Thibodaux&rsquo;s BBHOF
        Tracker, and every MVP, Cy Young, Rookie, Manager and Reliever of the Year ballot since 2012, from bbwaa.com. Search a writer or outlet to open their profile.
      </p>
      <VoterList rows={voterIndex} />
    </main>
  );
}
