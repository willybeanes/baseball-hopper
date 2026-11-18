// Positions a player has actually played, from MLB's fielding stats. Cot's lists one or two
// positions per player and is often behind (Nick Loftin is "2b" there but played 75 games at
// third in 2026), so the daily refresh adds every position he has played enough at to his
// position text: "2b" becomes "2b-3b-lf-rf". The first position stays Cot's primary one.

import { listedSpotsFor, spotsFor } from './field'

const STATS_API = 'https://statsapi.mlb.com/api/v1'
const FIELD_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

export type FieldingGames = Map<number, Map<string, number>> // MLBAM id -> position -> games

// Games at each fielding position, summed over the given big-league seasons.
export async function fetchFieldingGames(seasons: number[]): Promise<FieldingGames> {
  const out: FieldingGames = new Map()
  for (const season of seasons) {
    const url = `${STATS_API}/stats?stats=season&group=fielding&season=${season}&sportId=1&playerPool=all&limit=10000`
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`MLB fielding stats ${season} returned HTTP ${r.status}`)
    const d = (await r.json()) as { stats?: { splits?: { player: { id: number }; position?: { abbreviation?: string }; stat?: { gamesPlayed?: number } }[] }[] }
    const splits = d.stats?.[0]?.splits ?? []
    if (splits.length < 500) throw new Error(`MLB fielding stats ${season}: only ${splits.length} rows`)
    for (const s of splits) {
      const pos = s.position?.abbreviation ?? ''
      if (!FIELD_POSITIONS.includes(pos)) continue
      const games = out.get(s.player.id) ?? new Map<string, number>()
      games.set(pos, (games.get(pos) ?? 0) + (s.stat?.gamesPlayed ?? 0))
      out.set(s.player.id, games)
    }
  }
  return out
}

// The position text with every position played at least minGames times added, most games
// first. Pitchers, and positions the text already covers ("of" covers LF), are left alone.
export function withFieldedPositions(pos: string, games: Map<string, number> | undefined, minGames: number): string {
  if (!games || !pos) return pos
  const primary = spotsFor(pos)[0]
  if (primary === 'SP' || primary === 'RP') return pos
  const listed = new Set<string>(listedSpotsFor(pos))
  const extra = [...games]
    .filter(([p, g]) => g >= minGames && !listed.has(p))
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p.toLowerCase())
  return extra.length ? [pos, ...extra].join('-') : pos
}
