import { NextResponse } from "next/server";

// Search index for the navbar: everyone who played in MLB over the last few seasons.
export const revalidate = 86400;

const SEASONS_BACK = 4;
const API = "https://statsapi.mlb.com/api/v1";

interface Person {
  id: number;
  fullName: string;
  currentTeam?: { id?: number };
  primaryPosition?: { abbreviation?: string };
}

/** Rows are [mlbamId, name, team, position, lastSeason] to keep the payload small. */
export type PlayerIndexRow = [number, string, string, string, number];

export async function GET() {
  const latest = new Date().getFullYear();
  const seasons = Array.from({ length: SEASONS_BACK }, (_, i) => latest - i);

  const [teamsRes, ...seasonRes] = await Promise.all([
    fetch(`${API}/teams?sportId=1&fields=teams,id,abbreviation`, { next: { revalidate } }),
    ...seasons.map((y) =>
      fetch(
        `${API}/sports/1/players?season=${y}&fields=people,id,fullName,currentTeam,primaryPosition,abbreviation`,
        { next: { revalidate } },
      ),
    ),
  ]);

  const teams: { id: number; abbreviation: string }[] = teamsRes.ok ? (await teamsRes.json()).teams ?? [] : [];
  const abbr = new Map(teams.map((t) => [t.id, t.abbreviation]));

  // Newest season first, so each player keeps their most recent team and season.
  const byId = new Map<number, PlayerIndexRow>();
  for (let i = 0; i < seasons.length; i++) {
    const res = seasonRes[i];
    if (!res.ok) continue;
    const people: Person[] = (await res.json()).people ?? [];
    for (const p of people) {
      if (byId.has(p.id)) continue;
      byId.set(p.id, [
        p.id,
        p.fullName,
        abbr.get(p.currentTeam?.id ?? -1) ?? "",
        p.primaryPosition?.abbreviation ?? "",
        seasons[i],
      ]);
    }
  }

  if (!byId.size) return NextResponse.json({ error: "MLB Stats API unavailable" }, { status: 502 });
  return NextResponse.json([...byId.values()], {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
