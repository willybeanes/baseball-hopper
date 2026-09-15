'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface ManagerRow {
  manager_name: string
  mlbam_id: number | null
  team: string | null
  starts: number
  actual_gsv2: number
  perfect_gsv2: number
  pts_left: number
  hook_efficiency: number
}

interface StartRow {
  game_date: string
  team: string | null
  pitcher_name: string
  actual_gsv2: number
  perfect_gsv2: number
  pts_left: number
}

type SortCol = 'hook_efficiency' | 'pts_left' | 'starts' | 'actual_gsv2' | 'perfect_gsv2'

function effColor(val: number): string {
  if (val >= 0.92) return 'text-[#1a7a3a] font-semibold'
  if (val >= 0.88) return 'text-[#2a7a2a]'
  if (val >= 0.85) return 'text-[#555]'
  if (val >= 0.82) return 'text-[#c07a2b]'
  return 'text-[#c0392b]'
}

function effBarWidth(val: number): string {
  return `${Math.max(0, Math.min(100, (val - 0.78) / 0.22 * 100))}%`
}

function effBarColor(val: number): string {
  if (val >= 0.92) return 'bg-[#1a7a3a]'
  if (val >= 0.88) return 'bg-[#2a7a2a]'
  if (val >= 0.85) return 'bg-[#7a9a2a]'
  if (val >= 0.82) return 'bg-[#c07a2b]'
  return 'bg-[#c0392b]'
}

function headshotUrl(mlbamId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:83:current.png/ar_1:1,c_pad,b_auto:border/r_max/w_120,q_auto:best/v1/people/${mlbamId}/headshot/83/coach/current`
}

type StartSortCol = 'game_date' | 'pitcher_name' | 'hook_efficiency' | 'pts_left' | 'actual_gsv2' | 'perfect_gsv2'

function StartDetailRows({ managerName, season }: { managerName: string; season: number }) {
  const [starts, setStarts] = useState<StartRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortCol, setSortCol] = useState<StartSortCol>('game_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/manager-hook?manager=${encodeURIComponent(managerName)}&season=${season}`)
      .then(r => r.json())
      .then(d => { setStarts(d.starts ?? []); setLoading(false) })
      .catch(() => { setStarts([]); setLoading(false) })
  }, [managerName, season])

  function handleSort(col: StartSortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir(col === 'pts_left' ? 'asc' : 'desc')
    }
  }

  if (loading) {
    return (
      <tr className="bg-[#faf8f5]">
        <td colSpan={9} className="px-6 py-3 text-xs text-[#aaa]">Loading…</td>
      </tr>
    )
  }
  if (!starts || starts.length === 0) {
    return (
      <tr className="bg-[#faf8f5]">
        <td colSpan={9} className="px-6 py-3 text-xs text-[#aaa]">No starts found.</td>
      </tr>
    )
  }

  const sorted = [...starts].sort((a, b) => {
    if (sortCol === 'game_date' || sortCol === 'pitcher_name') {
      const cmp = a[sortCol].localeCompare(b[sortCol])
      return sortDir === 'asc' ? cmp : -cmp
    }
    const av = sortCol === 'hook_efficiency'
      ? (a.perfect_gsv2 > 0 ? a.actual_gsv2 / a.perfect_gsv2 : 1)
      : (a[sortCol] as number)
    const bv = sortCol === 'hook_efficiency'
      ? (b.perfect_gsv2 > 0 ? b.actual_gsv2 / b.perfect_gsv2 : 1)
      : (b[sortCol] as number)
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const Arrow = ({ col }: { col: StartSortCol }) => (
    <span className="ml-0.5 opacity-40">{sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
  )

  const SubTh = ({ col, label, right = true }: { col: StartSortCol; label: string; right?: boolean }) => (
    <td
      className={`px-3 py-1.5 text-[10px] font-semibold text-[#888] uppercase tracking-wider cursor-pointer hover:text-[#555] select-none whitespace-nowrap ${right ? 'text-right' : ''}`}
      onClick={() => handleSort(col)}
    >
      {label}<Arrow col={col} />
    </td>
  )

  return (
    <>
      <tr className="bg-[#f4f1ec]">
        <td colSpan={3} />
        <SubTh col="game_date" label="Date" right={false} />
        <SubTh col="pitcher_name" label="Pitcher" right={false} />
        <SubTh col="hook_efficiency" label="Hook Eff" />
        <SubTh col="pts_left" label="Pts Left" />
        <SubTh col="actual_gsv2" label="Actual" />
        <SubTh col="perfect_gsv2" label="Perfect" />
      </tr>
      {sorted.map((s, i) => {
        const eff = s.perfect_gsv2 > 0 ? s.actual_gsv2 / s.perfect_gsv2 : 1
        return (
          <tr key={i} className="bg-[#faf8f5] border-b border-[#ede8e1] last:border-b-0 hover:bg-[#f2efe9]">
            <td colSpan={3} />
            <td className="px-3 py-1.5 text-xs font-mono text-[#555] whitespace-nowrap">{s.game_date}</td>
            <td className="px-3 py-1.5 text-xs text-[#555]">{s.pitcher_name}</td>
            <td className="px-3 py-1.5 text-right">
              <span className={`text-xs tabular-nums ${effColor(eff)}`}>{eff.toFixed(3)}</span>
            </td>
            <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{s.pts_left.toFixed(0)}</td>
            <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{s.actual_gsv2.toFixed(0)}</td>
            <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{s.perfect_gsv2.toFixed(0)}</td>
          </tr>
        )
      })}
    </>
  )
}

export default function ManagerHookApp() {
  const router = useRouter()
  const sp = useSearchParams()

  const [season] = useState(2026)
  const [sortCol, setSortCol] = useState<SortCol>((sp.get('sort') as SortCol) ?? 'hook_efficiency')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((sp.get('dir') as 'asc' | 'desc') ?? 'desc')
  const [rows, setRows] = useState<ManagerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/manager-hook?season=${season}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setRows([]) }
        else { setRows(d.rows ?? []) }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load data.'); setRows([]); setLoading(false) })
  }, [season])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const params = new URLSearchParams()
    if (sortCol !== 'hook_efficiency') params.set('sort', sortCol)
    if (sortDir !== 'desc') params.set('dir', sortDir)
    const q = params.toString()
    router.replace(q ? `/manager-hook?${q}` : '/manager-hook', { scroll: false })
  }, [sortCol, sortDir, router])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir(col === 'pts_left' ? 'asc' : 'desc')
    }
  }

  function toggleExpand(name: string) {
    setExpandedName(prev => prev === name ? null : name)
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol] as number
    const bv = b[sortCol] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const leagueAvg = rows.length > 0
    ? rows.reduce((s, r) => s + r.hook_efficiency, 0) / rows.length
    : null

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Hook Efficiency</h1>
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
          {leagueAvg !== null && (
            <p className="text-[10px] text-[var(--dimmer)]">
              League avg: <span className="font-semibold text-[var(--text)]">{leagueAvg.toFixed(3)}</span>
            </p>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--dimmer)] mb-4">Loading…</p>}
      {error && <p className="text-sm text-[#c0392b] mb-4">{error}</p>}

      <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)]">
                <th className="w-8 px-3 py-2.5" />
                <th className="w-10 px-2 py-2.5" />
                <Th col="starts" label="Manager" right={false} title="Click to expand starts" />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider">Team</th>
                <Th col="starts" label="GS" title="Games started by managed pitchers" />
                <Th col="hook_efficiency" label="Hook Eff" title="Actual GSv2 ÷ Perfect GSv2" />
                <Th col="pts_left" label="Pts Left" title="Perfect − Actual GSv2 (lower is better)" />
                <Th col="actual_gsv2" label="Actual" title="Cumulative actual GSv2" />
                <Th col="perfect_gsv2" label="Perfect" title="Cumulative peak-possible GSv2" />
              </tr>
            </thead>
            <tbody>
              {!loading && !error && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-[#aaa]">
                    No data found.
                  </td>
                </tr>
              )}
              {sorted.map((row, i) => (
                <Fragment key={row.manager_name}>
                  <tr
                    className={`border-b border-[var(--rule)] cursor-pointer transition-colors hover:bg-[#f8f5f0] ${
                      expandedName === row.manager_name ? 'bg-[#f8f5f0]' : ''
                    }`}
                    onClick={() => toggleExpand(row.manager_name)}
                  >
                    <td className="px-3 py-2 text-center text-xs text-[#bbb] w-8">
                      {expandedName === row.manager_name ? '▾' : '▸'}
                    </td>
                    <td className="px-2 py-1.5 w-10">
                      {row.mlbam_id ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={headshotUrl(row.mlbam_id)}
                          alt={row.manager_name}
                          width={36}
                          height={36}
                          className="rounded-full object-cover bg-[#e8e4df]"
                          style={{ width: 36, height: 36 }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#e8e4df]" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <span className="text-[#aaa] text-[11px] mr-2 tabular-nums">{i + 1}</span>
                      {row.manager_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#888] font-mono">{row.team ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">{row.starts}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#e8e4df] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${effBarColor(row.hook_efficiency)}`}
                            style={{ width: effBarWidth(row.hook_efficiency) }}
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
                  {expandedName === row.manager_name && (
                    <StartDetailRows managerName={row.manager_name} season={season} />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-[var(--dimmer)] text-center">
        Data via MLB Stats API · GSv2 by Tom Tango · Hook Efficiency concept by Balls &amp; Sticks
      </p>
    </div>
  )
}
