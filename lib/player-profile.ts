/**
 * Bio and standard stat lines for the player page, from the MLB Stats API.
 * Kept apart from lib/player.ts, which stays the thin id → name/team layer the tools share.
 */
import { TEAM_ABBR } from "./hitting-plus/teams";

type Stat = Record<string, string | number | undefined>;

interface Split {
  season?: string;
  stat: Stat;
  team?: { name?: string };
  sport?: { id?: number };
  numTeams?: number;
}

interface StatsGroup {
  type: { displayName: string };
  group: { displayName: string };
  splits: Split[];
}

interface Person {
  id: number;
  fullName: string;
  lastFirstName: string;
  primaryNumber?: string;
  birthDate?: string;
  currentAge?: number;
  birthCity?: string;
  birthStateProvince?: string;
  birthCountry?: string;
  height?: string;
  weight?: number;
  active?: boolean;
  mlbDebutDate?: string;
  currentTeam?: { name?: string };
  primaryPosition?: { abbreviation?: string; name?: string; type?: string };
  batSide?: { code?: string };
  pitchHand?: { code?: string };
  drafts?: { year?: string; pickRound?: string; pickNumber?: number; team?: { name?: string } }[];
  stats?: StatsGroup[];
}

export interface SeasonLine {
  season: number;
  /** "DET", or "MIA/NYY" for a traded season (stats are the combined line). */
  team: string;
  stat: Stat;
}

export interface PlayerProfile {
  mlbamId: number;
  displayName: string;
  storedName: string;
  number: string | null;
  teamName: string | null;
  team: string | null;
  position: string | null;
  positionName: string | null;
  isPitcher: boolean;
  isTwoWay: boolean;
  bats: string | null;
  throws: string | null;
  age: number | null;
  born: string | null;
  height: string | null;
  weight: number | null;
  debut: string | null;
  draft: string | null;
  active: boolean;
  hitting: { seasons: SeasonLine[]; career: Stat | null };
  pitching: { seasons: SeasonLine[]; career: Stat | null };
}

const abbr = (name?: string) => (name ? TEAM_ABBR[name] ?? name : "");

/** MLB-level season lines, one per season; a traded season keeps only the combined row. */
function seasonLines(groups: StatsGroup[], group: string): SeasonLine[] {
  const splits = groups
    .find((g) => g.type.displayName === "yearByYear" && g.group.displayName === group)
    ?.splits.filter((s) => s.sport?.id === 1 && s.season) ?? [];
  const bySeason = new Map<number, Split[]>();
  for (const s of splits) {
    const y = Number(s.season);
    bySeason.set(y, [...(bySeason.get(y) ?? []), s]);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, rows]) => {
      const total = rows.find((r) => !r.team) ?? rows[0];
      const teams = rows.filter((r) => r.team).map((r) => abbr(r.team?.name));
      return { season, team: teams.join("/"), stat: total.stat };
    });
}

function career(groups: StatsGroup[], group: string): Stat | null {
  return (
    groups.find((g) => g.type.displayName === "career" && g.group.displayName === group)?.splits[0]?.stat ??
    null
  );
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export async function fetchPlayerProfile(mlbamId: number): Promise<PlayerProfile | null> {
  try {
    const hydrate = "currentTeam,draft,stats(group=[hitting,pitching],type=[yearByYear,career])";
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${mlbamId}?hydrate=${encodeURIComponent(hydrate)}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const p = ((await res.json()) as { people?: Person[] }).people?.[0];
    if (!p) return null;

    const groups = p.stats ?? [];
    const hitting = { seasons: seasonLines(groups, "hitting"), career: career(groups, "hitting") };
    const pitching = { seasons: seasonLines(groups, "pitching"), career: career(groups, "pitching") };
    const pos = p.primaryPosition?.abbreviation ?? null;
    const isTwoWay = pos === "TWP";
    const isPitcher = !isTwoWay && p.primaryPosition?.type === "Pitcher";

    // A player drafted more than once signed with the most recent pick.
    const d = [...(p.drafts ?? [])].sort((a, b) => Number(b.year) - Number(a.year))[0];
    const draft = d?.year
      ? [d.year, d.pickRound ? `Rd ${d.pickRound}` : null, d.pickNumber ? `#${d.pickNumber}` : null, abbr(d.team?.name) || null]
          .filter(Boolean)
          .join(" · ")
      : null;

    return {
      mlbamId,
      displayName: p.fullName,
      storedName: p.lastFirstName,
      number: p.primaryNumber ?? null,
      teamName: p.currentTeam?.name ?? null,
      team: p.currentTeam?.name ? abbr(p.currentTeam.name) : null,
      position: pos,
      positionName: p.primaryPosition?.name ?? null,
      isPitcher,
      isTwoWay,
      bats: p.batSide?.code ?? null,
      throws: p.pitchHand?.code ?? null,
      age: p.currentAge ?? null,
      born: [formatDate(p.birthDate), [p.birthCity, p.birthStateProvince ?? p.birthCountry].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ") || null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      debut: formatDate(p.mlbDebutDate),
      draft,
      active: p.active ?? false,
      hitting,
      pitching,
    };
  } catch {
    return null;
  }
}
