import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

type Category = 'bullpen_win' | 'lineup_comeback_win' | 'coin_flip_win' | 'bullpen_loss' | 'lineup_loss' | 'coin_flip_loss'

interface InningScore { runs?: number }
interface Inning { num: number; away: InningScore; home: InningScore }
interface TeamRef { id: number; name: string; abbreviation: string }
interface GameTeamData { team: TeamRef; score?: number }
interface Game {
  status: { abstractGameState: string }
  teams: { away: GameTeamData; home: GameTeamData }
  linescore?: { innings: Inning[] }
}

interface TeamStats {
  season: number
  team_id: number
  team_name: string
  team_abbr: string
  bullpen_win: number
  lineup_comeback_win: number
  coin_flip_win: number
  bullpen_loss: number
  lineup_loss: number
  coin_flip_loss: number
}

function classifyGame(game: Game): Array<{ teamId: number; team: TeamRef; category: Category }> | null {
  const awayScore = game.teams.away.score ?? -1
  const homeScore = game.teams.home.score ?? -1
  if (awayScore < 0 || homeScore < 0) return null
  if (Math.abs(awayScore - homeScore) !== 1) return null

  const innings = game.linescore?.innings ?? []
  const isExtra = innings.length > 9
  const awayWon = awayScore > homeScore
  const awayTeam = game.teams.away.team
  const homeTeam = game.teams.home.team

  if (isExtra) {
    return [
      { teamId: awayTeam.id, team: awayTeam, category: awayWon ? 'coin_flip_win' : 'coin_flip_loss' },
      { teamId: homeTeam.id, team: homeTeam, category: awayWon ? 'coin_flip_loss' : 'coin_flip_win' },
    ]
  }

  const losingIsAway = !awayWon
  let cumAway = 0, cumHome = 0, losingTeamEverLed = false
  for (const inning of innings) {
    cumAway += inning.away?.runs ?? 0
    cumHome += inning.home?.runs ?? 0
    if (losingIsAway && cumAway > cumHome) { losingTeamEverLed = true; break }
    else if (!losingIsAway && cumHome > cumAway) { losingTeamEverLed = true; break }
  }

  const lossCategory: Category = losingTeamEverLed ? 'bullpen_loss' : 'lineup_loss'
  const winCategory: Category = losingTeamEverLed ? 'lineup_comeback_win' : 'bullpen_win'
  const losingTeam = losingIsAway ? awayTeam : homeTeam
  const winningTeam = losingIsAway ? homeTeam : awayTeam

  return [
    { teamId: winningTeam.id, team: winningTeam, category: winCategory },
    { teamId: losingTeam.id, team: losingTeam, category: lossCategory },
  ]
}

async function processSeason(season: number): Promise<TeamStats[]> {
  const url = `${MLB_API}/schedule?sportId=1&season=${season}&gameType=R&hydrate=linescore&language=en`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`MLB API ${res.status} for season ${season}`)

  const data = await res.json()
  const teamStats = new Map<number, TeamStats>()

  for (const date of data.dates ?? []) {
    for (const game of (date.games ?? []) as Game[]) {
      if (game.status?.abstractGameState !== 'Final') continue
      const entries = classifyGame(game)
      if (!entries) continue

      for (const { teamId, team, category } of entries) {
        if (!teamStats.has(teamId)) {
          teamStats.set(teamId, {
            season,
            team_id: teamId,
            team_name: team.name,
            team_abbr: team.abbreviation,
            bullpen_win: 0, lineup_comeback_win: 0, coin_flip_win: 0,
            bullpen_loss: 0, lineup_loss: 0, coin_flip_loss: 0,
          })
        }
        teamStats.get(teamId)![category]++
      }
    }
  }

  return Array.from(teamStats.values())
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  // ?season=2024 targets one season; ?all=true does 2024+2025+2026; default is 2026
  const seasonParam = searchParams.get('season')
  const all = searchParams.get('all') === 'true'
  const seasons = all ? [2024, 2025, 2026] : seasonParam ? [parseInt(seasonParam)] : [2026]

  const db = createServiceClient()
  const results: Record<number, number> = {}

  try {
    for (const season of seasons) {
      const rows = await processSeason(season)

      const upsertRows = rows.map(r => ({ ...r, updated_at: new Date().toISOString() }))
      const { error } = await db
        .from('blame_split_teams')
        .upsert(upsertRows, { onConflict: 'season,team_id' })

      if (error) return NextResponse.json({ error: `Supabase upsert failed for ${season}: ${error.message}` }, { status: 500 })
      results[season] = rows.length
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, seasons: results, refreshed_at: new Date().toISOString() })
}
