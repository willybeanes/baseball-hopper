import { describe, expect, test } from 'bun:test'
import { parseArgs } from '../../scripts/team-builder/simulate-many'

describe('simulate-many options', () => {
  test('defaults: 500 runs from seed 1, suggested plans, no moves', () => {
    expect(parseArgs([])).toEqual({ runs: 500, seed: 1, attitudes: {}, manual: {}, from: null, out: null, talentSd: 5 })
  })

  test('a page link supplies plans and moves; its seed is ignored', () => {
    const o = parseArgs(['--link', 'https://baseballhopper.com/team-builder/simulate?from=HOU&a=bbbbabbtctcbrtarcbcabbrcrbcbcr&mm=HOU%7Eredgf.adxst-1p4&s=k987c2'])
    expect(o.from).toBe('HOU')
    expect(o.seed).toBe(1)
    expect(o.attitudes.NYY).toBe('allin')
    expect(o.manual.HOU).toEqual([{ type: 'remove', id: 670623 }, { type: 'add', id: 650333, salary: 22_000_000 }])
  })

  test("--from and --m carry a team's Team Builder moves, as the page does", () => {
    const o = parseArgs(['--from', 'hou', '--m', 'redgf.adxst-1p4', '--runs', '50', '--seed', '7'])
    expect(o).toMatchObject({ from: 'HOU', runs: 50, seed: 7 })
    expect(o.manual.HOU).toHaveLength(2)
  })

  test('flags win over the link', () => {
    expect(parseArgs(['--link', '/team-builder/simulate?from=HOU', '--from', 'NYM']).from).toBe('NYM')
  })

  test('bad input is refused with a reason', () => {
    expect(() => parseArgs(['--runs', '0'])).toThrow('--runs')
    expect(() => parseArgs(['--from', 'XXX'])).toThrow('Unknown team')
    expect(() => parseArgs(['--nope', '1'])).toThrow('Unknown option')
    expect(() => parseArgs(['--runs'])).toThrow('needs a value')
    expect(() => parseArgs(['--talent-sd', '-1'])).toThrow('--talent-sd')
  })
})
