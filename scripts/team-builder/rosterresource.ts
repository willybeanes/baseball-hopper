// Applies 40-man moves from FanGraphs' RosterResource that Cot's hasn't caught up with yet.
// RosterResource usually records waiver claims, outrights and releases within a day; Cot's can
// take days or weeks. Everything is worked out from the difference between the two rosters, so
// once Cot's catches up there is nothing left to apply, and running it twice changes nothing.

import type { Player, TeamFile } from '../../lib/team-builder/roster'

const FG_PROXY = 'https://fg-proxy.vercel.app/api/fg-gamelog'
const MAX_DIFFERENCES = 10 // more than this on one team is more likely bad data than a busy week

// FanGraphs team ids, keyed by our (Cot's) abbreviations.
export const FG_TEAM_IDS: Record<string, number> = {
  LAA: 1, BAL: 2, BOS: 3, CWS: 4, CLE: 5, DET: 6, KC: 7, MIN: 8, NYY: 9, ATH: 10,
  SEA: 11, TB: 12, TEX: 13, TOR: 14, ARI: 15, ATL: 16, CHC: 17, CIN: 18, COL: 19, MIA: 20,
  HOU: 21, LAD: 22, MIL: 23, WSH: 24, NYM: 25, PHI: 26, PIT: 27, STL: 28, SD: 29, SF: 30,
}

export interface RrPlayer {
  mlbamid: number | null
  player: string
  roster40: string
  type: string
  position?: string
  throws?: string
  age?: string
  servicetime?: string
}
export interface RrTransaction { mlbamid: number | null; playerName: string; transDate: string; transDesc: string }
export interface RrTeam { roster: RrPlayer[]; transactions: RrTransaction[] }

async function get<T>(path: string, teamid: number): Promise<T> {
  const r = await fetch(`${FG_PROXY}?path=${path}&teamid=${teamid}`, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`${path} (team ${teamid}) returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const rows = (await r.json()) as T
  if (!Array.isArray(rows)) throw new Error(`${path} (team ${teamid}) didn't return a list`)
  return rows
}

export async function fetchTeam(team: string): Promise<RrTeam> {
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

// All 30 teams, a few at a time to go easy on fg-proxy and FanGraphs. A team that fails is left out.
export async function fetchAll(teams: string[]): Promise<{ data: Map<string, RrTeam>; failed: string[] }> {
  const data = new Map<string, RrTeam>()
  const failed: string[] = []
  for (let i = 0; i < teams.length; i += 5) {
    await Promise.all(teams.slice(i, i + 5).map(async (t) => {
      try { data.set(t, await fetchTeam(t)) } catch (e) { failed.push((e as Error).message) }
    }))
  }
  return { data, failed }
}

export interface Change {
  team: string
  name: string
  mlbamId: number | null
  change: string // what we did, or why we left it alone
  move?: string // RosterResource's latest transaction for him
}

const LISTS: Record<string, string> = { 'il-rl': 'the restricted list', 'il-60': 'the 60-day IL' }
const onDefaultRoster = (p: Player) => p.status !== 'fa' && (p.status !== 'option' || p.defaultExercised !== false)

function rrPos(r: RrPlayer): string {
  const pos = (r.position ?? '').toUpperCase()
  const hand = r.throws === 'L' ? 'lhp' : 'rhp'
  if (pos === 'SP') return `${hand}-s`
  if (pos === 'RP' || pos === 'P') return hand
  return pos.toLowerCase().replace(/\//g, '-') || 'inf'
}

export interface Context {
  targetYear: number
  today: Date
  minimum: number
  roughArb: Record<string, number> // rough arbitration salary by arbitration year
  arb: Map<number, number> // MLBTR arbitration estimates by MLBAM id
  freeAgents: Set<number> // on MLBTR's free-agent list (a signing, terms unknown)
}

export function applyRosterMoves(teams: TeamFile[], rr: Map<string, RrTeam>, ctx: Context): { applied: Change[]; reported: Change[] } {
  const applied: Change[] = []
  const reported: Change[] = []
  const byTeam = new Map(teams.map((t) => [t.team, t]))
  const lastMove = (team: string, id: number | null) => {
    const t = rr.get(team)?.transactions.filter((x) => id != null && x.mlbamid === id).sort((a, b) => b.transDate.localeCompare(a.transDate))[0]
    return t ? `${t.transDate.slice(0, 10)}: ${t.transDesc}` : undefined
  }
  const note = (list: Change[], team: string, name: string, mlbamId: number | null, change: string, moveTeam = team) => {
    const move = lastMove(moveTeam, mlbamId) ?? lastMove(team, mlbamId)
    list.push({ team, name, mlbamId, change, ...(move ? { move } : {}) })
  }
  const findPlayer = (id: number) => {
    for (const t of teams) { const p = t.players.find((x) => x.mlbamId === id); if (p) return { t, p } }
    return null
  }

  // Each team's differences, worked out before anything changes.
  const diffs = new Map<string, { left: Player[]; joined: RrPlayer[]; rrById: Map<number, RrPlayer> }>()
  const rrTeamOf = new Map<number, string>() // who has him on the 40-man, per RosterResource
  for (const [team, r] of rr) {
    const t = byTeam.get(team)
    if (!t) continue
    const rrById = new Map(r.roster.filter((p) => p.mlbamid != null).map((p) => [p.mlbamid!, p]))
    const on40 = new Set(r.roster.filter((p) => p.roster40 === 'Y' && p.mlbamid != null).map((p) => p.mlbamid!))
    for (const id of on40) rrTeamOf.set(id, team)
    const ours = new Set(t.players.filter(onDefaultRoster).map((p) => p.mlbamId).filter((id): id is number => id != null))
    const left = t.players.filter((p) => onDefaultRoster(p) && p.mlbamId != null && !on40.has(p.mlbamId))
    const seen = new Set<number>() // RosterResource can list a player twice (Graham Pauley, 2026-11-05)
    const joined = r.roster.filter((p) => p.roster40 === 'Y' && p.mlbamid != null && !ours.has(p.mlbamid) && !seen.has(p.mlbamid) && !!seen.add(p.mlbamid))
    if (left.length + joined.length > MAX_DIFFERENCES) {
      reported.push({ team, name: '', mlbamId: null, change: `${left.length + joined.length} differences from RosterResource, more than the ${MAX_DIFFERENCES} we apply on our own; left as Cot's has it` })
      continue
    }
    diffs.set(team, { left, joined, rrById })
  }

  // Additions first, so a claimed player moves with his contract instead of being let go.
  for (const [team, { joined }] of diffs) {
    const t = byTeam.get(team)!
    for (const r of joined) {
      const id = r.mlbamid!
      const found = findPlayer(id)
      if (found && found.t === t) {
        if (found.p.status === 'option') {
          found.p.defaultExercised = true
          found.p.corrected = 'RosterResource has him on the 40-man: option exercised'
          note(applied, team, found.p.name, id, 'option exercised, back on the roster')
        } else {
          note(reported, team, found.p.name, id, `on RosterResource's 40-man, but a free agent on Cot's; contract unknown, left off`)
        }
      } else if (found && onDefaultRoster(found.p)) {
        const from = found.t
        from.players = from.players.filter((p) => p !== found.p)
        t.players.push({ ...found.p, corrected: `RosterResource: moved from ${from.team}` })
        note(applied, team, found.p.name, id, `moved from ${from.team} with his contract`, from.team)
      } else if (found || ctx.freeAgents.has(id)) {
        note(reported, team, found?.p.name ?? r.player, id, 'signed as a free agent; contract unknown until Cot\'s adds it')
      } else {
        // MLBTR's estimate, or the rough rule for a player with 3+ years MLBTR doesn't list.
        const mls = r.servicetime ? Number(r.servicetime) : null
        const arbYear = mls != null && mls >= 3 ? Math.min(Math.floor(mls) - 2, 4) : undefined
        const arb = ctx.arb.get(id) ?? (arbYear ? Math.max(ctx.roughArb[String(arbYear)] ?? ctx.minimum, ctx.minimum) : undefined)
        const name = r.player.replace(/\s*\([a-z]+\)$/i, '') // RosterResource tags some names, e.g. "(mil)"
        // RosterResource gives today's age; ours is age on July 1 of the target season.
        const age = r.age ? Math.floor(Number(r.age) + (Date.UTC(ctx.targetYear, 6, 1) - ctx.today.getTime()) / (365.25 * 864e5)) : null
        t.players.push({
          name, sheetName: '', pos: rrPos(r), age: Number.isFinite(age) ? age : null,
          mls, contract: 'Added to the 40-man',
          status: arb != null ? 'arb' : 'prearb', ...(arbYear ? { arbYear } : {}), salary: arb ?? ctx.minimum, taxValue: arb ?? ctx.minimum, salaryPrevYear: null,
          mlbamId: id, salarySource: ctx.arb.has(id) ? 'mlbtr-arb' : arb != null ? 'rough-arb' : 'minimum', corrected: 'Added from RosterResource',
        })
        note(applied, team, name, id, arb != null ? 'added to the roster at his arbitration estimate' : 'added to the roster at the minimum')
      }
    }
  }

  // Then whoever is still on a roster RosterResource no longer has him on.
  for (const [team, { left, rrById }] of diffs) {
    const t = byTeam.get(team)!
    for (const p of left) {
      if (!t.players.includes(p)) continue
      const id = p.mlbamId!
      const rrp = rrById.get(id)
      const dest = rrTeamOf.get(id)
      if (dest && dest !== team) {
        if (byTeam.get(dest)?.players.some((x) => x.mlbamId === id)) {
          // Already with his new team (moved on an earlier day, kept in that team's snapshot).
          t.players = t.players.filter((x) => x !== p)
          note(applied, team, p.name, id, `moved to ${dest}`, dest)
        } else {
          // Claimed or traded, but his new team had too many differences to apply.
          note(reported, team, p.name, id, `on ${dest}'s 40-man per RosterResource; left as Cot's has it`, dest)
        }
        continue
      }
      if (rrp && !rrp.type.startsWith('off-')) {
        note(reported, team, p.name, id, `on ${LISTS[rrp.type] ?? rrp.type}, off the 40-man; left on the roster`)
        continue
      }
      // Only a release or an election of free agency makes him a free agent; an outright,
      // a DFA or a Rule 5 return just takes him off this 40-man (RosterResource may not list him).
      const move = lastMove(team, id) ?? ''
      const free = !rrp && /releas|free agen/i.test(move)
      // A guaranteed contract is still owed after a release or outright.
      if (p.status === 'signed' && (p.salary ?? 0) > 0) {
        t.deadMoney = [...t.deadMoney, { name: p.name, salary: p.salary!, taxValue: p.taxValue ?? p.salary!, note: `${free ? 'released' : 'off the 40-man'} (RosterResource)` }]
      }
      if (!free) {
        t.players = t.players.filter((x) => x !== p)
        note(applied, team, p.name, id, 'off the 40-man')
      } else {
        Object.assign(p, { status: 'fa', salary: null, taxValue: null, walkYear: undefined, salarySource: 'none', corrected: 'RosterResource: released' })
        delete p.defaultExercised
        note(applied, team, p.name, id, 'released, now a free agent')
      }
    }
  }
  return { applied, reported }
}

