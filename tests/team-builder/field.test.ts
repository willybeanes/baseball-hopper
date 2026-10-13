import { describe, expect, test } from 'bun:test'
import { FIELD_SPOTS, spotsFor, warBySpot } from '../../lib/team-builder/field'

describe('spotsFor', () => {
  test('pitchers: starters, closers and relievers', () => {
    expect(spotsFor('lhp-s')).toEqual(['SP'])
    expect(spotsFor('sp')).toEqual(['SP'])
    expect(spotsFor('rhp-c')).toEqual(['RP']) // a closer, not a catcher
    expect(spotsFor('rhp')).toEqual(['RP'])
    expect(spotsFor('rp')).toEqual(['RP'])
  })
  test('the first position listed is the primary one', () => {
    expect(spotsFor('1b-3b')).toEqual(['1B'])
    expect(spotsFor('cf-inf')).toEqual(['CF'])
    expect(spotsFor('dh-lf')).toEqual(['DH'])
    expect(spotsFor('C')).toEqual(['C'])
  })
  test('a plain outfielder or infielder is shared across those spots', () => {
    expect(spotsFor('of')).toEqual(['LF', 'CF', 'RF'])
    expect(spotsFor('of-2b')).toEqual(['LF', 'CF', 'RF'])
    expect(spotsFor('inf')).toEqual(['1B', '2B', '3B', 'SS'])
    expect(spotsFor('if')).toEqual(['1B', '2B', '3B', 'SS'])
  })
})

describe('warBySpot', () => {
  const roster = [
    { name: 'Shortstop', pos: 'ss', war: 4.2 },
    { name: 'Utility', pos: 'inf', war: 0.8 },
    { name: 'Fourth Outfielder', pos: 'of', war: 1.5 },
    { name: 'Center Fielder', pos: 'cf', war: 3 },
    { name: 'Ace', pos: 'lhp-s', war: 5.9 },
    { name: 'Closer', pos: 'rhp-c', war: 1.1 },
    { name: 'No Projection', pos: 'c', war: null },
  ]
  const by = warBySpot(roster)

  test('every bit of WAR lands somewhere, exactly once', () => {
    const total = FIELD_SPOTS.reduce((n, s) => n + by[s].war, 0)
    expect(total).toBeCloseTo(4.2 + 0.8 + 1.5 + 3 + 5.9 + 1.1, 6)
  })
  test('shared players are split evenly', () => {
    expect(by.SS.war).toBeCloseTo(4.2 + 0.2, 6)
    expect(by.CF.war).toBeCloseTo(3 + 0.5, 6)
    expect(by.LF.war).toBeCloseTo(0.5, 6)
  })
  test('pitchers and unprojected players', () => {
    expect(by.SP.war).toBe(5.9)
    expect(by.RP.war).toBe(1.1)
    expect(by.C.war).toBe(0)
    expect(by.C.players.map((p) => p.name)).toEqual(['No Projection'])
  })
  test('players listed best first', () => expect(by.SS.players.map((p) => p.name)).toEqual(['Shortstop', 'Utility']))
})
