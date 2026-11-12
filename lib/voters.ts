// Voter Profiles data: built by scripts/voters/build_profiles.py from BBWAA award ballot pages
// (bbwaa.com: MVP, Cy Young, Rookie, Manager, Reliever, 2012–2026) and Ryan Thibodaux's BBHOF Tracker (public HOF ballots, 2009–2026).
import profilesJson from "@/public/data/voters/profiles.json";
import awardsJson from "@/public/data/voters/awards.json";
import indexJson from "@/public/data/voters/index.json";

export type AwardCode = "mvp" | "cy" | "roy" | "reliever" | "mgr";

export const AWARD_NAMES: Record<AwardCode, string> = {
  mvp: "MVP",
  cy: "Cy Young",
  roy: "Rookie of the Year",
  reliever: "Reliever of the Year",
  mgr: "Manager of the Year",
};

export interface AwardPick {
  rank: number;
  id: number | null;
  name: string;
  finalRank: number;
  mentions: number;
  /** fWAR that season in that league (absent for Manager of the Year). */
  war?: number | null;
  /** Rank by fWAR among players eligible for the award. */
  warRank?: number | null;
}

export interface AwardBallot {
  award: AwardCode;
  places: number;
  year: number;
  league: "AL" | "NL";
  outlet: string | null;
  chapter: string | null;
  picks: AwardPick[];
  winner: string;
  firstMatchesWinner: boolean;
  deviation: number;
  solo: string[];
  /** Points-weighted fWAR of this ballot over the WAR ballot's (1 = as much WAR as the WAR ballot). */
  warMatch?: number | null;
  /** Picks that are on the WAR ballot. */
  warOverlap?: number | null;
  /** warMatch minus the median voter's that award-year. */
  warVsField?: number;
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
  awards?: {
    ballots: number;
    firstMatches: number;
    soloPicks: number;
    warBallots: number;
    warMatch: number | null;
    warVsField: number | null;
    warOverlap: number | null;
    warPercentile?: number;
    warPool?: number;
    byAward: Partial<Record<AwardCode, { ballots: number; firstMatches: number; avgDeviation: number; warMatch: number | null }>>;
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
  awards: AwardBallot[];
  hof: HofBallot[];
  similar: { slug: string; name: string; agree: number; shared: number; kind: string }[];
}

export interface VoterIndexRow {
  slug: string;
  name: string;
  outlet: string | null;
  chapter: string | null;
  hofYears: number[];
  awardBallots: number;
  awardYears: number[];
  awardCodes: AwardCode[];
  warMatch: number | null;
  warVsField: number | null;
  warBallots: number;
  warPercentile: number | null;
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

export interface AwardResult {
  award: AwardCode;
  places: number;
  year: number;
  league: "AL" | "NL";
  url: string;
  voters: number;
  medianDeviation: number;
  standings: { id: number | null; name: string; points: number; firsts: number; rank: number }[];
  warBallot: { id: number; name: string; war: number }[] | null;
  medianWarMatch: number | null;
  consensusWarMatch: number | null;
}

const profiles = profilesJson as unknown as Record<string, VoterProfile>;
const awards = awardsJson as unknown as { awards: AwardResult[]; hof: HofYear[] };

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

export function awardResult(award: AwardCode, year: number, league: string): AwardResult | undefined {
  return awards.awards.find((a) => a.award === award && a.year === year && a.league === league);
}
