import { describe, expect, test } from 'bun:test'
import { log5, schedule, simulateSeason } from '../../lib/team-builder/season'
import { DIVISIONS, TEAM_NAMES } from '../../lib/team-builder/teams'

const codes = Object.keys(TEAM_NAMES)
const even = Object.fromEntries(codes.map((t) => [t, 81]))
const league = (t: string) => (DIVISIONS.findIndex((d) => d.teams.includes(t)) < 3 ? 0 : 1)

describe('schedule', () => {
  test('every team plays 162: 52 in its division, 64 in its league, 46 against the other', () => {
    const games = schedule()
    for (const t of codes) {
      const mine = games.filter(([a, b]) => a === t || b === t)
      const sum = (f: (o: string) => boolean) => mine.filter(([a, b]) => f(a === t ? b : a)).reduce((n, g) => n + g[2], 0)
      const div = DIVISIONS.find((d) => d.teams.includes(t))!.teams
      expect(sum(() => true)).toBe(162)
      expect(sum((o) => div.includes(o))).toBe(52)
      expect(sum((o) => league(o) === league(t) && !div.includes(o))).toBe(64)
      expect(sum((o) => league(o) !== league(t))).toBe(46)
    }
  })
})

describe('simulateSeason', () => {
  const s = simulateSeason(even, 3)

  test('the same seed plays the same season', () => {
    expect(simulateSeason(even, 3)).toEqual(s)
    expect(simulateSeason(even, 4)).not.toEqual(s)
  })

  test('the league plays .500 and each team plays 162', () => {
    expect(s.reduce((n, t) => n + t.wins, 0)).toBe(81 * 30)
    for (const t of s) expect(t.wins + t.losses).toBe(162)
  })

  test('six playoff teams per league, three division winners, one champion', () => {
    for (const l of [0, 1]) {
      const mine = s.filter((t) => league(t.team) === l)
      expect(mine.filter((t) => t.seed != null).map((t) => t.seed).sort()).toEqual([1, 2, 3, 4, 5, 6])
      expect(mine.filter((t) => t.divisionWinner)).toHaveLength(3)
      expect(mine.filter((t) => t.round === 'worldseries' || t.round === 'champion')).toHaveLength(1)
    }
    for (const d of DIVISIONS) {
      const ts = s.filter((t) => d.teams.includes(t.team))
      const winner = ts.find((t) => t.divisionWinner)!
      for (const t of ts) expect(winner.wins).toBeGreaterThanOrEqual(t.wins)
    }
    expect(s.filter((t) => t.round === 'champion')).toHaveLength(1)
    for (const t of s) expect(t.seed == null).toBe(t.round === 'missed')
  })

  test('over many seasons a team averages its projection, give or take', () => {
    const proj = { ...even, NYY: 95, BAL: 67 }
    let nyy = 0
    let titles = 0
    for (let i = 0; i < 300; i++) {
      const r = simulateSeason(proj, i)
      nyy += r.find((t) => t.team === 'NYY')!.wins
      if (r.find((t) => t.team === 'NYY')!.divisionWinner) titles++
    }
    expect(nyy / 300).toBeGreaterThan(92)
    expect(nyy / 300).toBeLessThan(98)
    expect(titles / 300).toBeGreaterThan(0.6)
    expect(titles / 300).toBeLessThan(0.99)
  })

  test('log5', () => {
    expect(log5(0.5, 0.5)).toBe(0.5)
    expect(log5(0.6, 0.4)).toBeCloseTo(0.692, 3)
  })
})
