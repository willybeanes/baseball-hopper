// The spots on the field, and which spot a player's position text belongs to. The WAR at each
// spot is worked out by the depth chart (depth.ts).

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

// Every spot a hitter is listed at, primary first: "2b-lf" is 2B and LF, "1b-of" is 1B and the
// three outfield spots. The depth chart fills primary spots first and these second, so a
// second baseman displaced by a better one moves to the outfield he's listed at.
export function listedSpotsFor(pos: string): FieldSpot[] {
  const primary = spotsFor(pos)
  if (primary[0] === 'SP' || primary[0] === 'RP') return primary
  const out = new Set<FieldSpot>(primary)
  for (const part of pos.toLowerCase().split('-').slice(1)) {
    const up = part.toUpperCase()
    if ((FIELD_SPOTS as readonly string[]).includes(up) && up !== 'SP' && up !== 'RP') out.add(up as FieldSpot)
    else if (part === 'of') OUTFIELD.forEach((s) => out.add(s))
    else if (part === 'inf' || part === 'if' || part === 'ut') INFIELD.forEach((s) => out.add(s))
  }
  return [...out]
}

// Where a hitter's leftover time goes once every listed spot is full: DH and the easier spots
// first. Never catcher: nobody who isn't listed there catches.
export const SPILLOVER: FieldSpot[] = ['DH', '1B', 'LF', 'RF', '3B', '2B', 'CF', 'SS']

export interface SpotWar { war: number; players: { name: string; war: number }[] }
