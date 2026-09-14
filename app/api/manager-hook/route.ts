import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

// Expected table: manager_hook_efficiency
// Columns: season, manager_name, team, starts, actual_gsv2, perfect_gsv2, pts_left
// hook_efficiency = actual_gsv2 / perfect_gsv2

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')
  const minGs = parseInt(searchParams.get('min_gs') ?? '5')

  const db = createServiceClient()

  const { data: rows, error } = await db
    .from('manager_hook_efficiency')
    .select('manager_name, team, starts, actual_gsv2, perfect_gsv2, pts_left')
    .eq('season', season)
    .gte('starts', minGs)
    .order('actual_gsv2', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const managers = (rows ?? []).map(r => ({
    manager_name: r.manager_name as string,
    team: r.team as string | null,
    starts: r.starts as number,
    actual_gsv2: r.actual_gsv2 as number,
    perfect_gsv2: r.perfect_gsv2 as number,
    pts_left: r.pts_left as number,
    hook_efficiency: (r.actual_gsv2 as number) / (r.perfect_gsv2 as number),
  }))

  return NextResponse.json(
    { rows: managers },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' } }
  )
}
