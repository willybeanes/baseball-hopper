// Estimate layering against the 2026-10-03 sheets: Cot's figure > MLBTR > rough rule.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import assumptions from '../../lib/team-builder/assumptions.json'
import { parseTeamSheet, type CotsPlayer } from '../../lib/team-builder/cots'
import { applyEstimates, type EstimatedFields, type OptionFact } from '../../lib/team-builder/estimates'

type P = CotsPlayer & EstimatedFields

// Ids are normally filled in from MLB's rosters; tests set them by name to stay offline.
function load(team: string, ids: Record<string, number>, options: OptionFact[] = [], arb: { mlbamId: number; salary: number }[] = []) {
  const s = parseTeamSheet(team, readFileSync(join(import.meta.dir, 'fixtures', `${team}.csv`), 'utf8'), 2026, 2027)
  for (const p of s.players) p.mlbamId = ids[p.name]
  applyEstimates(s, options, arb, assumptions)
  return (name: string) => s.players.find((p) => p.name === name) as P
}
const opt = (mlbamId: number, o: Partial<OptionFact>): OptionFact => ({ mlbamId, decidedBy: 'club', type: 'club', salary: null, buyout: null, ...o })

describe('salaries the sheet does not give', () => {
  const find = load('NYM', { 'Tylor Megill': 1, 'Nolan McLean': 2, 'Juan Soto': 3, 'Bo Bichette': 4, 'Reed Garrett': 5 }, [opt(4, { decidedBy: 'player', type: 'opt-out', buyout: 5e6 })], [{ mlbamId: 1, salary: 4_100_000 }])

  test("Cot's figure stands", () => expect(find('Juan Soto')).toMatchObject({ salary: 57_500_000, salarySource: 'cots' }))
  test('MLBTR arbitration estimate', () => expect(find('Tylor Megill')).toMatchObject({ salary: 4_100_000, taxValue: 4_100_000, salarySource: 'mlbtr-arb' }))
  test('rough estimate when MLBTR has no figure', () => expect(find('Reed Garrett')).toMatchObject({ salary: 1_800_000, salarySource: 'rough-arb' }))
  test('pre-arb at the league minimum', () => expect(find('Nolan McLean')).toMatchObject({ salary: 780_000, salarySource: 'minimum' }))
  test('player opt-out stays signed, flagged', () => expect(find('Bo Bichette')).toMatchObject({ status: 'signed', salary: 42_000_000, playerOption: { type: 'opt-out', buyout: 5e6 } }))
})

describe('options', () => {
  test('exercised by default at the MLBTR salary, buyout from the sheet', () => {
    const find = load('ARI', { 'Michael Soroka': 1 }, [opt(1, { decidedBy: 'both', type: 'mutual', salary: 10e6, buyout: 1e6 })])
    expect(find('Michael Soroka')).toMatchObject({ status: 'option', salary: 10e6, buyout: 1e6, decidedBy: 'both', salarySource: 'option' })
  })
  test('unknown option salary stays unknown', () => {
    const find = load('MIL', { 'Gary Sánchez': 1 }, [opt(1, { decidedBy: 'both', type: 'mutual', buyout: 250_000 })])
    expect(find('Gary Sánchez')).toMatchObject({ status: 'option', salary: null, salarySource: 'unknown' })
  })
  test("Cot's salary that is really the buyout becomes an option", () => {
    const find = load('CHC', { 'Carson Kelly': 1 }, [opt(1, { decidedBy: 'both', type: 'mutual', salary: 7.5e6, buyout: 1.5e6 })])
    expect(find('Carson Kelly')).toMatchObject({ status: 'option', salary: 7.5e6, buyout: 1.5e6 })
    expect(find('Carson Kelly').corrected).toBeTruthy()
  })
  test("pending option Cot's marks FA", () => {
    const find = load('BOS', { 'Garrett Whitlock': 1 }, [opt(1, { salary: 8.25e6, buyout: 1e6 })])
    expect(find('Garrett Whitlock')).toMatchObject({ status: 'option', salary: 8.25e6, buyout: 1e6 })
  })
  test('unpriced option on an arbitration-eligible player uses the arbitration estimate', () => {
    const find = load('STL', { 'Andre Pallante': 1 }, [opt(1, { type: 'unknown' })], [{ mlbamId: 1, salary: 7.5e6 }])
    expect(find('Andre Pallante')).toMatchObject({ status: 'arb', salary: 7.5e6, salarySource: 'mlbtr-arb' })
  })
})
