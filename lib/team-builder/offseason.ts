// The offseason simulation: every team acts on its attitude (all in, contend, buy and sell,
// quick rebuild, tank) through option decisions, non-tenders, trades and free agency, and the
// result is a projected 2027 standings table. Settings and reasoning are in assumptions.json
// ("offseason").
//
// The simulation never edits a roster directly. It only adds the same moves a user makes in the
// Team Builder (moves.ts), so payroll, buyouts and dead money work the same way, and every
// team's result opens in the Team Builder through an ordinary share link.

import assumptions from './assumptions.json'
import payrolls2026 from './payrolls-2026.json'
import { depthChart, type DepthPlayer } from './depth'
import { buildRoster, type BuiltRoster, type Move } from './moves'
import type { PoolPlayer } from './pool'
import { projectedRecord, warScale } from './record'
import { warPrice, type TeamFile } from './roster'

export type Attitude = 'allin' | 'contend' | 'buysell' | 'rebuild' | 'tank'

interface AttitudeSettings {
  label: string
  budget: number // multiple of what the team already owes for 2027
  cushion: number // plus this much, in dollars
  maxSignings: number
  keepFactor: number
  minGain: number
  eagerness: number
  buys: number
  sells: number
  sellAge?: number
  sellWalkYearOnly?: boolean
  maxAge?: number
  maxSalary?: number
}
const S = assumptions.offseason
export const ATTITUDES = S.attitudes as Record<Attitude, AttitudeSettings>
export const ATTITUDE_ORDER: Attitude[] = ['allin', 'contend', 'buysell', 'rebuild', 'tank']

export type Phase = 'decisions' | 'trades' | 'free-agency'
export const PHASES: { key: Phase; label: string }[] = [
  { key: 'decisions', label: 'Options and non-tenders' },
  { key: 'trades', label: 'Trades' },
  { key: 'free-agency', label: 'Free agency' },
]

export interface Transaction {
  phase: Phase
  kind: 'declined' | 'exercised' | 'non-tendered' | 'opted-out' | 'traded' | 'signed' | 'released'
  team: string // who acted (the buyer in a trade)
  other?: string // the selling team in a trade, the former team in a signing
  id: number
  name: string
  war: number | null
  salary: number | null
  prospects?: { id: number; name: string; war: number }[] // what a seller got back
  bidders?: number // free agency: how many teams bid
  ask?: number // free agency: his asking price, before a crowded market pushed it up
  // free agency: every team that bid, keenest first. gain is the WAR he'd add to that team's
  // depth chart; interest is gain x eagerness x luck, relative to the winner's (1).
  bids?: { team: string; gain: number; interest: number }[]
}

export interface TeamResult {
  team: string
  attitude: Attitude
  moves: Move[] // manual moves first, then the simulation's
  warBefore: number // with the user's moves, before the simulation's
  warAfter: number
  winsBefore: number
  winsAfter: number
  payrollBefore: number
  payrollAfter: number
  budget: number
}

export interface Simulation { log: Transaction[]; teams: Record<string, TeamResult> }

export interface SimInput {
  teams: TeamFile[]
  pool: PoolPlayer[]
  attitudes: Record<string, Attitude>
  manual: Record<string, Move[]> // the user's moves, applied first and never undone
  seed: number
  perWin: number
  minimum: number
}

// Small, seedable random numbers, so a result can be reproduced from its link.
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const depthPlayers = (b: BuiltRoster): DepthPlayer[] =>
  b.slots.filter((s) => s.onRoster).map((s) => ({ id: s.player.mlbamId ?? s.player.sheetName, name: s.player.name, pos: s.player.pos, war: s.player.war, pa: s.player.pa, ip: s.player.ip }))
export const teamWar = (b: BuiltRoster) => depthChart(depthPlayers(b)).total

// What a team spent in 2026 (Cot's year-end payroll, payrolls-2026.json): how big a spender it
// is, and the payroll it builds back toward this winter. Summing salaryPrevYear on today's sheet
// misses everyone who has left, so it's only a fallback.
const PAYROLLS_2026 = payrolls2026 as unknown as Record<string, { payroll: number; tax: number } | undefined>
export const payroll2026 = (t: TeamFile) =>
  PAYROLLS_2026[t.team]?.payroll ?? t.players.reduce((n, p) => n + (p.salaryPrevYear ?? 0), 0)

// Starting attitudes from today's projected records: the best few with big payrolls go all in,
// the rest of the top ten contend, the bottom eight rebuild and the bottom three tank.
export function defaultAttitudes(teams: TeamFile[], pool: PoolPlayer[]): Record<string, Attitude> {
  const war = new Map(teams.map((t) => [t.team, teamWar(buildRoster(t, [], pool))]))
  const byWar = [...teams].sort((a, b) => war.get(b.team)! - war.get(a.team)!)
  const bigSpenders = new Set([...teams].sort((a, b) => payroll2026(b) - payroll2026(a)).slice(0, 10).map((t) => t.team))
  const out: Record<string, Attitude> = {}
  let allIn = 0
  byWar.forEach((t, i) => {
    const fromBottom = byWar.length - 1 - i
    if (i < 10 && allIn < 3 && bigSpenders.has(t.team)) { out[t.team] = 'allin'; allIn++ } else if (i < 10) out[t.team] = 'contend'
    else if (fromBottom < 3) out[t.team] = 'tank'
    else if (fromBottom < 8) out[t.team] = 'rebuild'
    else out[t.team] = 'buysell'
  })
  return out
}

export function simulateOffseason(input: SimInput): Simulation {
  const { teams, pool, attitudes, manual, perWin, minimum } = input
  const rand = mulberry32(input.seed)
  const luck = () => 1 - S.luck / 2 + rand() * S.luck
  const poolById = new Map(pool.map((e) => [e.mlbamId, e]))
  const byCode = new Map(teams.map((t) => [t.team, t]))
  const log: Transaction[] = []
  const value = (war: number | null | undefined) => (war ?? 0) * perWin
  const price = (war: number | null | undefined) => warPrice(war, perWin, minimum) ?? minimum

  // Players the user moved are theirs: the simulation never trades, releases or signs them.
  const locked = new Set(Object.values(manual).flatMap((ms) => ms.map((m) => m.id)))
  const moves = new Map(teams.map((t) => [t.team, [...(manual[t.team] ?? [])]]))
  const built = new Map<string, BuiltRoster>()
  const war = new Map<string, number>()
  const rebuild = (team: string) => {
    const b = buildRoster(byCode.get(team)!, moves.get(team)!, pool)
    built.set(team, b)
    war.set(team, teamWar(b))
  }
  // Adds a move only if it applies to the roster as it stands; returns whether it did.
  const apply = (team: string, m: Move): boolean => {
    const list = moves.get(team)!
    list.push(m)
    const b = buildRoster(byCode.get(team)!, list, pool)
    if (b.skipped.includes(m)) { list.pop(); return false }
    built.set(team, b)
    war.set(team, teamWar(b))
    return true
  }
  for (const t of teams) rebuild(t.team)

  // Rosters as they stand today, for budgets.
  const before = new Map(teams.map((t) => {
    const b = buildRoster(t, [], pool)
    return [t.team, { war: teamWar(b), payroll: b.payroll }]
  }))
  // Where each team starts the simulation: today's roster plus the user's moves, which is what
  // the Team Builder and the setup screen show. The standings' +/− measure from here.
  const start = new Map(teams.map((t) => [t.team, { war: war.get(t.team)!, payroll: built.get(t.team)!.payroll }]))
  // Budgets: last year's payroll scaled by the plan (all in spends past it, tanking well under),
  // but always enough for a little more than what's already owed for 2027, and never below what
  // the user's moves cost.
  const budget = new Map(teams.map((t) => {
    const st = ATTITUDES[attitudes[t.team] ?? 'buysell']
    return [t.team, Math.max(built.get(t.team)!.payroll, payroll2026(t) * st.budget, before.get(t.team)!.payroll + st.cushion)]
  }))
  const signed = new Map<string, number>()
  const settings = (team: string) => ATTITUDES[attitudes[team] ?? 'buysell']
  const room = (team: string) => budget.get(team)! - built.get(team)!.payroll
  const gainFrom = (team: string, e: { mlbamId: number; name: string; pos: string; war?: number | null; pa?: number; ip?: number }) =>
    depthChart([...depthPlayers(built.get(team)!), { id: e.mlbamId, name: e.name, pos: e.pos, war: e.war, pa: e.pa, ip: e.ip }]).total - war.get(team)!

  // Over the 40-man limit: let go of the least useful players on a minimum salary.
  const trim = (team: string, newcomer: number, phase: Phase) => {
    while (built.get(team)!.rosterCount > S.rosterMax) {
      const cut = built.get(team)!.slots
        .filter((s) => s.onRoster && s.player.mlbamId != null && !locked.has(s.player.mlbamId) && s.player.mlbamId !== newcomer && (s.salary ?? 0) <= minimum * 1.5)
        .sort((a, b) => (a.player.war ?? 0) - (b.player.war ?? 0))[0]
      if (!cut || !apply(team, { type: 'remove', id: cut.player.mlbamId! })) return
      log.push({ phase, kind: 'released', team, id: cut.player.mlbamId!, name: cut.player.name, war: cut.player.war ?? null, salary: cut.salary })
    }
  }

  // Free agents on the market: the pool's, plus whoever this offseason lets go.
  const market = new Map<number, { e: PoolPlayer; from: string | null }>()
  for (const e of pool) if (e.kind === 'fa' && !locked.has(e.mlbamId)) market.set(e.mlbamId, { e, from: e.from })
  const toMarket = (id: number, from: string) => {
    const e = poolById.get(id)
    if (e && !locked.has(id)) market.set(id, { e, from })
  }

  // 1. Options, opt-outs and non-tenders.
  for (const t of teams) {
    const team = t.team
    const keep = settings(team).keepFactor
    for (const s of built.get(team)!.slots) {
      const p = s.player
      const id = p.mlbamId
      if (id == null || locked.has(id)) continue
      const worth = value(p.war) * keep
      const entry = { phase: 'decisions' as const, team, id, name: p.name, war: p.war ?? null, salary: s.salary }
      if (p.status === 'option' && p.decidedBy !== 'player' && s.onRoster && (s.salary ?? 0) > worth) {
        if (apply(team, { type: 'decline', id })) { log.push({ ...entry, kind: 'declined' }); toMarket(id, team) }
      } else if (p.status === 'option' && p.decidedBy === 'club' && !s.onRoster && s.offReason === 'declined' && s.salary != null && s.salary < worth * 0.8) {
        if (apply(team, { type: 'exercise', id })) log.push({ ...entry, kind: 'exercised' })
      } else if (s.onRoster && p.playerOption && value(p.war) > (s.salary ?? 0) * 1.25 + 5e6) {
        // The player walks when the market would clearly pay him more.
        if (apply(team, { type: 'optOut', id })) { log.push({ ...entry, kind: 'opted-out' }); toMarket(id, team) }
      } else if (s.onRoster && p.status === 'arb' && (s.salary ?? 0) > Math.max(worth + S.nonTenderMargin, 2 * minimum)) {
        if (apply(team, { type: 'remove', id })) { log.push({ ...entry, kind: 'non-tendered' }); toMarket(id, team) }
      }
    }
  }

  // 2. Trades: sellers shop veterans, buyers with room and a need take them for prospects.
  const traded = new Set<number>()
  const bought = new Map<string, number>()
  const prospectsUsed = new Set<number>()
  const forSale: { team: string; id: number; war: number }[] = []
  for (const t of teams) {
    const st = settings(t.team)
    if (!st.sells) continue
    const candidates = built.get(t.team)!.slots
      .filter((s) => s.onRoster && s.player.mlbamId != null && !locked.has(s.player.mlbamId) && (s.player.war ?? 0) >= S.minTradeWar)
      .filter((s) => (st.sellWalkYearOnly ? s.player.walkYear : (s.player.age ?? 0) >= (st.sellAge ?? 99)))
      .sort((a, b) => (b.player.war ?? 0) - (a.player.war ?? 0))
      .slice(0, st.sells)
    for (const s of candidates) forSale.push({ team: t.team, id: s.player.mlbamId!, war: s.player.war ?? 0 })
  }
  forSale.sort((a, b) => b.war - a.war)
  for (const { team: seller, id } of forSale) {
    const e = poolById.get(id)
    const slot = built.get(seller)!.slots.find((s) => s.player.mlbamId === id && s.onRoster)
    if (!e || !slot || traded.has(id)) continue
    const salary = slot.salary ?? 0
    let best: { team: string; score: number } | null = null
    for (const t of teams) {
      const buyer = t.team
      const st = settings(buyer)
      if (buyer === seller || !st.buys || (bought.get(buyer) ?? 0) >= st.buys || room(buyer) < salary) continue
      const gain = gainFrom(buyer, e)
      if (gain < st.minGain) continue
      const score = gain * st.eagerness * luck()
      if (!best || score > best.score) best = { team: buyer, score }
    }
    if (!best) continue
    if (!apply(seller, { type: 'remove', id })) continue
    if (!apply(best.team, { type: 'add', id })) { moves.get(seller)!.pop(); rebuild(seller); continue }
    traded.add(id)
    bought.set(best.team, (bought.get(best.team) ?? 0) + 1)
    // The seller's return: the buyer's best projected minor leaguers, more for more surplus value.
    const surplus = value(e.war) - salary
    const count = surplus > 15e6 ? 2 : 1
    const prospects = pool
      .filter((p) => p.minors && p.from === best!.team && !prospectsUsed.has(p.mlbamId) && !locked.has(p.mlbamId))
      .sort((a, b) => (b.war ?? 0) - (a.war ?? 0))
      .slice(0, count)
    for (const p of prospects) prospectsUsed.add(p.mlbamId)
    log.push({
      phase: 'trades', kind: 'traded', team: best.team, other: seller, id, name: e.name, war: e.war ?? null, salary,
      prospects: prospects.map((p) => ({ id: p.mlbamId, name: p.name, war: p.war ?? 0 })),
    })
    trim(best.team, id, 'trades')
  }

  // 3. Free agency, best players first. Every team that would gain enough and can afford him
  // bids; the keenest (gain x eagerness x luck) wins, and a crowded market pushes the price up.
  // Whoever is still unsigned goes round again at a lower price (S.priceRounds), the way an
  // unsold free agent's price falls through the winter. In the last, cheapest round a team will
  // stretch past its budget (S.bargain.stretch) and its signing limit for a bargain.
  const freeAgents = [...market.values()]
    .filter(({ e }) => (e.war ?? 0) >= S.minFreeAgentWar)
    .sort((a, b) => (b.e.war ?? 0) - (a.e.war ?? 0))
  S.priceRounds.forEach((discount, round) => { for (const { e, from } of freeAgents) {
    if (!market.has(e.mlbamId)) continue
    const last = round === S.priceRounds.length - 1
    const stretch = last ? S.bargain.stretch : 0
    const ask = Math.max(minimum, Math.round((price(e.war) * discount) / 1e5) * 1e5)
    const bids: { team: string; gain: number; score: number }[] = []
    for (const t of teams) {
      const team = t.team
      const st = settings(team)
      if (team === from && log.some((x) => x.id === e.mlbamId && x.team === team)) continue // just let him go
      if ((signed.get(team) ?? 0) >= st.maxSignings + (last ? S.bargain.extraSignings : 0)) continue
      if (st.maxSalary && ask > st.maxSalary) continue
      if (st.maxAge && (e.age ?? 0) > st.maxAge) continue
      if (room(team) + stretch < ask) continue
      const gain = gainFrom(team, e)
      if (gain < st.minGain) continue
      bids.push({ team, gain, score: gain * st.eagerness * luck() })
    }
    if (!bids.length) continue
    bids.sort((a, b) => b.score - a.score)
    const winner = bids[0].team
    const premium = Math.min(S.maxPremium, S.bidderPremium * (bids.length - 1))
    const cap = Math.min(room(winner) + stretch, settings(winner).maxSalary ?? Infinity)
    const salary = Math.max(ask, Math.min(Math.round((ask * (1 + premium)) / 1e5) * 1e5, cap))
    // His old team re-signs him; anyone else adds him.
    const slot = built.get(winner)!.slots.find((s) => s.player.mlbamId === e.mlbamId)
    const move: Move = slot?.offReason === 'free-agent' ? { type: 'resign', id: e.mlbamId, salary }
      : slot?.offReason === 'declined' ? { type: 'exercise', id: e.mlbamId, salary }
        : { type: 'add', id: e.mlbamId, salary }
    if (!apply(winner, move)) continue
    market.delete(e.mlbamId)
    signed.set(winner, (signed.get(winner) ?? 0) + 1)
    log.push({ phase: 'free-agency', kind: 'signed', team: winner, other: from ?? undefined, id: e.mlbamId, name: e.name, war: e.war ?? null, salary, bidders: bids.length,
      ask,
      bids: bids.map((b) => ({ team: b.team, gain: Math.round(b.gain * 100) / 100, interest: Math.round((b.score / bids[0].score) * 100) / 100 })),
    })
    trim(winner, e.mlbamId, 'free-agency')
  } })

  // 4. Standings: both before and after scaled so the league plays .500.
  const scaleBefore = warScale([...start.values()].map((b) => b.war))
  const scaleAfter = warScale([...war.values()])
  const out: Record<string, TeamResult> = {}
  for (const t of teams) {
    const b = start.get(t.team)!
    out[t.team] = {
      team: t.team,
      attitude: attitudes[t.team] ?? 'buysell',
      moves: moves.get(t.team)!,
      warBefore: b.war,
      warAfter: war.get(t.team)!,
      winsBefore: projectedRecord(b.war, scaleBefore).wins,
      winsAfter: projectedRecord(war.get(t.team)!, scaleAfter).wins,
      payrollBefore: b.payroll,
      payrollAfter: built.get(t.team)!.payroll,
      budget: budget.get(t.team)!,
    }
  }
  return { log, teams: out }
}
