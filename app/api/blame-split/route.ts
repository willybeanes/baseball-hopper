import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')

  const db = createServiceClient()
  const { data, error } = await db
    .from('blame_split_teams')
    .select('*')
    .eq('season', season)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map(t => {
    const wins = t.bullpen_win + t.lineup_comeback_win + t.coin_flip_win
    const losses = t.bullpen_loss + t.lineup_loss + t.coin_flip_loss
    return { ...t, one_run_wins: wins, one_run_losses: losses, net: wins - losses }
  }).sort((a, b) => b.net - a.net || b.one_run_wins - a.one_run_wins)

  return NextResponse.json({ rows, season }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' },
  })
}
