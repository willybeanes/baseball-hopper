import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')
  const teamId = parseInt(searchParams.get('team_id') ?? '0')
  const category = searchParams.get('category') ?? ''

  if (!teamId || !category) {
    return NextResponse.json({ error: 'team_id and category required' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('blame_split_games')
    .select('game_pk, game_date, team_score, opponent_name, opponent_score, is_home, innings_played')
    .eq('season', season)
    .eq('team_id', teamId)
    .eq('category', category)
    .order('game_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ games: data ?? [] }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' },
  })
}
