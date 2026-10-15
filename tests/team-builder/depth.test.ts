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
    const d = depthChart([pitcher(1, 'rhp', 2, 60), pitcher(2, 'rhp', 1, 600)])
    expect(d.credit.get(1)!.share).toBe(1)
  })
  test('no one throws more than 75 innings out of the bullpen', () => {
    // A starter prospect listed as plain RHP, projected for 100 innings: 75 count in the pen,
    // and with the rotation's 850 innings free, the rest spill into the rotation.
    const d = depthChart([pitcher(1, 'rhp', 2, 100)])
    expect(d.bySpot.RP.players[0].war).toBeCloseTo(2 * 0.75, 6)
    expect(d.bySpot.SP.players[0].war).toBeCloseTo(2 * 0.25, 6)
  })
  test('rotation 850 innings, bullpen 600', () => {
    const starters = Array.from({ length: 10 }, (_, i) => pitcher(i, 'rhp-s', 2, 150)) // 1,500 IP of starters
    const d = depthChart(starters)
    const counted = [...d.credit.values()].reduce((n, c) => n + c.share * 150, 0)
    // The rotation fills (850); leftovers give the pen at most 75 each: the sixth starter's last
    // 50 innings plus 75 from each of the other four. The pen's remaining room goes to replacement.
    expect(counted).toBeCloseTo(850 + 50 + 4 * 75, 6)
    expect(d.bySpot.SP.war).toBeCloseTo(850 * (2 / 150), 6)
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
