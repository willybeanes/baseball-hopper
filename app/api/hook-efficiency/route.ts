import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/battery/supabase'

function ipToOuts(ip: number): number {
  const innings = Math.floor(ip)
  return innings * 3 + Math.round((ip - innings) * 10)
}

// GSv2 (Tom Tango): 40 + 2*outs + K - 2*BB - 2*H - 3*R - 6*HR
// Uses earned runs as proxy for runs (unearned are rare enough to not matter much)
function computeGsv2(ip: number, so: number, bb: number, hits: number, er: number, hr: number): number {
  return 40 + 2 * ipToOuts(ip) + so - 2 * bb - 2 * hits - 3 * er - 6 * hr
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const season = parseInt(searchParams.get('season') ?? '2026')
  const minGs = parseInt(searchParams.get('min_gs') ?? '5')
  const pitcherId = searchParams.get('pitcher_id') ? parseInt(searchParams.get('pitcher_id')!) : null

  const db = createServiceClient()

  if (pitcherId) {
    const { data: rows, error } = await db
      .from('pitcher_game_logs')
      .select('game_date, opponent_team, ip, so, bb, hits, er, hr, bf')
      .eq('pitcher_id', pitcherId)
      .eq('season', season)
      .order('game_date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const starts = (rows ?? []).map(r => ({
      game_date: r.game_date as string,
      opponent_team: r.opponent_team as string | null,
      ip: r.ip as number,
      so: r.so as number,
      bb: r.bb as number,
      hits: r.hits as number,
      er: r.er as number,
      hr: r.hr as number,
      bf: r.bf as number,
      gsv2: computeGsv2(r.ip as number, r.so as number, r.bb as number, r.hits as number, r.er as number, r.hr as number),
    }))

    return NextResponse.json({ starts }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' } })
  }

  // Aggregate leaderboard across all starts
  const { data: rows, error } = await db
    .from('pitcher_game_logs')
    .select('pitcher_id, pitcher_name, pitcher_team, ip, so, bb, hits, er, hr')
    .eq('season', season)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byPitcher = new Map<number, {
    pitcher_id: number
    pitcher_name: string
    pitcher_team: string | null
    scores: number[]
  }>()

  for (const r of rows ?? []) {
    const score = computeGsv2(
      r.ip as number, r.so as number, r.bb as number,
      r.hits as number, r.er as number, r.hr as number
    )
    const p = byPitcher.get(r.pitcher_id as number)
    if (p) {
      p.scores.push(score)
    } else {
      byPitcher.set(r.pitcher_id as number, {
        pitcher_id: r.pitcher_id as number,
        pitcher_name: r.pitcher_name as string,
        pitcher_team: r.pitcher_team as string | null,
        scores: [score],
      })
    }
  }

  const leaderboard = Array.from(byPitcher.values())
    .filter(p => p.scores.length >= minGs)
    .map(p => {
      const n = p.scores.length
      const sum = p.scores.reduce((a, b) => a + b, 0)
      const sorted = [...p.scores].sort((a, b) => a - b)
      const median = n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)]
      return {
        pitcher_id: p.pitcher_id,
        pitcher_name: p.pitcher_name,
        pitcher_team: p.pitcher_team,
        starts: n,
        avg_gsv2: Math.round((sum / n) * 10) / 10,
        med_gsv2: Math.round(median * 10) / 10,
        max_gsv2: Math.max(...p.scores),
        min_gsv2: Math.min(...p.scores),
        qs: p.scores.filter(s => s >= 50).length,
      }
    })
    .sort((a, b) => b.avg_gsv2 - a.avg_gsv2)

  return NextResponse.json(
    { rows: leaderboard },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' } }
  )
}
