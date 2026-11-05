// Cross-check against FanGraphs' RosterResource, which usually records 40-man moves within a day.
// Cot's can take days or weeks to catch up on outrights, waiver claims and declined options, so
// a player RosterResource has left (or added) is worth a look. This only reports; it changes nothing.

const FG_PROXY = 'https://fg-proxy.vercel.app/api/fg-gamelog'

// FanGraphs team ids, keyed by our (Cot's) abbreviations.
export const FG_TEAM_IDS: Record<string, number> = {
  LAA: 1, BAL: 2, BOS: 3, CWS: 4, CLE: 5, DET: 6, KC: 7, MIN: 8, NYY: 9, ATH: 10,
  SEA: 11, TB: 12, TEX: 13, TOR: 14, ARI: 15, ATL: 16, CHC: 17, CIN: 18, COL: 19, MIA: 20,
  HOU: 21, LAD: 22, MIL: 23, WSH: 24, NYM: 25, PHI: 26, PIT: 27, STL: 28, SD: 29, SF: 30,
}

export interface RrPlayer { mlbamid: number | null; player: string; roster40: string; type: string }
export interface RrTransaction { mlbamid: number | null; playerName: string; transDate: string; transDesc: string }
export interface OurPlayer { mlbamId?: number | null; name: string; status: string }

export interface Difference {
  mlbamId: number | null
  name: string
  where: string // where the other side has him
  move?: string // RosterResource's latest transaction for him, if it's recent
}
export interface TeamCheck {
  leftRoster: Difference[] // on our 2027 roster, not on RosterResource's 40-man
  joinedRoster: Difference[] // on RosterResource's 40-man, not on our 2027 roster
}

async function get<T>(path: string, teamid: number): Promise<T> {
  const r = await fetch(`${FG_PROXY}?path=${path}&teamid=${teamid}`, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${path} (team ${teamid}) returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const rows = (await r.json()) as T
  if (!Array.isArray(rows)) throw new Error(`${path} (team ${teamid}) didn't return a list`)
  return rows
}

export async function fetchTeam(team: string): Promise<{ roster: RrPlayer[]; transactions: RrTransaction[] }> {
  const id = FG_TEAM_IDS[team]
  if (!id) throw new Error(`No FanGraphs team id for ${team}`)
  const [roster, transactions] = await Promise.all([
    get<RrPlayer[]>('/api/depth-charts/roster', id),
    get<RrTransaction[]>('/api/depth-charts/recent-transactions', id),
  ])
  // Every team carries 35-40 on the 40-man; far fewer means a bad response, not a fire sale.
  if (roster.filter((p) => p.roster40 === 'Y').length < 25) throw new Error(`${team}: RosterResource lists under 25 players on the 40-man`)
  return { roster, transactions }
}

const RR_LISTS: Record<string, string> = { 'il-rl': 'on the restricted list', 'il-60': 'on the 60-day IL' }
const describeRr = (p: RrPlayer | undefined) =>
  !p ? 'not with the team' : p.type.startsWith('off-') ? 'in the minors, off the 40-man' : `${RR_LISTS[p.type] ?? `listed as ${p.type}`}, off the 40-man`
const describeOurs = (p: OurPlayer | undefined) =>
  !p ? "not on Cot's sheet" : p.status === 'fa' ? "a free agent on Cot's" : p.status === 'option' ? 'a declined option by default' : `on Cot's as ${p.status}`

export function compareRoster(ourRoster: OurPlayer[], ourPlayers: OurPlayer[], rr: RrPlayer[], transactions: RrTransaction[]): TeamCheck {
  const rrById = new Map(rr.filter((p) => p.mlbamid != null).map((p) => [p.mlbamid!, p]))
  const on40 = new Set(rr.filter((p) => p.roster40 === 'Y' && p.mlbamid != null).map((p) => p.mlbamid!))
  const ourIds = new Set(ourRoster.map((p) => p.mlbamId).filter((id): id is number => id != null))
  const ourById = new Map(ourPlayers.filter((p) => p.mlbamId != null).map((p) => [p.mlbamId!, p]))
  const move = (id: number | null) => {
    const t = transactions.filter((x) => x.mlbamid === id && id != null).sort((a, b) => b.transDate.localeCompare(a.transDate))[0]
    return t ? { move: `${t.transDate.slice(0, 10)}: ${t.transDesc}` } : {}
  }

  const leftRoster = ourRoster
    .filter((p) => p.mlbamId != null && !on40.has(p.mlbamId))
    .map((p) => ({ mlbamId: p.mlbamId!, name: p.name, where: describeRr(rrById.get(p.mlbamId!)), ...move(p.mlbamId!) }))
  const seen = new Set<string>() // RosterResource can list a player twice (Graham Pauley, 2026-11-05)
  const joinedRoster = rr
    .filter((p) => p.roster40 === 'Y' && (p.mlbamid == null || !ourIds.has(p.mlbamid)))
    .filter((p) => { const k = String(p.mlbamid ?? p.player); return !seen.has(k) && !!seen.add(k) })
    .map((p) => ({ mlbamId: p.mlbamid, name: p.player, where: describeOurs(p.mlbamid == null ? undefined : ourById.get(p.mlbamid)), ...move(p.mlbamid) }))
  return { leftRoster, joinedRoster }
}
