// Voter Profiles data: built by scripts/voters/build_profiles.py from BBWAA MVP ballot pages
// (bbwaa.com, 2012–2025) and Ryan Thibodaux's BBHOF Tracker (public HOF ballots, 2009–2026).
import profilesJson from "@/public/data/voters/profiles.json";
import awardsJson from "@/public/data/voters/awards.json";
import indexJson from "@/public/data/voters/index.json";

export interface MvpPick {
  rank: number;
  id: number | null;
  name: string;
  finalRank: number;
  mentions: number;
}

export interface MvpBallot {
  year: number;
  league: "AL" | "NL";
  outlet: string | null;
  chapter: string | null;
  picks: MvpPick[];
  winner: string;
  firstMatchesWinner: boolean;
  deviation: number;
  solo: string[];
}

export interface HofBallot {
  year: number;
  votes: string[];
  count: number;
  blank: boolean;
  released: string | null;
  source: string | null;
  note: string | null;
  url: string | null;
  electeesBacked: number;
  electees: number;
  rare: string[];
}

export interface VoterSummary {
  hof?: {
    ballots: number;
    blank: number;
    avgNames: number;
    peerAvgNames: number | null;
    fullBallots: number;
    electeeRate: number | null;
    pedRate: number | null;
    pedPublicRate: number | null;
    rareVotes: number;
  };
  mvp?: {
    ballots: number;
    firstMatches: number;
    avgDeviation: number;
    soloPicks: number;
  };
}

export interface VoterProfile {
  slug: string;
  name: string;
  aliases: string[];
  outlet: string | null;
  /** Year of the MVP ballot the outlet comes from (HOF ballots carry no employer). */
  outletYear: number | null;
  chapter: string | null;
  summary: VoterSummary;
  mvp: MvpBallot[];
  hof: HofBallot[];
  similar: { slug: string; name: string; agree: number; shared: number; kind: string }[];
}

export interface VoterIndexRow {
  slug: string;
  name: string;
  outlet: string | null;
  chapter: string | null;
  hofYears: number[];
  mvpYears: number[];
  avgNames: number | null;
}

export interface HofCandidate {
  name: string;
  id: number | null;
  ballotYear: number | null;
  result: number | null;
  publicShare: number | null;
  elected: boolean;
  ped: boolean;
  inducted: "BBWAA" | "Committee" | null;
}

export interface HofYear {
  year: number;
  publicBallots: number;
  candidates: HofCandidate[];
}

export interface MvpAward {
  year: number;
  league: "AL" | "NL";
  url: string;
  voters: number;
  medianDeviation: number;
  standings: { id: number | null; name: string; points: number; firsts: number; rank: number }[];
}

const profiles = profilesJson as unknown as Record<string, VoterProfile>;
const awards = awardsJson as unknown as { mvp: MvpAward[]; hof: HofYear[] };

export const voterIndex = indexJson as unknown as VoterIndexRow[];

export function getVoter(slug: string): VoterProfile | null {
  return profiles[slug] ?? null;
}

export function allVoterSlugs(): string[] {
  return Object.keys(profiles);
}

export function hofYear(year: number): HofYear | undefined {
  return awards.hof.find((y) => y.year === year);
}

export function mvpAward(year: number, league: string): MvpAward | undefined {
  return awards.mvp.find((a) => a.year === year && a.league === league);
}
