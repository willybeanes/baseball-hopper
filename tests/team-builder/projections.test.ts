import { describe, expect, test } from 'bun:test'
import { withFallback } from '../../lib/team-builder/projections'

describe('withFallback', () => {
  test('fills only players the main system leaves out, and marks them', () => {
    const out = withFallback({ 1: { war: 2 } }, { 1: { war: 5 }, 903063835: { war: 1.08, ip: 104 } }, 'FanGraphs Depth Charts')
    expect(out[1]).toEqual({ war: 2 })
    expect(out[903063835]).toEqual({ war: 1.08, ip: 104, from: 'FanGraphs Depth Charts' })
  })
})
