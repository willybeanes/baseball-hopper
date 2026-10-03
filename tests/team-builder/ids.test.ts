// Name cases that came up matching the 2026-10-03 sheets to MLB's rosters.
import { describe, expect, test } from 'bun:test'
import { matchPlayer, normalizeName } from '../../lib/team-builder/ids'

describe('normalizeName', () => {
  test('accents, middle initials, dotted initials, suffixes', () => {
    expect(normalizeName('Francisco Álvarez')).toBe(normalizeName('Francisco Alvarez'))
    expect(normalizeName('José O. Berríos')).toBe('jose berrios')
    expect(normalizeName('C.J. Kayfus')).toBe(normalizeName('CJ Kayfus'))
    expect(normalizeName('Ronald Acuña Jr.')).toBe('ronald acuna')
    expect(normalizeName('Ronald Acuña Jr.', true)).toBe('ronald acuna jr')
  })
  test('a leading JR is a first name, not a suffix', () => {
    expect(normalizeName('J.R. Ritchie')).toBe(normalizeName('JR Ritchie'))
    expect(normalizeName('JR Ritchie')).toBe('jr ritchie')
  })
})

describe('matchPlayer', () => {
  const yankees = [
    { id: 671277, fullName: 'Luis García Jr.' },
    { id: 600001, fullName: 'Luis Garcia' },
    { id: 571510, fullName: 'Matthew Boyd' },
  ]
  const league = [
    { id: 691185, fullName: 'Maximo Acosta' },
    { id: 691186, fullName: 'Josh Smith' },
    { id: 691187, fullName: 'Josh Smith' },
  ]

  test('suffix tells two Luis Garcías apart', () => expect(matchPlayer('Luis García Jr.', yankees, league)?.id).toBe(671277))
  test('nickname via first initial on the same team', () => expect(matchPlayer('Matt Boyd', yankees, league)).toEqual({ id: 571510, how: 'team-initial' }))
  test('league-wide fallback', () => expect(matchPlayer('Max Acosta', yankees, league)).toEqual({ id: 691185, how: 'league-initial' }))
  test('two equal candidates is no match, not a guess', () => expect(matchPlayer('Josh Smith', [], league)).toBeNull())
  test('override wins', () => expect(matchPlayer('Bubba Chander', [], league, 696149)).toEqual({ id: 696149, how: 'override' }))
})
