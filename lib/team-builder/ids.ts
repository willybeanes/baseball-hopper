// Matches Cot's names to MLBAM ids. Each sheet is matched against its own team's
// rosters first (40-man, everyone used in the season, the whole organization), and only
// then against the league-wide player list — a much smaller haystack than "everyone ever".

export interface RosterPerson { id: number; fullName: string }

// Cot's team code -> MLB Stats API team id
export const MLB_TEAM_IDS: Record<string, number> = {
  ARI: 109, ATH: 133, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113, CLE: 114, COL: 115,
  DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147,
  PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
}

// "José O. Berríos" -> "jose berrios"; "Ronald Acuña Jr." -> "ronald acuna" (or "ronald acuna jr"
// with keepSuffix, which tells two Luis Garcías apart). Middle initials are dropped.
export function normalizeName(name: string, keepSuffix = false): string {
  const tokens = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\b([a-z])\.\s?([a-z])\.?(?=\s)/g, '$1$2') // "c.j. kayfus" -> "cj kayfus"
    .replace(/[.\- ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return tokens
    .filter((t, i) => i === 0 || t.length > 1)
    .filter((t, i) => keepSuffix || i === 0 || !/^(jr|sr|ii|iii|iv)$/.test(t)) // "JR Ritchie" keeps his JR
    .join(' ')
}

const lastAndInitial = (n: string) => {
  const parts = normalizeName(n).split(' ')
  return `${parts[0]?.[0] ?? ''} ${parts.slice(1).join(' ')}`
}

export type MatchHow = 'override' | 'team' | 'team-initial' | 'league' | 'league-initial'

// Returns the id and how it was found, or null when there's no single clear match.
export function matchPlayer(
  name: string,
  teamPool: RosterPerson[],
  leaguePool: RosterPerson[],
  override?: number,
): { id: number; how: MatchHow } | null {
  if (override) return { id: override, how: 'override' }
  const tries: [RosterPerson[], (p: RosterPerson) => boolean, MatchHow][] = [
    [teamPool, (p) => normalizeName(p.fullName, true) === normalizeName(name, true), 'team'],
    [teamPool, (p) => normalizeName(p.fullName) === normalizeName(name), 'team'],
    [teamPool, (p) => lastAndInitial(p.fullName) === lastAndInitial(name), 'team-initial'],
    [leaguePool, (p) => normalizeName(p.fullName) === normalizeName(name), 'league'],
    [leaguePool, (p) => lastAndInitial(p.fullName) === lastAndInitial(name), 'league-initial'],
  ]
  for (const [pool, test, how] of tries) {
    const ids = new Set(pool.filter(test).map((p) => p.id))
    if (ids.size === 1) return { id: [...ids][0], how }
  }
  return null
}
