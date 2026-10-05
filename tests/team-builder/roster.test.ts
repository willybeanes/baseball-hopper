// The page's totals must reconcile with Cot's own figures once estimates are taken out.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import assumptions from '../../lib/team-builder/assumptions.json'
import { parseTeamSheet } from '../../lib/team-builder/cots'
import { applyEstimates, type OptionFact } from '../../lib/team-builder/estimates'
import { defaultRoster, money, warPrice, type TeamFile } from '../../lib/team-builder/roster'

function team(code: string, ids: Record<string, number> = {}, options: OptionFact[] = []) {
  const s = parseTeamSheet(code, readFileSync(join(import.meta.dir, 'fixtures', `${code}.csv`), 'utf8'), 2026, 2027)
  for (const p of s.players) p.mlbamId = ids[p.name]
  applyEstimates(s, options, [], assumptions)
  return { sheet: s, roster: defaultRoster(s as TeamFile) }
}
const M = (n: number) => Math.round(n / 1e3) / 1e3

describe('Mets default roster reconciles with the sheet', () => {
  const { sheet, roster } = team('NYM')
  const estimated = roster.onRoster.filter((p) => p.salarySource !== 'cots')

  test('payroll = sheet payroll + estimates', () => {
    expect(M(roster.payroll - estimated.reduce((n, p) => n + p.salary!, 0))).toBe(M(sheet.sheetPayroll!))
  })
  test('tax payroll = sheet tax payroll + estimates', () => {
    expect(M(roster.taxPayroll - estimated.reduce((n, p) => n + p.taxValue!, 0))).toBe(M(sheet.sheetTaxPayroll!))
  })
})

test('free agents are off the roster (Boston)', () => {
  const { roster } = team('BOS')
  expect(roster.freeAgents.map((p) => p.name)).toEqual(expect.arrayContaining(['Patrick Sandoval', 'Isiah Kiner-Falefa']))
  expect(roster.onRoster.some((p) => p.status === 'fa')).toBe(false)
})

describe('mutual options', () => {
  test('declined by default: off the roster, buyout in payroll but not tax payroll', () => {
    const soroka = { mlbamId: 1, decidedBy: 'both' as const, type: 'mutual', salary: 10e6, buyout: 1e6 }
    const { roster } = team('ARI', { 'Michael Soroka': 1 }, [soroka])
    const without = team('ARI').roster // no option facts: Cot's-only, still mutual -> declined
    expect(roster.declinedOptions.map((p) => p.name)).toContain('Michael Soroka')
    expect(roster.onRoster.map((p) => p.name)).not.toContain('Michael Soroka')
    expect(roster.payroll).toBe(without.payroll)
    expect(roster.taxPayroll).toBe(without.taxPayroll)
  })
})

describe('money', () => {
  test('formats', () => {
    expect(money(57_500_000, 2)).toBe('$57.50M')
    expect(money(780_000)).toBe('$780K')
    expect(money(-2_000_000, 2)).toBe('−$2.00M')
  })
})

describe('warPrice', () => {
  test('WAR times dollars per win, rounded, floored at the minimum', () => {
    expect(warPrice(2.36, 11.2e6, 780_000)).toBe(26_400_000)
    expect(warPrice(0.03, 11.2e6, 780_000)).toBe(780_000)
    expect(warPrice(-0.5, 11.2e6, 780_000)).toBe(780_000)
    expect(warPrice(null, 11.2e6, 780_000)).toBeNull()
  })
})
