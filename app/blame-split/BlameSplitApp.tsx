'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface TeamRow {
  team_id: number
  team_name: string
  team_abbr: string
  bullpen_win: number
  lineup_comeback_win: number
  coin_flip_win: number
  bullpen_loss: number
  lineup_loss: number
  coin_flip_loss: number
  one_run_wins: number
  one_run_losses: number
  net: number
}

const HATCH_RED = `repeating-linear-gradient(-45deg, #c0392b, #c0392b 2px, rgba(192,57,43,0.15) 2px, rgba(192,57,43,0.15) 7px)`
const HATCH_GREEN = `repeating-linear-gradient(-45deg, #1a7a3a, #1a7a3a 2px, rgba(26,122,58,0.15) 2px, rgba(26,122,58,0.15) 7px)`

function nickName(teamName: string): string {
  if (teamName.includes('Red Sox')) return 'Red Sox'
  if (teamName.includes('White Sox')) return 'White Sox'
  if (teamName.includes('Blue Jays')) return 'Blue Jays'
  return teamName.split(' ').pop() ?? teamName
}

function Seg({
  count, width, style, label, title,
}: {
  count: number; width: number; style: React.CSSProperties; label?: string; title?: string
}) {
  if (count === 0) return null
  return (
    <div
      className="relative h-full flex items-center justify-center overflow-hidden shrink-0"
      style={{ width, ...style }}
      title={title}
    >
      {width >= 20 && (
        <span className="text-white text-[10px] font-bold leading-none select-none drop-shadow-sm">
          {count}
        </span>
      )}
    </div>
  )
}

export default function BlameSplitApp() {
  const router = useRouter()
  const sp = useSearchParams()

  const [season, setSeason] = useState(parseInt(sp.get('season') ?? '2026'))
  const [rows, setRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/blame-split?season=${season}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setRows(d.rows ?? [])
        setLoading(false)
      })
      .catch(() => { setError('Failed to load data.'); setLoading(false) })
  }, [season])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const params = new URLSearchParams()
    if (season !== 2026) params.set('season', String(season))
    const q = params.toString()
    router.replace(q ? `/blame-split?${q}` : '/blame-split', { scroll: false })
  }, [season, router])

  const maxGames = rows.length
    ? Math.ceil(Math.max(...rows.map(r => Math.max(r.one_run_wins, r.one_run_losses))) / 5) * 5
    : 30

  const SIDE = 260
  const toW = (n: number) => Math.round((n / maxGames) * SIDE)

  // Axis tick values
  const ticks = Array.from({ length: Math.floor(maxGames / 5) + 1 }, (_, i) => i * 5)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Blame Split</h1>
        <p className="text-sm text-[var(--dim)] max-w-2xl">
          The {season} one-run whodunit — who won and lost each team's close games, and why.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex gap-1 bg-[var(--panel)] border border-[var(--rule)] rounded-lg p-0.5">
          {[2024, 2025, 2026].map(y => (
            <button
              key={y}
              onClick={() => setSeason(y)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                season === y ? 'bg-[var(--text)] text-white font-medium' : 'text-[var(--dim)] hover:text-[var(--text)]'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-[var(--dimmer)]">Loading…</span>}
        {!loading && !error && <span className="text-xs text-[var(--dimmer)]">{rows.length} teams</span>}
      </div>

      {error ? (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl px-6 py-8 text-center text-sm text-[#c0392b]">{error}</div>
      ) : loading ? (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl px-6 py-8 text-center text-sm text-[var(--dimmer)]">Loading…</div>
      ) : (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
          {/* Chart title row */}
          <div className="flex items-center border-b border-[var(--rule)] px-4 py-2.5">
            <div className="w-28 shrink-0" />
            <div className="flex items-center" style={{ width: SIDE * 2 + 2 }}>
              <span className="flex-1 text-center text-[11px] font-semibold text-[var(--dim)] uppercase tracking-wider">← Losses</span>
              <div className="w-px h-4 bg-[var(--rule)]" />
              <span className="flex-1 text-center text-[11px] font-semibold text-[var(--dim)] uppercase tracking-wider">Wins →</span>
            </div>
            <div className="w-14 shrink-0" />
          </div>

          {/* Axis labels */}
          <div className="flex items-center px-4 pb-1 pt-0.5">
            <div className="w-28 shrink-0" />
            <div className="flex items-end" style={{ width: SIDE * 2 + 2 }}>
              {/* Loss axis (right to left) */}
              <div className="flex justify-between" style={{ width: SIDE, direction: 'rtl' }}>
                {ticks.filter(t => t > 0).map(t => (
                  <span key={t} className="text-[9px] text-[var(--dimmer)] tabular-nums">{t}</span>
                ))}
              </div>
              <div className="w-px" />
              {/* Win axis (left to right) */}
              <div className="flex justify-between" style={{ width: SIDE }}>
                {ticks.filter(t => t > 0).map(t => (
                  <span key={t} className="text-[9px] text-[var(--dimmer)] tabular-nums">{t}</span>
                ))}
              </div>
            </div>
            <div className="w-14 shrink-0" />
          </div>

          {/* Team rows */}
          <div className="divide-y divide-[var(--rule)]">
            {rows.map(row => {
              // Loss segments: from center outward → bullpen_loss, lineup_loss, coin_flip_loss
              const bpLossW = toW(row.bullpen_loss)
              const luLossW = toW(row.lineup_loss)
              const cfLossW = toW(row.coin_flip_loss)
              // Win segments: from center outward → bullpen_win, lineup_comeback_win, coin_flip_win
              const bpWinW = toW(row.bullpen_win)
              const lcWinW = toW(row.lineup_comeback_win)
              const cfWinW = toW(row.coin_flip_win)

              return (
                <div key={row.team_id} className="flex items-center px-4 py-[3px] hover:bg-[#f8f5f0] transition-colors">
                  {/* Team label */}
                  <div className="w-28 shrink-0 flex items-center justify-end gap-1 pr-2">
                    <span className="text-[11px] text-[var(--text)] truncate font-medium">{nickName(row.team_name)}</span>
                    <span className="text-[10px] text-[#bbb] shrink-0">–</span>
                  </div>

                  {/* Loss bars (flex-row-reverse so they grow left from center) */}
                  <div className="flex flex-row-reverse items-stretch" style={{ width: SIDE, height: 22 }}>
                    <Seg count={row.coin_flip_loss} width={cfLossW} style={{ background: '#b0aaa3' }} title={`Extra innings loss (coin flip): ${row.coin_flip_loss}`} />
                    <Seg count={row.lineup_loss} width={luLossW} style={{ background: HATCH_RED }} title={`Lineup loss (never led): ${row.lineup_loss}`} />
                    <Seg count={row.bullpen_loss} width={bpLossW} style={{ background: '#c0392b' }} title={`Bullpen loss (blew lead): ${row.bullpen_loss}`} />
                  </div>

                  {/* Center divider */}
                  <div className="w-px self-stretch bg-[var(--text)] opacity-40 shrink-0" />

                  {/* Win bars */}
                  <div className="flex items-stretch" style={{ width: SIDE, height: 22 }}>
                    <Seg count={row.bullpen_win} width={bpWinW} style={{ background: '#1a7a3a' }} title={`Bullpen win (held lead): ${row.bullpen_win}`} />
                    <Seg count={row.lineup_comeback_win} width={lcWinW} style={{ background: HATCH_GREEN }} title={`Lineup comeback win: ${row.lineup_comeback_win}`} />
                    <Seg count={row.coin_flip_win} width={cfWinW} style={{ background: '#b0aaa3' }} title={`Extra innings win (coin flip): ${row.coin_flip_win}`} />
                  </div>

                  {/* W-L record */}
                  <div className="w-14 shrink-0 pl-2 text-right">
                    <span className="text-[11px] font-mono text-[var(--dim)] tabular-nums">
                      {row.one_run_wins}-{row.one_run_losses}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-3 border-t border-[var(--rule)]">
            {[
              { style: { background: '#1a7a3a' }, label: 'Bullpen win (held lead)' },
              { style: { background: HATCH_GREEN }, label: 'Lineup comeback win' },
              { style: { background: '#c0392b' }, label: 'Bullpen loss (blew lead)' },
              { style: { background: HATCH_RED }, label: 'Lineup loss (never led)' },
              { style: { background: '#b0aaa3' }, label: 'Extra innings (coin flip)' },
            ].map(({ style, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded-[2px] shrink-0" style={style} />
                <span className="text-[10px] text-[var(--dim)]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--dimmer)] text-center">
        Data via MLB Stats API · Regular season only · Sorted by 1-run W–L record
      </p>
    </div>
  )
}
