'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fmt, fmtIp } from '@/lib/battery/stats'

interface LeaderboardRow {
  pitcher_id: number
  pitcher_name: string
  pitcher_team: string | null
  starts: number
  avg_gsv2: number
  med_gsv2: number
  max_gsv2: number
  min_gsv2: number
  qs: number
}

interface StartRow {
  game_date: string
  opponent_team: string | null
  ip: number
  so: number
  bb: number
  hits: number
  er: number
  hr: number
  bf: number
  gsv2: number
}

function gsvColor(val: number): string {
  if (val >= 60) return 'text-[#1a7a3a] font-semibold'
  if (val >= 50) return 'text-[#2a7a2a]'
  if (val >= 40) return 'text-[#555]'
  if (val >= 25) return 'text-[#c07a2b]'
  return 'text-[#c0392b]'
}

function gsvBg(val: number): string {
  if (val >= 60) return 'bg-[#e6f4ec]'
  if (val >= 50) return 'bg-[#f0f8f0]'
  if (val >= 25) return 'bg-[#fdf4e7]'
  return 'bg-[#fde9e7]'
}

function StartDetailRows({ pitcherId, season }: { pitcherId: number; season: number }) {
  const [starts, setStarts] = useState<StartRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hook-efficiency?pitcher_id=${pitcherId}&season=${season}`)
      .then(r => r.json())
      .then(d => { setStarts(d.starts ?? []); setLoading(false) })
      .catch(() => { setStarts([]); setLoading(false) })
  }, [pitcherId, season])

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

  const maxScore = Math.max(...starts.map(s => s.gsv2), 80)

  return (
    <>
      {starts.map((s, i) => (
        <tr key={i} className={`bg-[#faf8f5] border-b border-[#ede8e1] last:border-b-0 ${gsvBg(s.gsv2)}`}>
          <td colSpan={2} />
          <td className="px-3 py-1.5 text-xs text-[#555] whitespace-nowrap font-mono">{s.game_date}</td>
          <td className="px-3 py-1.5 text-xs text-[#888] whitespace-nowrap">{s.opponent_team ?? '—'}</td>
          <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{fmtIp(s.ip)}</td>
          <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{s.so}</td>
          <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{s.bb}</td>
          <td className="px-3 py-1.5 text-right text-xs font-mono text-[#555]">{s.hits}</td>
          <td className="px-3 py-1.5 pl-3">
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-[#e8e4df] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    s.gsv2 >= 60 ? 'bg-[#1a7a3a]' :
                    s.gsv2 >= 50 ? 'bg-[#2a7a2a]' :
                    s.gsv2 >= 40 ? 'bg-[#7a9a2a]' :
                    s.gsv2 >= 25 ? 'bg-[#c07a2b]' : 'bg-[#c0392b]'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (s.gsv2 / maxScore) * 100))}%` }}
                />
              </div>
              <span className={`text-xs tabular-nums font-semibold ${gsvColor(s.gsv2)}`}>{s.gsv2}</span>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

type SortCol = 'avg_gsv2' | 'med_gsv2' | 'max_gsv2' | 'min_gsv2' | 'starts' | 'qs'

export default function HookApp() {
  const router = useRouter()
  const sp = useSearchParams()

  const [season, setSeason] = useState(parseInt(sp.get('season') ?? '2026'))
  const [minGs, setMinGs] = useState(parseInt(sp.get('min_gs') ?? '5'))
  const [sortCol, setSortCol] = useState<SortCol>((sp.get('sort') as SortCol) ?? 'avg_gsv2')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((sp.get('dir') as 'asc' | 'desc') ?? 'desc')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(`/api/hook-efficiency?season=${season}&min_gs=${minGs}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoading(false) })
      .catch(() => { setRows([]); setLoading(false) })
  }, [season, minGs])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const params = new URLSearchParams()
    if (season !== 2026) params.set('season', String(season))
    if (minGs !== 5) params.set('min_gs', String(minGs))
    if (sortCol !== 'avg_gsv2') params.set('sort', sortCol)
    if (sortDir !== 'desc') params.set('dir', sortDir)
    const q = params.toString()
    router.replace(q ? `/hook?${q}` : '/hook', { scroll: false })
  }, [season, minGs, sortCol, sortDir, router])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function toggleExpand(id: number) {
    setExpandedId(prev => prev === id ? null : id)
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

  const Th = ({ col, label, title }: { col: SortCol; label: string; title?: string }) => (
    <th
      className="px-3 py-2.5 text-right text-[10px] font-semibold text-[#888] uppercase tracking-wider cursor-pointer hover:text-[#555] select-none whitespace-nowrap"
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
              Game Score v2 per start — did managers pull pitchers at the right time?{' '}
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
        </div>

        <div className="mt-4 px-4 py-3 bg-[var(--panel)] border border-[var(--rule)] rounded-xl text-xs text-[var(--dim)] space-y-1">
          <p>
            <span className="font-semibold text-[var(--text)]">GSv2</span>
            {' = 40 + 2×outs + K − 2×BB − 2×H − 3×R − 6×HR'}
            <span className="ml-2 text-[10px] text-[var(--dimmer)]">(ER used as proxy for R)</span>
          </p>
          <p className="text-[10px] text-[var(--dimmer)]">
            Full Hook Efficiency (actual/perfect GSv2 ratio) requires intra-start pitch data — coming soon.
            QS+ counts starts with GSv2 ≥ 50.
          </p>
        </div>
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

        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--dim)] whitespace-nowrap">Min GS</label>
          <select
            value={minGs}
            onChange={e => setMinGs(parseInt(e.target.value))}
            className="text-sm border border-[var(--rule)] rounded-md px-2 py-1 bg-[var(--panel)] text-[var(--text)]"
          >
            {[1, 3, 5, 10, 15, 20].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        {loading
          ? <span className="text-xs text-[var(--dimmer)]">Loading…</span>
          : <span className="text-xs text-[var(--dimmer)]">{sorted.length} pitchers</span>
        }
      </div>

      <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)]">
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider">Pitcher</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider">Team</th>
                <Th col="starts" label="GS" title="Games Started" />
                <Th col="avg_gsv2" label="Avg GSv2" title="Average Game Score v2 per start" />
                <Th col="med_gsv2" label="Med" title="Median GSv2 per start" />
                <Th col="max_gsv2" label="Best" title="Highest single-start GSv2" />
                <Th col="min_gsv2" label="Worst" title="Lowest single-start GSv2" />
                <Th col="qs" label="QS+" title="Starts with GSv2 >= 50" />
              </tr>
            </thead>
            <tbody>
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-[#aaa]">
                    No data — try lowering Min GS or switching seasons.
                  </td>
                </tr>
              )}
              {sorted.map((row, i) => (
                <Fragment key={row.pitcher_id}>
                  <tr
                    className={`border-b border-[var(--rule)] cursor-pointer transition-colors hover:bg-[#f8f5f0] ${
                      expandedId === row.pitcher_id ? 'bg-[#f8f5f0]' : ''
                    }`}
                    onClick={() => toggleExpand(row.pitcher_id)}
                  >
                    <td className="px-3 py-2 text-center text-xs text-[#bbb] w-8">
                      {expandedId === row.pitcher_id ? '▾' : '▸'}
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <span className="text-[#aaa] text-[11px] mr-2 tabular-nums">{i + 1}</span>
                      {row.pitcher_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#888] font-mono">{row.pitcher_team ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">{row.starts}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={`text-sm ${gsvColor(row.avg_gsv2)}`}>{fmt(row.avg_gsv2, 1)}</span>
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-mono ${gsvColor(row.med_gsv2)}`}>
                      {fmt(row.med_gsv2, 1)}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-mono ${gsvColor(row.max_gsv2)}`}>
                      {row.max_gsv2}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-mono ${gsvColor(row.min_gsv2)}`}>
                      {row.min_gsv2}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-mono text-[#555]">
                      {row.qs}
                      <span className="text-[#bbb] ml-1">/ {row.starts}</span>
                    </td>
                  </tr>
                  {expandedId === row.pitcher_id && (
                    <>
                      <tr className="bg-[#faf8f5]">
                        <td colSpan={2} />
                        <td className="px-3 py-1.5 text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">Date</td>
                        <td className="px-3 py-1.5 text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">Opp</td>
                        <td className="px-3 py-1.5 text-right text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">IP</td>
                        <td className="px-3 py-1.5 text-right text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">K</td>
                        <td className="px-3 py-1.5 text-right text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">BB</td>
                        <td className="px-3 py-1.5 text-right text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">H</td>
                        <td className="px-3 py-1.5 text-[10px] font-semibold text-[#aaa] uppercase tracking-wider pl-3">GSv2</td>
                      </tr>
                      <StartDetailRows pitcherId={row.pitcher_id} season={season} />
                    </>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-[var(--dimmer)] text-center">
        Data via Supabase · GSv2 by Tom Tango · ER used as proxy for runs allowed
      </p>
    </div>
  )
}
