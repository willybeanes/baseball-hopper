// Free agents from FanGraphs' RosterResource free-agent tracker that no other list carries:
// mostly players posted from NPB and KBO (Teruaki Sato, 2026-11), plus any MLB free agent
// MLBTR's list missed. The tracker only gives FanGraphs ids; projections map them to MLBAM ids,
// or to a stand-in id for players MLB hasn't given one yet.

import { fgOnlyId, type MlbtrFreeAgent } from '../../lib/team-builder/pool'

const FG_PROXY = 'https://fg-proxy.vercel.app/api/fg-gamelog'

export interface TrackerRow {
  playerId: string
  playerName: string
  position: string | null
  Throws: string | null
  age: number | null
  team_prev: string | null
  free_agent_status: string | null
  med_years: number | null
  med_aav: number | null
}

export async function fetchTracker(season: number): Promise<TrackerRow[]> {
  const r = await fetch(`${FG_PROXY}?path=/api/tools/free-agent-tracker/v2/free-agents&season=${season}`, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`Free-agent tracker returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const rows = (await r.json()) as TrackerRow[]
  if (!Array.isArray(rows) || rows.length < 50) throw new Error(`Free-agent tracker came back with ${Array.isArray(rows) ? rows.length : 0} players`)
  return rows
}

const LEAGUES: Record<string, string> = { NPB: 'Japan (NPB)', KBO: 'Korea (KBO)', CPBL: 'Taiwan (CPBL)' }

function positions(r: TrackerRow): string[] {
  const hand = r.Throws === 'L' ? 'lhp' : 'rhp'
  return (r.position ?? '').split('/').filter(Boolean).map((p) => {
    const u = p.toUpperCase()
    return u === 'SP' ? `${hand}-s` : u === 'RP' || u === 'P' ? hand : u.toLowerCase()
  })
}

// fgToMlbam: FanGraphs id -> MLBAM id, from the projections. `known` is everyone already in the pool.
export function trackerFreeAgents(rows: TrackerRow[], fgToMlbam: Map<string, number>, known: Set<number>): MlbtrFreeAgent[] {
  const out: MlbtrFreeAgent[] = []
  for (const r of rows) {
    if (r.free_agent_status !== 'IS_FA') continue
    const id = fgToMlbam.get(String(r.playerId)) ?? fgOnlyId(String(r.playerId))
    if (id == null || known.has(id)) continue
    known.add(id)
    const league = r.team_prev ? LEAGUES[r.team_prev] : undefined
    const crowd = r.med_years && r.med_aav ? `FanGraphs crowd: ${r.med_years} y/$${Math.round(r.med_aav / 1e5) / 10}M a year` : ''
    const note = [league ? `From ${league}` : '', crowd].filter(Boolean).join('. ')
    out.push({ name: r.playerName, age: r.age ?? 0, positions: positions(r), mlbamId: id, ...(note ? { note } : {}) })
  }
  return out
}
