import { describe, expect, test } from 'bun:test'
import { withFieldedPositions } from '../../lib/team-builder/fielding'
import { listedSpotsFor } from '../../lib/team-builder/field'

const games = (o: Record<string, number>) => new Map(Object.entries(o))

describe('withFieldedPositions', () => {
  test("adds positions played enough, most games first, after Cot's primary", () => {
    // Nick Loftin, 2025-26: Cot's has him at 2b only.
    const pos = withFieldedPositions('2b', games({ '3B': 89, '2B': 52, LF: 41, RF: 11, '1B': 7, SS: 3 }), 10)
    expect(pos).toBe('2b-3b-lf-rf')
    expect(listedSpotsFor(pos)).toEqual(['2B', '3B', 'LF', 'RF'])
  })
  test('skips positions the text already covers', () => {
    expect(withFieldedPositions('1b-of', games({ LF: 30, '1B': 100, '3B': 12 }), 10)).toBe('1b-of-3b')
    expect(withFieldedPositions('ss', games({ SS: 140 }), 10)).toBe('ss')
  })
  test('leaves pitchers and unknown players alone', () => {
    expect(withFieldedPositions('rhp-s', games({ LF: 20 }), 10)).toBe('rhp-s')
    expect(withFieldedPositions('3b', undefined, 10)).toBe('3b')
  })
  test('running it twice changes nothing', () => {
    const g = games({ '3B': 89, '2B': 52, LF: 41 })
    const once = withFieldedPositions('2b', g, 10)
    expect(withFieldedPositions(once, g, 10)).toBe(once)
  })
})
