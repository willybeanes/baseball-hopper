import { describe, expect, test } from 'bun:test'
import { spotsFor } from '../../lib/team-builder/field'

describe('spotsFor', () => {
  test('pitchers: starters, closers and relievers', () => {
    expect(spotsFor('lhp-s')).toEqual(['SP'])
    expect(spotsFor('sp')).toEqual(['SP'])
    expect(spotsFor('rhp-c')).toEqual(['RP']) // a closer, not a catcher
    expect(spotsFor('rhp')).toEqual(['RP'])
    expect(spotsFor('rp')).toEqual(['RP'])
  })
  test('the first position listed is the primary one', () => {
    expect(spotsFor('1b-3b')).toEqual(['1B'])
    expect(spotsFor('cf-inf')).toEqual(['CF'])
    expect(spotsFor('dh-lf')).toEqual(['DH'])
    expect(spotsFor('C')).toEqual(['C'])
  })
  test('a plain outfielder or infielder is shared across those spots', () => {
    expect(spotsFor('of')).toEqual(['LF', 'CF', 'RF'])
    expect(spotsFor('of-2b')).toEqual(['LF', 'CF', 'RF'])
    expect(spotsFor('inf')).toEqual(['1B', '2B', '3B', 'SS'])
    expect(spotsFor('if')).toEqual(['1B', '2B', '3B', 'SS'])
  })
})
