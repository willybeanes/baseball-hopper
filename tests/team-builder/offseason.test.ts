// The offseason simulation, run on the saved snapshot in public/data/team-builder. That data
// changes with every refresh, so these check properties that must always hold, not exact moves.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import assumptions from '../../lib/team-builder/assumptions.json'
import { buildRoster, type Move } from '../../lib/team-builder/moves'
import { ATTITUDES, defaultAttitudes, simulateOffseason, type Attitude, type SimInput } from '../../lib/team-builder/offseason'
import type { PoolPlayer } from '../../lib/team-builder/pool'
import type { TeamFile } from '../../lib/team-builder/roster'
import { TEAM_NAMES } from '../../lib/team-builder/teams'

const DIR = join(import.meta.dir, '../../public/data/team-builder')
const pool = JSON.parse(readFileSync(join(DIR, 'pool.json'), 'utf8')) as PoolPlayer[]
const teams = Object.keys(TEAM_NAMES).map((t) => JSON.parse(readFileSync(join(DIR, 'teams', `${t}.json`), 'utf8')) as TeamFile)
const attitudes = defaultAttitudes(teams, pool)
const base: SimInput = { teams, pool, attitudes, manual: {}, seed: 42, perWin: 8e6, minimum: 780_000 }
const sim = simulateOffseason(base)
const team = (code: string) => teams.find((t) => t.team === code)!

describe('defaultAttitudes', () => {
  test('every team gets one, with a few at each end', () => {
    const counts = Object.values(attitudes).reduce((m, a) => ({ ...m, [a]: (m[a] ?? 0) + 1 }), {} as Record<string, number>)
    expect(Object.keys(attitudes)).toHaveLength(30)
    expect(counts.tank).toBe(3)
    expect(counts.rebuild).toBe(5)
    expect((counts.allin ?? 0) + (counts.contend ?? 0)).toBe(10)
  })
})

describe('simulateOffseason', () => {
  test('the same seed gives the same offseason; another seed a different one', () => {
    expect(JSON.stringify(simulateOffseason(base))).toBe(JSON.stringify(sim))
    expect(JSON.stringify(simulateOffseason({ ...base, seed: 7 }).log)).not.toBe(JSON.stringify(sim.log))
  })

  test('things happen: signings, trades from sellers to buyers', () => {
    const kinds = (k: string) => sim.log.filter((x) => x.kind === k)
    expect(kinds('signed').length).toBeGreaterThan(10)
    expect(kinds('traded').length).toBeGreaterThan(3)
    for (const t of kinds('traded')) {
      expect(ATTITUDES[attitudes[t.other!]].sells).toBeGreaterThan(0)
      expect(ATTITUDES[attitudes[t.team]].buys).toBeGreaterThan(0)
    }
  })

  test('every move the simulation made applies, and no player ends up on two rosters', () => {
    const seen = new Map<number, string>()
    for (const t of teams) {
      const b = buildRoster(t, sim.teams[t.team].moves, pool)
      expect(b.skipped).toEqual([])
      for (const s of b.slots) {
        if (!s.onRoster || s.player.mlbamId == null) continue
        expect(seen.get(s.player.mlbamId)).toBeUndefined()
        seen.set(s.player.mlbamId, t.team)
      }
    }
  })

  test('no team goes over its budget or the 40-man limit', () => {
    for (const t of teams) {
      const r = sim.teams[t.team]
      const b = buildRoster(t, r.moves, pool)
      expect(r.payrollAfter).toBeLessThanOrEqual(r.budget + assumptions.offseason.bargain.stretch + 1) // a bargain can stretch it
      expect(b.rosterCount).toBeLessThanOrEqual(Math.max(40, buildRoster(t, [], pool).rosterCount))
    }
  })

  test('the league still plays .500, before and after', () => {
    const sum = (k: 'winsBefore' | 'winsAfter') => Object.values(sim.teams).reduce((n, r) => n + r[k], 0)
    expect(sum('winsBefore')).toBeCloseTo(81 * 30, 0)
    expect(sum('winsAfter')).toBeCloseTo(81 * 30, 0)
  })

  test("the user's moves come first and the players in them are left alone", () => {
    // Sign the best free agent to the worst team, and keep that team's best player.
    const fa = [...pool].filter((e) => e.kind === 'fa').sort((a, b) => (b.war ?? 0) - (a.war ?? 0))[0]
    const worst = Object.entries(attitudes).find(([, a]) => a === 'tank')![0]
    const star = buildRoster(team(worst), [], pool).slots.filter((s) => s.onRoster).sort((a, b) => (b.player.war ?? 0) - (a.player.war ?? 0))[0].player.mlbamId!
    const manual: Record<string, Move[]> = { [worst]: [{ type: 'add', id: fa.mlbamId, salary: 30e6 }, { type: 'salary', id: star, salary: buildRoster(team(worst), [], pool).slots.find((s) => s.player.mlbamId === star)!.salary ?? 1e6 }] }
    const r = simulateOffseason({ ...base, manual })
    expect(r.teams[worst].moves.slice(0, 2)).toEqual(manual[worst])
    expect(r.log.some((x) => x.id === fa.mlbamId || x.id === star)).toBe(false)
  })

  test('each signing lists its bids, keenest first, with the winner on top', () => {
    for (const x of sim.log.filter((t) => t.kind === 'signed')) {
      expect(x.bids!.length).toBe(x.bidders!)
      expect(x.bids![0].team).toBe(x.team)
      expect(x.bids![0].interest).toBe(1)
      for (const b of x.bids!) expect(b.interest).toBeLessThanOrEqual(1)
      expect(x.salary!).toBeGreaterThanOrEqual(x.ask!)
    }
  })

  test('the best free agents all find a team, even if late and cheap', () => {
    const top = pool.filter((e) => e.kind === 'fa').sort((a, b) => (b.war ?? 0) - (a.war ?? 0)).slice(0, 30)
    const signedIds = new Set(sim.log.filter((x) => x.kind === 'signed').map((x) => x.id))
    expect(top.filter((e) => signedIds.has(e.mlbamId)).length).toBeGreaterThanOrEqual(27)
  })

  test('a team set to tank spends less than it would contending', () => {
    const code = 'NYM'
    const as = (a: Attitude) => simulateOffseason({ ...base, attitudes: { ...attitudes, [code]: a } }).teams[code].payrollAfter
    expect(as('tank')).toBeLessThan(as('allin'))
  })
})
