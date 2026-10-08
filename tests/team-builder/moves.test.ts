import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import assumptions from '../../lib/team-builder/assumptions.json'
import { parseTeamSheet } from '../../lib/team-builder/cots'
import { applyEstimates, type OptionFact } from '../../lib/team-builder/estimates'
import { addMove, buildRoster, undoPlayer, type Move } from '../../lib/team-builder/moves'
import { defaultRoster, type TeamFile } from '../../lib/team-builder/roster'

// Boston, 2026-10-03: Whitlock club option ($8.25M, $1M buyout), Gray mutual ($30M, $10M buyout),
// Sandoval a free agent, Duran arbitration, Crochet signed.
const IDS: Record<string, number> = { 'Garrett Whitlock': 1, 'Sonny Gray': 2, 'Patrick Sandoval': 3, 'Jarren Duran': 4, 'Garrett Crochet': 5, 'Masataka Yoshida': 6 }
const OPTIONS: OptionFact[] = [
  { mlbamId: 1, decidedBy: 'club', type: 'club', salary: 8.25e6, buyout: 1e6 },
  { mlbamId: 2, decidedBy: 'both', type: 'mutual', salary: 30e6, buyout: 10e6 },
  { mlbamId: 6, decidedBy: 'player', type: 'opt-out', salary: null, buyout: 2e6 },
]
const s = parseTeamSheet('BOS', readFileSync(join(import.meta.dir, 'fixtures', 'BOS.csv'), 'utf8'), 2026, 2027)
for (const p of s.players) p.mlbamId = IDS[p.name] ?? 1000 + s.players.indexOf(p)
applyEstimates(s, OPTIONS, [{ mlbamId: 4, salary: 11.1e6 }], assumptions)
const team = s as TeamFile
const base = buildRoster(team, [])
const slot = (r: ReturnType<typeof buildRoster>, id: number) => r.slots.find((x) => x.player.mlbamId === id)!

describe('no moves', () => {
  test('matches the default roster', () => {
    const d = defaultRoster(team)
    expect(base.payroll).toBe(d.payroll)
    expect(base.taxPayroll).toBe(d.taxPayroll)
    expect(base.rosterCount).toBe(d.onRoster.length)
  })
})

describe('moves', () => {
  test('remove: salary and tax value leave', () => {
    const r = buildRoster(team, [{ type: 'remove', id: 5 }])
    expect(base.payroll - r.payroll).toBe(slot(base, 5).salary!)
    expect(base.taxPayroll - r.taxPayroll).toBe(slot(base, 5).taxValue!)
    expect(r.rosterCount).toBe(base.rosterCount - 1)
  })
  test('decline a club option: salary leaves, buyout stays in payroll only', () => {
    const r = buildRoster(team, [{ type: 'decline', id: 1 }])
    expect(base.payroll - r.payroll).toBe(8.25e6 - 1e6)
    expect(base.taxPayroll - r.taxPayroll).toBe(8.25e6)
  })
  test('exercise a declined mutual option: buyout replaced by salary', () => {
    const r = buildRoster(team, [{ type: 'exercise', id: 2 }])
    expect(r.payroll - base.payroll).toBe(30e6 - 10e6)
    expect(r.taxPayroll - base.taxPayroll).toBe(30e6)
  })
  test('player opts out: salary leaves, his buyout is owed', () => {
    const r = buildRoster(team, [{ type: 'optOut', id: 6 }])
    expect(base.payroll - r.payroll).toBe(slot(base, 6).salary! - 2e6)
  })
  test('re-sign a free agent at a typed salary', () => {
    const r = buildRoster(team, [{ type: 'resign', id: 3, salary: 9e6 }])
    expect(r.payroll - base.payroll).toBe(9e6)
    expect(slot(r, 3)).toMatchObject({ onRoster: true, userSalary: true })
  })
  test('edit an estimated salary, but not a signed contract', () => {
    const r = buildRoster(team, [{ type: 'salary', id: 4, salary: 13e6 }, { type: 'salary', id: 5, salary: 1 }])
    expect(r.payroll - base.payroll).toBe(13e6 - 11.1e6)
    expect(slot(r, 5).salary).toBe(slot(base, 5).salary)
  })
  test('moves that no longer apply are skipped', () => {
    const r = buildRoster(team, [{ type: 'resign', id: 999999, salary: 5e6 }, { type: 'optOut', id: 5 }])
    expect(r.payroll).toBe(base.payroll)
  })
})

describe('the change list', () => {
  test('exercise then decline cancels out', () => {
    let m: Move[] = addMove([], { type: 'exercise', id: 2 })
    m = addMove(m, { type: 'decline', id: 2 })
    expect(m).toEqual([])
  })
  test('one salary edit per player, latest wins', () => {
    let m: Move[] = addMove([], { type: 'salary', id: 4, salary: 10e6 })
    m = addMove(m, { type: 'salary', id: 4, salary: 12e6 })
    expect(m).toEqual([{ type: 'salary', id: 4, salary: 12e6 }])
  })
  test('undo drops everything about a player', () => {
    const m: Move[] = [{ type: 'resign', id: 3, salary: 9e6 }, { type: 'salary', id: 3, salary: 10e6 }, { type: 'remove', id: 5 }]
    expect(undoPlayer(m, 3)).toEqual([{ type: 'remove', id: 5 }])
  })
})

describe('adding players from the pool', () => {
  const pool = [
    { mlbamId: 900, name: 'Free Agent', pos: 'ss', age: 30, from: 'NYY', kind: 'fa' as const, status: 'fa' as const, salary: null, taxValue: null, salaryPrevYear: 5e6, contract: '' },
    { mlbamId: 901, name: 'Trade Target', pos: 'rhp', age: 28, from: 'NYM', kind: 'roster' as const, status: 'signed' as const, salary: 20e6, taxValue: 18e6, salarySource: 'cots' as const, salaryPrevYear: 20e6, contract: '5 y/$90M' },
    { mlbamId: 5, name: 'Already Here', pos: 'lhp', age: 28, from: 'BOS', kind: 'roster' as const, status: 'signed' as const, salary: 1, taxValue: 1, salaryPrevYear: 1, contract: '' },
  ]

  test('sign a free agent at a typed salary', () => {
    const r = buildRoster(team, [{ type: 'add', id: 900, salary: 12e6 }], pool)
    expect(r.payroll - base.payroll).toBe(12e6)
    expect(r.taxPayroll - base.taxPayroll).toBe(12e6)
    expect(slot(r, 900)).toMatchObject({ onRoster: true, added: { kind: 'fa', from: 'NYY' } })
  })
  test('a free agent with no salary is not added', () => {
    expect(buildRoster(team, [{ type: 'add', id: 900 }], pool).rosterCount).toBe(base.rosterCount)
  })
  test('trade for a player: brings his salary and tax value', () => {
    const r = buildRoster(team, [{ type: 'add', id: 901 }], pool)
    expect(r.payroll - base.payroll).toBe(20e6)
    expect(r.taxPayroll - base.taxPayroll).toBe(18e6)
    expect(slot(r, 901).added).toEqual({ kind: 'trade', from: 'NYM' })
  })
  test("re-signing the team's own free agent from the pool", () => {
    const own = { ...pool[0], mlbamId: 902, from: 'BOS' }
    const r = buildRoster(team, [{ type: 'add', id: 902, salary: 4e6 }], [...pool, own])
    expect(slot(r, 902).added).toEqual({ kind: 'resign', from: 'BOS' })
  })
  test("can't trade for your own player", () => {
    const own = { ...pool[1], mlbamId: 903, from: 'BOS' }
    expect(buildRoster(team, [{ type: 'add', id: 903 }], [...pool, own]).payroll).toBe(base.payroll)
  })
  test("can't add someone already on the team", () => {
    expect(buildRoster(team, [{ type: 'add', id: 5 }], pool).payroll).toBe(base.payroll)
  })
  test('removing an added player cancels the add', () => {
    let m: Move[] = addMove([], { type: 'add', id: 901 })
    m = addMove(m, { type: 'remove', id: 901 })
    expect(m).toEqual([])
  })
})

describe('minor leaguers', () => {
  const withMinors = { ...team, minors: [{ mlbamId: 950, name: 'Top Prospect', pos: 'ss', age: 21, war: 1.5, pa: 500, salary: 780_000 }] }
  const start = buildRoster(withMinors, [])
  test('start off the 40-man and outside both totals', () => {
    expect(slot(start, 950)).toMatchObject({ onRoster: false, offReason: 'minors' })
    expect(start.payroll).toBe(base.payroll)
  })
  test('promoting one adds him at the minimum and uses a 40-man spot', () => {
    const r = buildRoster(withMinors, [{ type: 'promote', id: 950 }])
    expect(r.payroll - start.payroll).toBe(780_000)
    expect(r.rosterCount).toBe(start.rosterCount + 1)
    expect(slot(r, 950)).toMatchObject({ onRoster: true, promoted: true })
  })
  test('removing a promoted player cancels the promotion', () => {
    expect(addMove([{ type: 'promote', id: 950 }], { type: 'remove', id: 950 })).toEqual([])
  })
})

