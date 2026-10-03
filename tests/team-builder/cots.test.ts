// Acceptance values from the Notion "Team Builder" card, section 4 and 9b,
// checked against the sheets as downloaded on 2026-10-03 (fixtures/).
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMoney, parseTeamSheet } from '../../lib/team-builder/cots'

const load = (team: string) =>
  parseTeamSheet(team, readFileSync(join(import.meta.dir, 'fixtures', `${team}.csv`), 'utf8'), 2026, 2027)
const M = (n: number) => Math.round(n / 1e3) / 1e3 // dollars -> millions, 3 dp

describe('parseMoney', () => {
  test('whole dollars, millions and brackets', () => {
    expect(parseMoney('$61,875,000', false)).toBe(61_875_000)
    expect(parseMoney('$57.500', true)).toBe(57_500_000)
    expect(parseMoney('$0.015', true)).toBe(15_000)
    expect(parseMoney('($100,000)', false)).toBe(-100_000)
    expect(parseMoney('A3', true)).toBeNull()
  })
})

describe('2027 guaranteed money (sum of rows)', () => {
  test.each([
    ['LAD', 344.472],
    ['LAA', 58.342],
    ['ATL', 176.0],
    ['MIA', 10.0],
    ['WSH', 10.375],
  ])('%s', (team, expected) => expect(M(load(team).rowsPayroll)).toBe(expected))

  test('Mets: $239.746M across 9 signed players plus Weaver dead money', () => {
    const s = load('NYM')
    const signed = s.players.filter((p) => p.status === 'signed')
    expect(signed.map((p) => p.name).sort()).toEqual(
      ['Bo Bichette', 'Devin Williams', 'Francisco Lindor', 'Jorge Polanco', 'Juan Soto', 'Kodai Senga', 'Luis Torrens', 'Marcus Semien', 'Sean Manaea'],
    )
    expect(s.deadMoney).toEqual([{ name: 'Luke Weaver', salary: 6_000_000, taxValue: 6_000_000, note: 'to Pittsburgh, 8/3/26 trade' }])
    const total = signed.reduce((n, p) => n + p.salary!, 0) + s.deadMoney.reduce((n, d) => n + d.salary, 0)
    expect(M(total)).toBe(239.746)
    expect(M(s.sheetPayroll!)).toBe(239.746)
  })

  test('Trout and Tucker', () => {
    expect(load('LAA').players.find((p) => p.name === 'Mike Trout')?.salary).toBe(37_117_000) // Notion card rounds this to 37.12
    expect(load('LAD').players.find((p) => p.name === 'Kyle Tucker')?.salary).toBe(81_917_000) // and this to 81.92
  })
})

describe('2027 luxury-tax payroll', () => {
  test.each([
    ['NYM', 255.031],
    ['BAL', 125.392],
  ])('%s', (team, expected) => {
    const s = load(team)
    expect(M(s.rowsTaxPayroll)).toBe(expected)
    expect(M(s.sheetTaxPayroll!)).toBe(expected)
  })
})

describe('statuses', () => {
  const nym = load('NYM')
  const find = (name: string, s = nym) => s.players.find((p) => p.name === name)!

  test('arbitration year', () => expect(find('Tylor Megill')).toMatchObject({ status: 'arb', arbYear: 3, salary: null }))
  test('pre-arb', () => expect(find('Nolan McLean').status).toBe('prearb'))
  test('walk year', () => {
    expect(find('Sean Manaea')).toMatchObject({ status: 'signed', walkYear: true })
    expect(find('Juan Soto').walkYear).toBe(false)
  })
  test('accented names and stripped asterisks', () => {
    expect(find('Francisco Álvarez').status).toBe('arb')
    expect(find('Francisco Lindor').sheetName).toBe('Lindor, Francisco')
  })
  test('option with buyout in the salary block', () => {
    const soroka = find('Michael Soroka', load('ARI'))
    expect(soroka).toMatchObject({ status: 'option', optionType: 'mutual', buyout: 1_000_000, salary: null })
  })
  test('option with no cell markers, only the contract line', () => {
    expect(find('Matt Boyd', load('CHC'))).toMatchObject({ status: 'option', optionType: 'mutual', buyout: 2_000_000 })
  })
  test('already-exercised option counts as signed', () => {
    expect(find('Chris Sale', load('ATL'))).toMatchObject({ status: 'signed', salary: 27_000_000 })
  })
  test('blank 2027 for a veteran whose deal ran out means free agent', () => {
    expect(find('Paul Goldschmidt', load('NYY')).status).toBe('fa')
  })
})
