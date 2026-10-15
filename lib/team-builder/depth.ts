// Team WAR the way a depth chart counts it. Summing every projection on a 40-man overstates a
// team, because ZiPS projects each player as if he plays his usual role; a deep roster of
// decent players piles up far more playing time than a season has. Instead each spot gets a
// season's worth of PA or innings (assumptions.json), filled by the best players there first.

import assumptions from './assumptions.json'
import { FIELD_SPOTS, spotsFor, type FieldSpot, type SpotWar } from './field'

export interface DepthPlayer { id: string | number; name: string; pos: string; war?: number | null; pa?: number; ip?: number }

export interface Credit { war: number; share: number } // WAR counted for the team, and the share of his projected time used

export interface Depth {
  total: number
  bySpot: Record<FieldSpot, SpotWar>
  credit: Map<string | number, Credit>
}

const CAPACITY: Record<FieldSpot, number> = { ...assumptions.playingTime.pa, ...assumptions.playingTime.ip } as Record<FieldSpot, number>
// No reliever throws starter-like innings out of the bullpen, whatever his projection says.
const RELIEVER_MAX_IP = assumptions.playingTime.relieverMaxIp
const PITCHING: FieldSpot[] = ['SP', 'RP']
const HITTING = FIELD_SPOTS.filter((s) => !PITCHING.includes(s))

export function depthChart(players: DepthPlayer[]): Depth {
  const bySpot = Object.fromEntries(FIELD_SPOTS.map((s) => [s, { war: 0, players: [] } as SpotWar])) as Record<FieldSpot, SpotWar>
  const credit = new Map<string | number, Credit>()
  for (const p of players) credit.set(p.id, { war: 0, share: 0 })

  for (const [spots, volumeOf] of [
    [HITTING, (p: DepthPlayer) => p.pa ?? 0],
    [PITCHING, (p: DepthPlayer) => p.ip ?? 0],
  ] as const) {
    const pitching = spots === PITCHING
    // Only players who belong on this side and have projected time; a player below replacement
    // level is left out, since a replacement call-up would play instead at no cost.
    const pool = players
      .filter((p) => PITCHING.includes(spotsFor(p.pos)[0]) === pitching && volumeOf(p) > 0 && (p.war ?? 0) > 0)
      .map((p) => ({ p, left: volumeOf(p), rate: (p.war ?? 0) / volumeOf(p), inPen: 0 }))
      .sort((a, b) => b.rate - a.rate)
    const room = Object.fromEntries(spots.map((s) => [s, CAPACITY[s]])) as Record<FieldSpot, number>
    const use = (c: (typeof pool)[number], spot: FieldSpot) => {
      const u = Math.min(c.left, room[spot], spot === 'RP' ? RELIEVER_MAX_IP - c.inPen : Infinity)
      if (u <= 0) return
      if (spot === 'RP') c.inPen += u
      c.left -= u
      room[spot] -= u
      const war = c.rate * u
      bySpot[spot].war += war
      const existing = bySpot[spot].players.find((x) => x.name === c.p.name)
      if (existing) existing.war += war
      else bySpot[spot].players.push({ name: c.p.name, war })
      const cr = credit.get(c.p.id)!
      cr.war += war
      cr.share = 1 - c.left / volumeOf(c.p)
    }
    // First each player at his own position(s), best first; then whatever room is left
    // anywhere (bench bats at DH, swingmen in the rotation).
    for (const spot of spots) for (const c of pool) if (spotsFor(c.p.pos).includes(spot)) use(c, spot)
    for (const c of pool) for (const spot of spots) use(c, spot)
  }

  for (const s of FIELD_SPOTS) bySpot[s].players.sort((a, b) => b.war - a.war)
  return { total: FIELD_SPOTS.reduce((n, s) => n + bySpot[s].war, 0), bySpot, credit }
}
