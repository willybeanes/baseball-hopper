// MLB Stats API roster lookups used to match names to MLBAM ids.
import { MLB_TEAM_IDS, type RosterPerson } from './ids'

const STATS_API = 'https://statsapi.mlb.com/api/v1'

async function statsApi<T>(path: string): Promise<T> {
  const r = await fetch(STATS_API + path, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`MLB stats API ${path} returned HTTP ${r.status}`)
  return r.json() as Promise<T>
}

export interface OrgPlayer extends RosterPerson { pos: string }

// Each team's 40-man, everyone it used this season, and its whole organization (minor
// leaguers included, with positions).
export async function teamPool(team: string, season: number): Promise<{ pool: RosterPerson[]; fortyMan: Set<number>; org: OrgPlayer[] }> {
  const types = ['40Man', 'fullSeason', 'fullRoster']
  const rosters = await Promise.all(
    types.map((t) =>
      statsApi<{ roster?: { person: RosterPerson; position?: { abbreviation?: string } }[] }>(`/teams/${MLB_TEAM_IDS[team]}/roster?rosterType=${t}&season=${season}`),
    ),
  )
  const people = rosters.map((d) => (d.roster ?? []).map((r) => ({ id: r.person.id, fullName: r.person.fullName })))
  const org = (rosters[2].roster ?? []).map((r) => ({ id: r.person.id, fullName: r.person.fullName, pos: (r.position?.abbreviation ?? '').toLowerCase() }))
  return { pool: people.flat(), fortyMan: new Set(people[0].map((p) => p.id)), org }
}

// Birthdates for a list of players, in batches the API accepts.
export async function birthDates(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const d = await statsApi<{ people?: { id: number; birthDate?: string }[] }>(`/people?personIds=${ids.slice(i, i + 200).join(',')}`)
    for (const p of d.people ?? []) if (p.birthDate) out.set(p.id, p.birthDate)
  }
  return out
}

// Everyone who played in the majors this season or last.
export async function leaguePool(season: number): Promise<RosterPerson[]> {
  const seasons = [season, season - 1]
  const lists = await Promise.all(seasons.map((y) => statsApi<{ people: RosterPerson[] }>(`/sports/1/players?season=${y}`)))
  return lists.flatMap((d) => d.people.map((p) => ({ id: p.id, fullName: p.fullName })))
}

// Last resort for a name with no team: MLB's own name search. Only a single result who has
// played in the majors counts, so a common name returns null rather than a guess.
export async function searchMajorLeaguer(name: string): Promise<number | null> {
  const d = await statsApi<{ people?: { id: number; mlbDebutDate?: string }[] }>(`/people/search?names=${encodeURIComponent(name)}`)
  const debuted = (d.people ?? []).filter((p) => p.mlbDebutDate)
  return debuted.length === 1 ? debuted[0].id : null
}
