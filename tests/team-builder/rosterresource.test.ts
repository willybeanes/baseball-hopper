// Applying RosterResource's 40-man moves on top of Cot's.
import { describe, expect, test } from 'bun:test'
import type { Player, TeamFile } from '../../lib/team-builder/roster'
import { applyRosterMoves, type RrPlayer, type RrTeam } from '../../scripts/team-builder/rosterresource'

const player = (mlbamId: number, name: string, o: Partial<Player> = {}): Player => ({
  mlbamId, name, sheetName: name, pos: 'rhp', age: 28, mls: 2, contract: '', status: 'prearb', salary: 780_000, taxValue: 780_000, salaryPrevYear: null, ...o,
})
const team = (code: string, players: Player[]): TeamFile =>
  ({ team: code, players, deadMoney: [], benefits: 0, bonusPool: 0 }) as unknown as TeamFile
const rr = (mlbamid: number, player: string, o: Partial<RrPlayer> = {}): RrPlayer => ({ mlbamid, player, roster40: 'Y', type: 'mlb-bp', ...o })
// Pad each RosterResource roster with the players both sides agree on.
const filler = (from: number) => Array.from({ length: 30 }, (_, i) => player(from + i, `Filler ${from + i}`))
const rrFiller = (from: number) => Array.from({ length: 30 }, (_, i) => rr(from + i, `Filler ${from + i}`))
const ctx = { targetYear: 2027, today: new Date('2026-11-05'), minimum: 780_000, roughArb: { '1': 1_800_000, '2': 3e6 }, arb: new Map([[7, 1_500_000]]), freeAgents: new Set([8]) }

function run() {
  const nym = team('NYM', [...filler(1000),
    player(1, 'Kyren Paris'), player(2, 'Veteran Signed', { status: 'signed', salary: 5e6, taxValue: 6e6 }), player(3, 'Released Guy'),
    player(4, 'Clase', { status: 'signed', salary: 6e6, taxValue: 6e6 }),
    player(9, 'Mutual Guy', { status: 'option', defaultExercised: false, salary: 10e6, taxValue: 10e6 })])
  const col = team('COL', [...filler(2000), player(5, 'Pierson Ohl', { status: 'arb', salary: 1e6, taxValue: 1e6 })])
  const data = new Map<string, RrTeam>([
    ['NYM', { roster: [...rrFiller(1000), rr(1, 'Kyren Paris', { roster40: 'N', type: 'off-ss' }), rr(2, 'Veteran Signed', { roster40: 'N', type: 'off-sp' }),
      rr(4, 'Clase', { roster40: 'N', type: 'il-rl' }), rr(5, 'Pierson Ohl'), rr(5, 'Pierson Ohl'), rr(6, 'New Guy', { position: 'SP', throws: 'L', age: '24.6' }),
      rr(7, 'Arb Guy', { position: 'SS' }), rr(8, 'Signed FA'), rr(9, 'Mutual Guy'),
      rr(10, 'Veteran Add (mil)', { position: 'C', servicetime: '3.050' })],
    transactions: [{ mlbamid: 1, playerName: '', transDate: '2026-11-02T00:00:00', transDesc: 'Outrighted to minors' },
      { mlbamid: 3, playerName: '', transDate: '2026-11-03T00:00:00', transDesc: 'Released' }] }],
    ['COL', { roster: rrFiller(2000), transactions: [{ mlbamid: 5, playerName: '', transDate: '2026-11-02T00:00:00', transDesc: 'Lost off waivers to Mets' }] }],
  ])
  const out = applyRosterMoves([nym, col], data, ctx)
  const find = (t: TeamFile, id: number) => t.players.find((p) => p.mlbamId === id)
  return { nym, col, out, find }
}

describe('applyRosterMoves', () => {
  const { nym, col, out, find } = run()
  test('an outrighted player leaves the 40-man', () => expect(find(nym, 1)).toBeUndefined())
  test('so does one outrighted off the listing entirely: not a free agent', () => {
    const t = team('SEA', [...filler(3000), player(11, 'Young Outright')])
    applyRosterMoves([t], new Map([['SEA', { roster: rrFiller(3000), transactions: [{ mlbamid: 11, playerName: '', transDate: '2026-11-02T00:00:00', transDesc: 'Outrighted to minors' }] }]]), ctx)
    expect(find(t, 11)).toBeUndefined()
  })
  test("an outrighted guaranteed contract is still owed", () => {
    expect(find(nym, 2)).toBeUndefined()
    expect(nym.deadMoney).toEqual([{ name: 'Veteran Signed', salary: 5e6, taxValue: 6e6, note: 'off the 40-man (RosterResource)' }])
  })
  test('a released player becomes a free agent', () => expect(find(nym, 3)).toMatchObject({ status: 'fa', salary: null, salarySource: 'none' }))
  test('the restricted list is only reported', () => {
    expect(find(nym, 4)).toMatchObject({ status: 'signed', salary: 6e6 })
    expect(out.reported.some((c) => c.mlbamId === 4)).toBe(true)
  })
  test('a waiver claim moves the player and his salary, once', () => {
    expect(find(col, 5)).toBeUndefined()
    expect(nym.players.filter((p) => p.mlbamId === 5)).toHaveLength(1)
    expect(find(nym, 5)).toMatchObject({ status: 'arb', salary: 1e6 })
    expect(out.applied.find((c) => c.mlbamId === 5)?.move).toBe('2026-11-02: Lost off waivers to Mets')
  })
  test('a new 40-man player comes in at the minimum, aged for next season', () =>
    expect(find(nym, 6)).toMatchObject({ name: 'New Guy', pos: 'lhp-s', age: 25, status: 'prearb', salary: 780_000, salarySource: 'minimum' }))
  test('a new player with 3+ years gets the rough arbitration estimate, without RosterResource\'s tag', () =>
    expect(find(nym, 10)).toMatchObject({ name: 'Veteran Add', status: 'arb', arbYear: 1, salary: 1_800_000, salarySource: 'rough-arb' }))
  test('or at his MLBTR arbitration estimate', () => expect(find(nym, 7)).toMatchObject({ pos: 'ss', status: 'arb', salary: 1_500_000, salarySource: 'mlbtr-arb' }))
  test('a free-agent signing with unknown terms is only reported', () => {
    expect(find(nym, 8)).toBeUndefined()
    expect(out.reported.some((c) => c.mlbamId === 8)).toBe(true)
  })
  test('a declined-by-default option on the 40-man was exercised', () => expect(find(nym, 9)).toMatchObject({ defaultExercised: true }))
  test('running it again changes nothing', () => {
    const before = JSON.stringify([nym, col])
    const again = applyRosterMoves([nym, col], new Map([['NYM', { roster: [...rrFiller(1000), rr(1, 'x', { roster40: 'N', type: 'off-ss' }), rr(4, 'Clase', { roster40: 'N', type: 'il-rl' }), rr(5, 'Pierson Ohl'), rr(6, 'New Guy'), rr(7, 'Arb Guy'), rr(9, 'Mutual Guy'), rr(10, 'Veteran Add')], transactions: [] }], ['COL', { roster: rrFiller(2000), transactions: [] }]]), ctx)
    expect(JSON.stringify([nym, col])).toBe(before)
    expect(again.applied).toEqual([])
  })
  test('a team with too many differences is left alone', () => {
    const t = team('SEA', filler(3000))
    const r = applyRosterMoves([t], new Map([['SEA', { roster: rrFiller(3000).map((p, i) => (i < 11 ? { ...p, roster40: 'N', type: 'off-rp' } : p)), transactions: [] }]]), ctx)
    expect(t.players).toHaveLength(30)
    expect(r.applied).toEqual([])
  })
})
