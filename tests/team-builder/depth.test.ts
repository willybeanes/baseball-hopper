import { describe, expect, test } from 'bun:test'
import { depthChart } from '../../lib/team-builder/depth'

const hitter = (id: number, pos: string, war: number, pa = 600) => ({ id, name: `H${id}`, pos, war, pa })
const pitcher = (id: number, pos: string, war: number, ip = 150) => ({ id, name: `P${id}`, pos, war, ip })

describe('depth chart team WAR', () => {
  test('one player per spot: counted in full', () => {
    const d = depthChart([hitter(1, 'ss', 4, 600), pitcher(2, 'rhp-s', 3, 180)])
    expect(d.total).toBeCloseTo(7, 6)
    expect(d.credit.get(1)).toEqual({ war: 4, share: 1 })
  })
  test("three full-time shortstops don't all count: the best fills SS, the next spill over", () => {
    const d = depthChart([hitter(1, 'ss', 4, 650), hitter(2, 'ss', 3, 650), hitter(3, 'ss', 2, 650)])
    // All three still fit in other empty spots, so all count; that's the "leftovers fill gaps" pass.
    expect(d.total).toBeCloseTo(9, 6)
    expect(d.bySpot.SS.war).toBeCloseTo(4 + 3 * (50 / 650), 6) // 700 PA of room: the best takes 650, the next 50
  })
  test('more playing time than a season has: the excess is cut', () => {
    // 12 full-time first basemen, 700 PA each = 8,400 PA against 6,200 of room.
    const d = depthChart(Array.from({ length: 12 }, (_, i) => hitter(i, '1b', 2, 700)))
    expect(d.total).toBeCloseTo(2 * (6200 / 700), 6)
  })
  test('the best players by rate get the time', () => {
    const d = depthChart([pitcher(1, 'rhp', 2, 60), pitcher(2, 'rhp', 1, 600)]) // RP room 550, then SP room 900
    expect(d.credit.get(1)!.share).toBe(1)
  })
  test('below-replacement players are left out', () => {
    const d = depthChart([hitter(1, 'c', -0.8, 400), hitter(2, 'c', 1, 300)])
    expect(d.total).toBeCloseTo(1, 6)
    expect(d.credit.get(1)).toEqual({ war: 0, share: 0 })
  })
  test('no projected time, no credit', () => {
    expect(depthChart([{ id: 1, name: 'X', pos: 'ss', war: 2 }]).total).toBe(0)
  })
  test('a star signing displaces the weakest regular at his spot', () => {
    const before = depthChart([hitter(1, 'cf', 1, 700), ...Array.from({ length: 8 }, (_, i) => hitter(10 + i, ['c', '1b', '2b', '3b', 'ss', 'lf', 'rf', 'dh'][i], 2, 700))])
    const after = depthChart([hitter(99, 'cf', 5, 700), hitter(1, 'cf', 1, 700), ...Array.from({ length: 8 }, (_, i) => hitter(10 + i, ['c', '1b', '2b', '3b', 'ss', 'lf', 'rf', 'dh'][i], 2, 700))])
    expect(after.total - before.total).toBeLessThan(5)
    expect(after.total - before.total).toBeGreaterThan(3)
  })
})
