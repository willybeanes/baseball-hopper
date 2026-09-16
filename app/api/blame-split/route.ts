import { NextRequest, NextResponse } from 'next/server'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

interface InningScore {
  runs?: number
}

interface Inning {
  num: number
  away: InningScore
  home: InningScore
}

interface TeamRef {
  id: number
  name: string
  abbreviation: string
}

interface GameTeamData {
  team: TeamRef
  score?: number
}

interface Game {
  gamePk: number
  status: { abstractGameState: string; detailedState: string }
  teams: {
    away: GameTeamData
    home: GameTeamData
  }
  linescore?: {
    innings: Inning[]
  }
}

interface TeamStats {
  team_id: number
  team_name: string
  team_abbr: string
  one_run_losses: number
  bullpen_blame: number
  lineup_blame: number
}

function classifyGame(game: Game): { losingTeamId: number; blame: 'bullpen' | 'lineup'; losingTeam: TeamRef } | null {
  const awayScore = game.teams.away.score ?? -1
  const homeScore = game.teams.home.score ?? -1

  if (awayScore < 0 || homeScore < 0) return null
  if (Math.abs(awayScore - homeScore) !== 1) return null

  const losingIsAway = awayScore < homeScore
  const losingTeam = losingIsAway ? game.teams.away.team : game.teams.home.team

  const innings = game.linescore?.innings ?? []
  let cumAway = 0
  let cumHome = 0
  let lostTeamEverLed = false

  for (const inning of innings) {
    cumAway += inning.away?.runs ?? 0
    cumHome += inning.home?.runs ?? 0

    if (losingIsAway && cumAway > cumHome) {
      lostTeamEverLed = true
      break
    } else if (!losingIsAway && cumHome > cumAway) {
      lostTeamEverLed = true
      break
    }
  }

  return {
    losingTeamId: losingTeam.id,
    losingTeam,
    blame: lostTeamEverLed ? 'bullpen' : 'lineup',
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')

  const url = `${MLB_API}/schedule?sportId=1&season=${season}&gameType=R&hydrate=linescore&language=en`

  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) {
    return NextResponse.json({ error: `MLB API error: ${res.status}` }, { status: 500 })
  }

  const data = await res.json()

  const teamStats = new Map<number, TeamStats>()

  for (const date of data.dates ?? []) {
    for (const game of (date.games ?? []) as Game[]) {
      if (game.status?.abstractGameState !== 'Final') continue

      const result = classifyGame(game)
      if (!result) continue

      const { losingTeamId, blame, losingTeam } = result

      if (!teamStats.has(losingTeamId)) {
        teamStats.set(losingTeamId, {
          team_id: losingTeamId,
          team_name: losingTeam.name,
          team_abbr: losingTeam.abbreviation,
          one_run_losses: 0,
          bullpen_blame: 0,
          lineup_blame: 0,
        })
      }

      const stats = teamStats.get(losingTeamId)!
      stats.one_run_losses++
      if (blame === 'bullpen') stats.bullpen_blame++
      else stats.lineup_blame++
    }
  }

  const rows = Array.from(teamStats.values())
    .sort((a, b) => b.one_run_losses - a.one_run_losses)
    .map(t => ({
      ...t,
      bullpen_pct: t.one_run_losses > 0 ? Math.round((t.bullpen_blame / t.one_run_losses) * 1000) / 10 : 0,
      lineup_pct: t.one_run_losses > 0 ? Math.round((t.lineup_blame / t.one_run_losses) * 1000) / 10 : 0,
    }))

  return NextResponse.json({ rows, season }, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' },
  })
}
