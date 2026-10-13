import { describe, expect, test } from 'bun:test'
import type { Move } from '../../lib/team-builder/moves'
import { decodeDate, decodeMoves, encodeDate, encodeMoves } from '../../lib/team-builder/share'

const MOVES: Move[] = [
  { type: 'add', id: 669373, salary: 66_500_000 }, // signed a free agent at a typed salary
  { type: 'add', id: 694973 }, // traded for a player at his own salary
  { type: 'remove', id: 665742 },
  { type: 'decline', id: 592450 },
  { type: 'exercise', id: 543243 },
  { type: 'exercise', id: 596142, salary: 4_250_000 },
  { type: 'optOut', id: 666182 },
  { type: 'resign', id: 663158, salary: 9_000_000 },
  { type: 'salary', id: 680776, salary: 13_000_000 },
  { type: 'promote', id: 805999 },
]

describe('share links', () => {
  test('every kind of move survives the round trip', () => {
    expect(decodeMoves(encodeMoves(MOVES))).toEqual(MOVES)
  })
  test('compact and safe to put in a URL', () => {
    const text = encodeMoves(MOVES)
    expect(text).toMatch(/^[0-9a-z.-]+$/)
    expect(text.length).toBeLessThan(MOVES.length * 12)
  })
  test('twenty-five moves fit comfortably', () => {
    const many = Array.from({ length: 25 }, (_, i): Move => ({ type: 'add', id: 660000 + i, salary: 12_340_000 }))
    expect(encodeMoves(many).length).toBeLessThan(300)
  })
  test('salaries keep $10K precision', () => {
    expect(decodeMoves(encodeMoves([{ type: 'salary', id: 5, salary: 780_000 }]))).toEqual([{ type: 'salary', id: 5, salary: 780_000 }])
  })
  test('a mangled link drops the bad parts and keeps the rest', () => {
    expect(decodeMoves('r6l2z.???.zz9.s77.a1-!!.p8')).toEqual([{ type: 'remove', id: 307259 }, { type: 'promote', id: 8 }])
    expect(decodeMoves('')).toEqual([])
    expect(decodeMoves(null)).toEqual([])
  })
  test('a salary on a move that takes none is rejected, as is an absurd one', () => {
    expect(decodeMoves('r5-10')).toEqual([])
    expect(decodeMoves('a5-zzzzzz')).toEqual([])
  })
  test('dates', () => {
    expect(encodeDate(new Date(2026, 9, 12))).toBe('20261012')
    expect(decodeDate('20261012')?.getMonth()).toBe(9)
    expect(decodeDate('nope')).toBeNull()
  })
})
