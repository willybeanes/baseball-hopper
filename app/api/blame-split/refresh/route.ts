import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

type Category = 'bullpen_win' | 'lineup_comeback_win' | 'coin_flip_win' | 'bullpen_loss' | 'lineup_loss' | 'coin_flip_loss'

interface InningScore { runs?: number }
interface Inning { num: number; away: InningScore; home: InningScore }
interface TeamRef { id: number; name: string }
interface GameTeamData { team: TeamRef; score?: number }
interface Game {
  gamePk: number
  officialDate: string
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

interface GameRecord {
  season: number
  game_pk: number
  game_date: string
  team_id: number
  team_score: number
  opponent_id: number
  opponent_name: string
  opponent_score: number
  is_home: boolean
  category: Category
  innings_played: number
}

interface ClassifiedEntry {
  teamId: number
  team: TeamRef
  category: Category
  teamScore: number
  opponentId: number
  opponentName: string
  opponentScore: number
  isHome: boolean
  inningsPlayed: number
}

function classifyGame(game: Game): ClassifiedEntry[] | null {
  const awayScore = game.teams.away.score ?? -1
  const homeScore = game.teams.home.score ?? -1
  if (awayScore < 0 || homeScore < 0) return null
  if (Math.abs(awayScore - homeScore) !== 1) return null

  const innings = game.linescore?.innings ?? []
  const inningsPlayed = innings.length
  const isExtra = inningsPlayed > 9
  const awayWon = awayScore > homeScore
  const awayTeam = game.teams.away.team
  const homeTeam = game.teams.home.team

  if (isExtra) {
    return [
      {
        teamId: awayTeam.id, team: awayTeam,
        category: awayWon ? 'coin_flip_win' : 'coin_flip_loss',
        teamScore: awayScore, opponentId: homeTeam.id, opponentName: homeTeam.name,
        opponentScore: homeScore, isHome: false, inningsPlayed,
      },
      {
        teamId: homeTeam.id, team: homeTeam,
        category: awayWon ? 'coin_flip_loss' : 'coin_flip_win',
        teamScore: homeScore, opponentId: awayTeam.id, opponentName: awayTeam.name,
        opponentScore: awayScore, isHome: true, inningsPlayed,
      },
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
  const loserScore = losingIsAway ? awayScore : homeScore
  const winnerScore = losingIsAway ? homeScore : awayScore

  return [
    {
      teamId: winningTeam.id, team: winningTeam, category: winCategory,
      teamScore: winnerScore, opponentId: losingTeam.id, opponentName: losingTeam.name,
      opponentScore: loserScore, isHome: !losingIsAway, inningsPlayed,
    },
    {
      teamId: losingTeam.id, team: losingTeam, category: lossCategory,
      teamScore: loserScore, opponentId: winningTeam.id, opponentName: winningTeam.name,
      opponentScore: winnerScore, isHome: losingIsAway, inningsPlayed,
    },
  ]
}

async function fetchTeamAbbrs(): Promise<Map<number, string>> {
  const res = await fetch(`${MLB_API}/teams?sportId=1`, { cache: 'no-store' })
  if (!res.ok) return new Map()
  const data = await res.json()
  const map = new Map<number, string>()
  for (const t of data.teams ?? []) map.set(t.id, t.abbreviation ?? '')
  return map
}

async function processSeason(season: number): Promise<{ teamStats: TeamStats[]; gameRecords: GameRecord[] }> {
  const [abbrMap, scheduleRes] = await Promise.all([
    fetchTeamAbbrs(),
    fetch(`${MLB_API}/schedule?sportId=1&season=${season}&gameType=R&hydrate=linescore&language=en`, { cache: 'no-store' }),
  ])
  if (!scheduleRes.ok) throw new Error(`MLB API ${scheduleRes.status} for season ${season}`)

  const data = await scheduleRes.json()
  const teamStatsMap = new Map<number, TeamStats>()
  const gameRecords: GameRecord[] = []

  for (const date of data.dates ?? []) {
    for (const game of (date.games ?? []) as Game[]) {
      if (game.status?.abstractGameState !== 'Final') continue
      const entries = classifyGame(game)
      if (!entries) continue

      for (const e of entries) {
        if (!teamStatsMap.has(e.teamId)) {
          teamStatsMap.set(e.teamId, {
            season,
            team_id: e.teamId,
            team_name: e.team.name,
            team_abbr: abbrMap.get(e.teamId) ?? e.team.name.split(' ').pop() ?? '',
            bullpen_win: 0, lineup_comeback_win: 0, coin_flip_win: 0,
            bullpen_loss: 0, lineup_loss: 0, coin_flip_loss: 0,
          })
        }
        teamStatsMap.get(e.teamId)![e.category]++

        gameRecords.push({
          season,
          game_pk: game.gamePk,
          game_date: game.officialDate,
          team_id: e.teamId,
          team_score: e.teamScore,
          opponent_id: e.opponentId,
          opponent_name: e.opponentName,
          opponent_score: e.opponentScore,
          is_home: e.isHome,
          category: e.category,
          innings_played: e.inningsPlayed,
        })
      }
    }
  }

  return { teamStats: Array.from(teamStatsMap.values()), gameRecords }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const seasonParam = searchParams.get('season')
  const all = searchParams.get('all') === 'true'
  const seasons = all ? [2024, 2025, 2026] : seasonParam ? [parseInt(seasonParam)] : [2026]

  const db = createServiceClient()
  const results: Record<number, { teams: number; games: number }> = {}

  try {
    for (const season of seasons) {
      const { teamStats, gameRecords } = await processSeason(season)

      const { error: teamsErr } = await db
        .from('blame_split_teams')
        .upsert(teamStats.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'season,team_id' })
      if (teamsErr) return NextResponse.json({ error: `Teams upsert ${season}: ${teamsErr.message}` }, { status: 500 })

      // Deduplicate by (game_pk, team_id) — rescheduled games can appear twice in the schedule feed
      const seen = new Set<string>()
      const dedupedGames = gameRecords.filter(r => {
        const key = `${r.game_pk}:${r.team_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Delete existing records for this season then re-insert
      const { error: delErr } = await db.from('blame_split_games').delete().eq('season', season)
      if (delErr) return NextResponse.json({ error: `Games delete ${season}: ${delErr.message}` }, { status: 500 })

      // Insert in batches of 500
      for (let i = 0; i < dedupedGames.length; i += 500) {
        const { error: insertErr } = await db.from('blame_split_games').insert(dedupedGames.slice(i, i + 500))
        if (insertErr) return NextResponse.json({ error: `Games insert ${season}: ${insertErr.message}` }, { status: 500 })
      }

      results[season] = { teams: teamStats.length, games: gameRecords.length }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, seasons: results, refreshed_at: new Date().toISOString() })
}
