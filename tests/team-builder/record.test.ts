import { describe, expect, test } from 'bun:test'
import { fmtRecord, projectedRecord, REPLACEMENT_WINS, warScale } from '../../lib/team-builder/record'

describe('projected record', () => {
  const league = Array.from({ length: 30 }, (_, i) => 30 + i) // 30..59 WAR, summing to 1,335
  const scale = warScale(league)

  test('the league as a whole plays .500', () => {
    const wins = league.reduce((n, w) => n + projectedRecord(w, scale).wins, 0)
    expect(wins / 30).toBeCloseTo(81, 6)
  })
  test('a replacement-level team wins about 47.6', () => {
    expect(REPLACEMENT_WINS).toBeCloseTo(47.6, 1)
    expect(projectedRecord(0, scale).wins).toBeCloseTo(47.6, 1)
  })
  test('more WAR, more wins; record always adds to 162', () => {
    const a = projectedRecord(40, scale)
    const b = projectedRecord(50, scale)
    expect(b.wins).toBeGreaterThan(a.wins)
    expect(b.wins + b.losses).toBe(162)
  })
  test('never below 0 or above 162', () => {
    expect(projectedRecord(-500, scale).wins).toBe(0)
    expect(projectedRecord(5000, scale).wins).toBe(162)
  })
  test('format', () => expect(fmtRecord({ wins: 84.7, losses: 77.3 })).toBe('84.7–77.3'))
})
