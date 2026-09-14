'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface ManagerRow {
  manager_name: string
  team: string | null
  starts: number
  actual_gsv2: number
  perfect_gsv2: number
  pts_left: number
  hook_efficiency: number
}

type SortCol = 'hook_efficiency' | 'pts_left' | 'starts' | 'actual_gsv2' | 'perfect_gsv2'

function effColor(val: number): string {
  if (val >= 0.92) return 'text-[#1a7a3a] font-semibold'
  if (val >= 0.88) return 'text-[#2a7a2a]'
  if (val >= 0.85) return 'text-[#555]'
  if (val >= 0.82) return 'text-[#c07a2b]'
  return 'text-[#c0392b]'
}

function effBar(val: number): string {
  // map ~0.80–1.00 onto 0–100%
  return `${Math.max(0, Math.min(100, (val - 0.78) / 0.22 * 100))}%`
}

function effBarColor(val: number): string {
  if (val >= 0.92) return 'bg-[#1a7a3a]'
  if (val >= 0.88) return 'bg-[#2a7a2a]'
  if (val >= 0.85) return 'bg-[#7a9a2a]'
  if (val >= 0.82) return 'bg-[#c07a2b]'
  return 'bg-[#c0392b]'
}

export default function ManagerHookApp() {
  const router = useRouter()
  const sp = useSearchParams()

  const [season] = useState(2026)
  const [minGs, setMinGs] = useState(parseInt(sp.get('min_gs') ?? '5'))
  const [sortCol, setSortCol] = useState<SortCol>((sp.get('sort') as SortCol) ?? 'hook_efficiency')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((sp.get('dir') as 'asc' | 'desc') ?? 'desc')
  const [rows, setRows] = useState<ManagerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/manager-hook?season=${season}&min_gs=${minGs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setRows([]) }
        else { setRows(d.rows ?? []) }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load data.'); setRows([]); setLoading(false) })
  }, [season, minGs])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const params = new URLSearchParams()
    if (minGs !== 5) params.set('min_gs', String(minGs))
    if (sortCol !== 'hook_efficiency') params.set('sort', sortCol)
    if (sortDir !== 'desc') params.set('dir', sortDir)
    const q = params.toString()
    router.replace(q ? `/manager-hook?${q}` : '/manager-hook', { scroll: false })
  }, [minGs, sortCol, sortDir, router])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir(col === 'pts_left' ? 'asc' : 'desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol] as number
    const bv = b[sortCol] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const SortArrow = ({ col }: { col: SortCol }) => (
    <span className="ml-0.5 opacity-40">
      {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )

  const Th = ({ col, label, title, right = true }: { col: SortCol; label: string; title?: string; right?: boolean }) => (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold text-[#888] uppercase tracking-wider cursor-pointer hover:text-[#555] select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(col)}
      title={title}
    >
      {label}<SortArrow col={col} />
    </th>
  )

  const leagueAvg = rows.length > 0
    ? rows.reduce((s, r) => s + r.hook_efficiency, 0) / rows.length
    : null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Manager Hook Efficiency</h1>
            <p className="text-sm text-[var(--dim)] max-w-xl">
              Did managers pull their starters at the right moment?{' '}
              <a
                href="https://ballsandsticks.beehiiv.com/p/the-perfect-game-score-2-the-re-take"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Methodology ↗
              </a>
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-[var(--dim)] bg-[var(--panel)] border border-[var(--rule)] rounded-lg px-3 py-1.5">
            2026
          </span>
        </div>

        <div className="mt-4 px-4 py-3 bg-[var(--panel)] border border-[var(--rule)] rounded-xl text-xs text-[var(--dim)] space-y-1">
          <p>
            <span className="font-semibold text-[var(--text)]">Hook Efficiency</span>
            {' = cumulative actual GSv2 ÷ cumulative perfect GSv2'}
            <span className="ml-2 text-[10px] text-[var(--dimmer)]">(perfect = peak GSv2 achieved within each start)</span>
          </p>
          <p>
            <span className="font-semibold text-[var(--text)]">Pts Left</span>
            {' = perfect GSv2 − actual GSv2 across all managed starts'}
          </p>
          {leagueAvg !== null && (
            <p className="text-[10px] text-[var(--dimmer)]">
              League avg: <span className="font-semibold text-[var(--text)]">{leagueAvg.toFixed(3)}</span>
              {' '}(among qualified managers with ≥{minGs} starts)
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--dim)] whitespace-nowrap">Min Starts</label>
          <select
            value={minGs}
            onChange={e => setMinGs(parseInt(e.target.value))}
            className="text-sm border border-[var(--rule)] rounded-md px-2 py-1 bg-[var(--panel)] text-[var(--text)]"
          >
            {[1, 3, 5, 10, 15, 20, 50].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        {loading
          ? <span className="text-xs text-[var(--dimmer)]">Loading…</span>
          : <span className="text-xs text-[var(--dimmer)]">{sorted.length} managers</span>
        }
      </div>

      <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)]">
                <th className="w-8 px-3 py-2.5" />
                <Th col="starts" label="Manager" right={false} title="Manager name" />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider">Team</th>
                <Th col="starts" label="GS" title="Starts managed" />
                <Th col="hook_efficiency" label="Hook Eff" title="Actual GSv2 ÷ Perfect GSv2" />
                <Th col="pts_left" label="Pts Left" title="Perfect GSv2 − Actual GSv2 (lower is better)" />
                <Th col="actual_gsv2" label="Actual" title="Cumulative actual GSv2" />
                <Th col="perfect_gsv2" label="Perfect" title="Cumulative peak-possible GSv2" />
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-[#c0392b]">
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-[#aaa]">
                    No data — try lowering Min Starts or check that the table is populated.
                  </td>
                </tr>
              )}
              {sorted.map((row, i) => (
                <tr
                  key={row.manager_name}
                  className="border-b border-[var(--rule)] last:border-b-0 hover:bg-[#f8f5f0] transition-colors"
                >
                  <td className="px-3 py-2 text-center text-xs text-[#bbb] w-8 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{row.manager_name}</td>
                  <td className="px-3 py-2 text-xs text-[#888] font-mono">{row.team ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">{row.starts}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-[#e8e4df] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${effBarColor(row.hook_efficiency)}`}
                          style={{ width: effBar(row.hook_efficiency) }}
                        />
                      </div>
                      <span className={`text-sm tabular-nums w-14 text-right ${effColor(row.hook_efficiency)}`}>
                        {row.hook_efficiency.toFixed(3)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">
                    {row.pts_left.toFixed(0)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">
                    {row.actual_gsv2.toFixed(0)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">
                    {row.perfect_gsv2.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-[var(--dimmer)] text-center">
        Data via Supabase · GSv2 by Tom Tango · Hook Efficiency concept by Balls &amp; Sticks
      </p>
    </div>
  )
}
