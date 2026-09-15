import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')
  const manager = searchParams.get('manager')

  const db = createServiceClient()

  // Per-manager start detail
  if (manager) {
    const { data, error } = await db
      .from('manager_hook_starts')
      .select('game_date, team, pitcher_name, actual_gsv2, perfect_gsv2, pts_left')
      .eq('season', season)
      .eq('manager_name', manager)
      .order('game_date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ starts: data ?? [] })
  }

  // Season leaderboard
  const { data, error } = await db
    .from('manager_hook_efficiency')
    .select('manager_name, mlbam_id, team, starts, actual_gsv2, perfect_gsv2, pts_left')
    .eq('season', season)
    .order('actual_gsv2', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map(r => ({
    manager_name:  r.manager_name as string,
    mlbam_id:      r.mlbam_id as number | null,
    team:          r.team as string | null,
    starts:        r.starts as number,
    actual_gsv2:   r.actual_gsv2 as number,
    perfect_gsv2:  r.perfect_gsv2 as number,
    pts_left:      r.pts_left as number,
    hook_efficiency: (r.actual_gsv2 as number) / (r.perfect_gsv2 as number),
  }))

  return NextResponse.json({ rows })
}
