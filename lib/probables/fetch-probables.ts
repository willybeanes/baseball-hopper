import type { FanGraphsRecord, FanGraphsResponse, GridData, OpposingProbable, TeamData } from "./types";

const FANGRAPHS_API =
  "https://www.fangraphs.com/api/roster-resource/probables-grid/data";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(dateStr: string): { iso: string; dayOfWeek: string; display: string } {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const iso = `${d.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayOfWeek = DAY_NAMES[d.getDay()]!;
  return { iso, dayOfWeek, display: `${dayOfWeek} ${month}/${day}` };
}

export async function fetchProbablesData(): Promise<GridData> {
  const res = await fetch(FANGRAPHS_API, {
    next: { revalidate: 10800 }, // 3 hours
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OpposingProbables/1.0)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`FanGraphs API returned ${res.status}`);
  }

  const json: FanGraphsResponse = await res.json();
  return buildGrid(json.games);
}

function buildGrid(records: FanGraphsRecord[]): GridData {
  // Filter out past dates (match FanGraphs behavior: start from today)
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  records = records.filter((r) => formatDate(r.gameDate).iso >= todayIso);

  // Collect all unique dates
  const dateSet = new Set<string>();
  for (const r of records) {
    dateSet.add(formatDate(r.gameDate).iso);
  }
  const dates = [...dateSet].sort();

  // Group records by team
  const teamMap = new Map<string, { league: string; division: string; records: FanGraphsRecord[] }>();
  for (const r of records) {
    if (!teamMap.has(r.abbName)) {
      teamMap.set(r.abbName, {
        league: r.league,
        division: r.division,
        records: [],
      });
    }
    teamMap.get(r.abbName)!.records.push(r);
  }

  // Build opposing probables for each team
  const teams: TeamData[] = [];

  for (const [abbName, info] of teamMap) {
    const games: OpposingProbable[] = [];

    for (const r of info.records) {
      const { iso, dayOfWeek } = formatDate(r.gameDate);
      const oppAbb = r.opponent.abbName;
      const isAway = !r.isHome;

      const oppSp = r.opponent.sp;

      games.push({
        date: iso,
        dayOfWeek,
        opponent: oppAbb,
        isAway,
        pitcher: oppSp?.name ?? null,
        hand: oppSp?.throws ?? null,
        dh: r.dh,
      });
    }

    // Sort by date
    games.sort((a, b) => a.date.localeCompare(b.date));

    teams.push({
      abbName,
      shortName: abbName,
      league: info.league,
      division: info.division,
      games,
    });
  }

  // Sort teams by division grouping (AL East, AL Central, AL West, NL East, etc.)
  const divOrder: Record<string, number> = {
    "AL-E": 0, "AL-C": 1, "AL-W": 2,
    "NL-E": 3, "NL-C": 4, "NL-W": 5,
  };
  teams.sort((a, b) => {
    const aKey = `${a.league}-${a.division}`;
    const bKey = `${b.league}-${b.division}`;
    const aOrder = divOrder[aKey] ?? 99;
    const bOrder = divOrder[bKey] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.abbName.localeCompare(b.abbName);
  });

  return {
    teams,
    dates,
    lastUpdated: new Date().toISOString(),
  };
}
