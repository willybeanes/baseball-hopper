import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')

  const db = createServiceClient()
  const { data, error } = await db
    .from('blame_split_games')
    .select('game_pk, game_date, team_id, team_score, opponent_id, opponent_name, opponent_score, is_home, category, innings_played')
    .eq('season', season)
    .order('game_date', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by game_pk — each game has exactly 2 records (one per team)
  const byPk = new Map<number, typeof data>()
  for (const r of (data ?? [])) {
    const existing = byPk.get(r.game_pk) ?? []
    existing.push(r)
    byPk.set(r.game_pk, existing)
  }

  const games = []
  for (const [game_pk, records] of byPk) {
    const home = records.find(r => r.is_home)
    const away = records.find(r => !r.is_home)
    if (!home || !away) continue

    games.push({
      game_pk,
      game_date: home.game_date,
      // away team name is in home record's opponent_name; home team name is in away record's opponent_name
      away_team: home.opponent_name,
      away_score: away.team_score,
      away_category: away.category,
      home_team: away.opponent_name,
      home_score: home.team_score,
      home_category: home.category,
      innings_played: home.innings_played,
    })
  }

  // Sort by date desc (already ordered but Map insertion order is by first appearance)
  games.sort((a, b) => b.game_date.localeCompare(a.game_date))

  return NextResponse.json({ games }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' },
  })
}
