// Projected WAR by spot on the field, from each rostered player's primary position.

export const FIELD_SPOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'] as const
export type FieldSpot = (typeof FIELD_SPOTS)[number]

export const SPOT_NAMES: Record<FieldSpot, string> = {
  C: 'Catcher', '1B': 'First base', '2B': 'Second base', '3B': 'Third base', SS: 'Shortstop',
  LF: 'Left field', CF: 'Center field', RF: 'Right field', DH: 'Designated hitter',
  SP: 'Starting pitchers', RP: 'Bullpen',
}

const OUTFIELD: FieldSpot[] = ['LF', 'CF', 'RF']
const INFIELD: FieldSpot[] = ['1B', '2B', '3B', 'SS']

// Where a player's WAR goes. Cot's writes positions like "lhp-s" (starter), "rhp-c" (closer),
// "1b-3b" or "cf-inf"; MLB's minor-league rosters use "sp", "rp", "ss". The first position
// listed is the primary one. A plain "of" or "inf" names no spot, so it's shared evenly
// across the outfield or the infield.
export function spotsFor(pos: string): FieldSpot[] {
  const p = pos.toLowerCase()
  if (p.includes('hp') || p === 'sp' || p === 'rp' || p === 'p') return [/-s\b/.test(p) || p === 'sp' ? 'SP' : 'RP']
  const first = p.split('-')[0].toUpperCase()
  if ((FIELD_SPOTS as readonly string[]).includes(first)) return [first as FieldSpot]
  if (first === 'OF') return OUTFIELD
  return INFIELD // "inf", "if", "ut" and anything unrecognised
}

export interface SpotWar { war: number; players: { name: string; war: number }[] }

export function warBySpot(players: { name: string; pos: string; war?: number | null }[]): Record<FieldSpot, SpotWar> {
  const out = Object.fromEntries(FIELD_SPOTS.map((s) => [s, { war: 0, players: [] } as SpotWar])) as Record<FieldSpot, SpotWar>
  for (const p of players) {
    const war = p.war ?? 0
    const spots = spotsFor(p.pos)
    for (const s of spots) {
      out[s].war += war / spots.length
      out[s].players.push({ name: p.name, war: war / spots.length })
    }
  }
  for (const s of FIELD_SPOTS) out[s].players.sort((a, b) => b.war - a.war)
  return out
}
