'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface TeamRow {
  team_id: number
  team_name: string
  team_abbr: string
  one_run_losses: number
  bullpen_blame: number
  lineup_blame: number
  bullpen_pct: number
  lineup_pct: number
}

type SortCol = 'one_run_losses' | 'bullpen_pct' | 'lineup_pct' | 'team_name'

function blameBarColors(bullpenPct: number) {
  return {
    bullpen: bullpenPct >= 60 ? '#c0392b' : bullpenPct >= 45 ? '#c07a2b' : '#7a9a2a',
    lineup: bullpenPct >= 60 ? '#7a9a2a' : bullpenPct >= 45 ? '#555' : '#1a7a3a',
  }
}

export default function BlameSplitApp() {
  const router = useRouter()
  const sp = useSearchParams()

  const [season, setSeason] = useState(parseInt(sp.get('season') ?? '2026'))
  const [sortCol, setSortCol] = useState<SortCol>((sp.get('sort') as SortCol) ?? 'one_run_losses')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((sp.get('dir') as 'asc' | 'desc') ?? 'desc')
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
    if (sortCol !== 'one_run_losses') params.set('sort', sortCol)
    if (sortDir !== 'desc') params.set('dir', sortDir)
    const q = params.toString()
    router.replace(q ? `/blame-split?${q}` : '/blame-split', { scroll: false })
  }, [season, sortCol, sortDir, router])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir(col === 'team_name' ? 'asc' : 'desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol]
    const bv = b[sortCol]
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
  })

  const SortArrow = ({ col }: { col: SortCol }) => (
    <span className="ml-0.5 opacity-40">
      {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )

  const Th = ({ col, label, title, align = 'right' }: { col: SortCol; label: string; title?: string; align?: string }) => (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold text-[#888] uppercase tracking-wider cursor-pointer hover:text-[#555] select-none whitespace-nowrap text-${align}`}
      onClick={() => handleSort(col)}
      title={title}
    >
      {label}<SortArrow col={col} />
    </th>
  )

  const totalOneRunLosses = rows.reduce((s, r) => s + r.one_run_losses, 0)
  const totalBullpen = rows.reduce((s, r) => s + r.bullpen_blame, 0)
  const totalLineup = rows.reduce((s, r) => s + r.lineup_blame, 0)
  const leagueBullpenPct = totalOneRunLosses > 0 ? Math.round((totalBullpen / totalOneRunLosses) * 1000) / 10 : 0
  const leagueLineupPct = totalOneRunLosses > 0 ? Math.round((totalLineup / totalOneRunLosses) * 1000) / 10 : 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Blame Split</h1>
            <p className="text-sm text-[var(--dim)] max-w-xl">
              In one-run losses, was the bullpen or the lineup more to blame?
              Bullpen blame = team had a lead and lost it. Lineup blame = team never led.
            </p>
          </div>
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="mt-4 px-4 py-3 bg-[var(--panel)] border border-[var(--rule)] rounded-xl text-xs space-y-2">
            <p className="text-[var(--dim)]">
              <span className="font-semibold text-[var(--text)]">League {season}</span>
              {' — '}
              {totalOneRunLosses} one-run losses across all teams
              {' · '}
              <span className="text-[#c07a2b] font-medium">{leagueBullpenPct}% bullpen blame</span>
              {' · '}
              <span className="text-[#1a7a3a] font-medium">{leagueLineupPct}% lineup blame</span>
            </p>
            <p className="text-[10px] text-[var(--dimmer)]">
              Method: parse inning-by-inning linescore via MLB Stats API. If the losing team led at the end of any inning, the bullpen gets the blame; otherwise it falls on the lineup.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1 bg-[var(--panel)] border border-[var(--rule)] rounded-lg p-0.5">
          {[2024, 2025, 2026].map(y => (
            <button
              key={y}
              onClick={() => setSeason(y)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                season === y
                  ? 'bg-[var(--text)] text-white font-medium'
                  : 'text-[var(--dim)] hover:text-[var(--text)]'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {loading
          ? <span className="text-xs text-[var(--dimmer)]">Loading…</span>
          : !error && <span className="text-xs text-[var(--dimmer)]">{sorted.length} teams</span>
        }
      </div>

      {error ? (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl px-6 py-8 text-center text-sm text-[#c0392b]">
          {error}
        </div>
      ) : (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule)]">
                  <th className="w-8 px-3 py-2.5 text-[10px] font-semibold text-[#888] text-right">#</th>
                  <Th col="team_name" label="Team" align="left" />
                  <Th col="one_run_losses" label="1RL" title="One-Run Losses" />
                  <Th col="bullpen_pct" label="Bullpen%" title="Share of 1-run losses where team led and lost it (bullpen blame)" />
                  <Th col="lineup_pct" label="Lineup%" title="Share of 1-run losses where team never led (lineup blame)" />
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-[#888] uppercase tracking-wider text-left min-w-[160px]">
                    Split
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-[#aaa]">Loading…</td>
                  </tr>
                )}
                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-[#aaa]">
                      No data available for {season}.
                    </td>
                  </tr>
                )}
                {sorted.map((row, i) => {
                  const colors = blameBarColors(row.bullpen_pct)
                  const bullpenWidth = `${row.bullpen_pct}%`
                  const lineupWidth = `${row.lineup_pct}%`

                  return (
                    <tr
                      key={row.team_id}
                      className="border-b border-[var(--rule)] last:border-b-0 hover:bg-[#f8f5f0] transition-colors"
                    >
                      <td className="px-3 py-2.5 text-right text-[11px] text-[#bbb] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                        <span className="font-mono text-xs text-[#888] mr-2 w-8 inline-block">{row.team_abbr}</span>
                        <span className="text-[var(--text)]">{row.team_name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-[var(--text)]">
                        {row.one_run_losses}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: row.bullpen_pct >= 55 ? '#c0392b' : row.bullpen_pct >= 45 ? '#c07a2b' : '#7a9a2a' }}
                        >
                          {row.bullpen_pct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-[#bbb] ml-1 tabular-nums">({row.bullpen_blame})</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: row.lineup_pct >= 60 ? '#1a7a3a' : row.lineup_pct >= 45 ? '#555' : '#c07a2b' }}
                        >
                          {row.lineup_pct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-[#bbb] ml-1 tabular-nums">({row.lineup_blame})</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex h-3 w-40 rounded-full overflow-hidden bg-[#e8e4df]">
                          <div
                            className="h-full transition-all duration-300"
                            style={{ width: lineupWidth, background: colors.lineup }}
                            title={`Lineup: ${row.lineup_pct.toFixed(1)}%`}
                          />
                          <div
                            className="h-full transition-all duration-300"
                            style={{ width: bullpenWidth, background: colors.bullpen }}
                            title={`Bullpen: ${row.bullpen_pct.toFixed(1)}%`}
                          />
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-[9px] text-[#aaa]">lineup ←</span>
                          <span className="text-[9px] text-[#aaa] ml-auto">→ bullpen</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] text-[var(--dimmer)] text-center">
        Data via MLB Stats API · Regular season only · Bullpen blame = team had lead, lost it · Lineup blame = team never led
      </p>
    </div>
  )
}
