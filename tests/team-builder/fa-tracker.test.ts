// Free agents from RosterResource's tracker that no other list carries (NPB postings).
import { describe, expect, test } from 'bun:test'
import { fgOnlyId, isFgOnlyId } from '../../lib/team-builder/pool'
import { decodeMoves, encodeMoves } from '../../lib/team-builder/share'
import { trackerFreeAgents, type TrackerRow } from '../../scripts/team-builder/fa-tracker'

const row = (o: Partial<TrackerRow>): TrackerRow => ({
  playerId: '1', playerName: 'X', position: '3B', Throws: 'R', age: 28, team_prev: 'NYM', free_agent_status: 'IS_FA', med_years: null, med_aav: null, ...o,
})

describe('stand-in ids', () => {
  test("built from FanGraphs' id, far above any MLBAM id", () => {
    expect(fgOnlyId('sa3063811')).toBe(903_063_811)
    expect(isFgOnlyId(903_063_811)).toBe(true)
    expect(isFgOnlyId(660_271)).toBe(false)
  })
  test('only for FanGraphs minor-league ids', () => expect(fgOnlyId('19755')).toBeNull())
  test('survive a share link', () => expect(decodeMoves(encodeMoves([{ type: 'add', id: 903_063_811, salary: 20e6 }]))).toEqual([{ type: 'add', id: 903_063_811, salary: 20e6 }]))
})

describe('trackerFreeAgents', () => {
  const rows = [
    row({ playerId: 'sa3063811', playerName: 'Teruaki Sato', team_prev: 'NPB', med_years: 5, med_aav: 20e6 }),
    row({ playerId: 'sa3063835', playerName: 'Hiromi Itoh', team_prev: 'NPB', position: 'SP' }),
    row({ playerId: '19755', playerName: 'Already Listed' }),
    row({ playerId: '20000', playerName: 'Missed By MLBTR', position: 'RP', Throws: 'L' }),
    row({ playerId: '30000', playerName: 'Unmatched MLB Guy' }),
    row({ playerId: 'sa1', playerName: 'Signed', free_agent_status: 'SIGNED' }),
  ]
  const out = trackerFreeAgents(rows, new Map([['19755', 111], ['20000', 222]]), new Set([111]))

  test('a posted player, under his stand-in id, with where he came from and the crowd estimate', () =>
    expect(out[0]).toEqual({ name: 'Teruaki Sato', age: 28, positions: ['3b'], mlbamId: 903_063_811, note: 'From Japan (NPB). FanGraphs crowd: 5 y/$20M a year' }))
  test('a starter from his throwing hand', () => expect(out[1]).toMatchObject({ positions: ['rhp-s'], note: 'From Japan (NPB)' }))
  test('an MLB free agent MLBTR missed, by his MLBAM id', () => expect(out[2]).toEqual({ name: 'Missed By MLBTR', age: 28, positions: ['lhp'], mlbamId: 222 }))
  test('skips players already in the pool, unmatched MLB ids and anyone not a free agent', () => expect(out).toHaveLength(3))
})
