// The RosterResource cross-check: who each side has on the 40-man that the other doesn't.
import { describe, expect, test } from 'bun:test'
import { compareRoster, type RrPlayer, type RrTransaction } from '../../lib/team-builder/rosterresource'

const rr = (mlbamid: number | null, player: string, roster40 = 'Y', type = 'mlb-bn'): RrPlayer => ({ mlbamid, player, roster40, type })
const txn = (mlbamid: number, transDate: string, transDesc: string): RrTransaction => ({ mlbamid, playerName: '', transDate, transDesc })

describe('compareRoster', () => {
  const ours = [
    { mlbamId: 1, name: 'Zach Neto', status: 'prearb' },
    { mlbamId: 2, name: 'Kyren Paris', status: 'prearb' },
    { mlbamId: 3, name: 'Patrick Wisdom', status: 'arb' },
    { mlbamId: null, name: 'Unmatched Guy', status: 'prearb' },
  ]
  const all = [...ours, { mlbamId: 5, name: 'Robert Stephenson', status: 'fa' }]
  const roster = [rr(1, 'Zach Neto'), rr(2, 'Kyren Paris', 'N', 'off-ss'), rr(4, 'Pierson Ohl'), rr(5, 'Robert Stephenson')]
  const moves = [txn(2, '2026-10-20T00:00:00', 'Signed'), txn(2, '2026-11-03T00:00:00', 'Outrighted to Triple-A'), txn(4, '2026-11-02T00:00:00', 'Claimed off waivers')]
  const c = compareRoster(ours, all, roster, moves)

  test('players RosterResource has dropped from the 40-man, with the latest move', () =>
    expect(c.leftRoster).toEqual([
      { mlbamId: 2, name: 'Kyren Paris', where: 'in the minors, off the 40-man', move: '2026-11-03: Outrighted to Triple-A' },
      { mlbamId: 3, name: 'Patrick Wisdom', where: 'not with the team' },
    ]))
  test("players on RosterResource's 40-man that we don't carry", () =>
    expect(c.joinedRoster).toEqual([
      { mlbamId: 4, name: 'Pierson Ohl', where: "not on Cot's sheet", move: '2026-11-02: Claimed off waivers' },
      { mlbamId: 5, name: 'Robert Stephenson', where: "a free agent on Cot's" },
    ]))
  test('players without an id are left to the id report', () => expect(JSON.stringify(c)).not.toContain('Unmatched'))
})
