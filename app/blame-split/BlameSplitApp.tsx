'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
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

interface GameRow {
  game_pk: number
  game_date: string
  team_score: number
  opponent_name: string
  opponent_score: number
  is_home: boolean
  innings_played: number
}

type Category = 'bullpen_win' | 'lineup_comeback_win' | 'coin_flip_win' | 'bullpen_loss' | 'lineup_loss' | 'coin_flip_loss'

const CATEGORY_LABEL: Record<Category, string> = {
  bullpen_win: 'Bullpen win — held lead',
  lineup_comeback_win: 'Lineup comeback win',
  coin_flip_win: 'Won in extras',
  bullpen_loss: 'Bullpen loss — blew lead',
  lineup_loss: 'Lineup loss — never led',
  coin_flip_loss: 'Lost in extras',
}

const HATCH_RED = `repeating-linear-gradient(-45deg, #c0392b, #c0392b 2px, rgba(192,57,43,0.15) 2px, rgba(192,57,43,0.15) 7px)`
const HATCH_GREEN = `repeating-linear-gradient(-45deg, #1a7a3a, #1a7a3a 2px, rgba(26,122,58,0.15) 2px, rgba(26,122,58,0.15) 7px)`

function nickName(teamName: string): string {
  if (teamName.includes('Red Sox')) return 'Red Sox'
  if (teamName.includes('White Sox')) return 'White Sox'
  if (teamName.includes('Blue Jays')) return 'Blue Jays'
  return teamName.split(' ').pop() ?? teamName
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function GameDetailRows({ teamId, season, category }: { teamId: number; season: number; category: Category }) {
  const [games, setGames] = useState<GameRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/blame-split/games?season=${season}&team_id=${teamId}&category=${category}`)
      .then(r => r.json())
      .then(d => { setGames(d.games ?? []); setLoading(false) })
      .catch(() => { setGames([]); setLoading(false) })
  }, [teamId, season, category])

  const isWin = category.endsWith('_win')

  if (loading) {
    return (
      <div className="bg-[#faf8f5] border-b border-[var(--rule)] px-6 py-3 text-xs text-[#aaa]">
        Loading…
      </div>
    )
  }
  if (!games || games.length === 0) {
    return (
      <div className="bg-[#faf8f5] border-b border-[var(--rule)] px-6 py-3 text-xs text-[#aaa]">
        No games found.
      </div>
    )
  }

  return (
    <div className="bg-[#faf8f5] border-b border-[var(--rule)]">
      {/* Sub-header */}
      <div className="flex items-center gap-4 px-6 py-1.5 border-b border-[#ede8e1]">
        <span className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider w-14">Date</span>
        <span className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider flex-1">Opponent</span>
        <span className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider w-16 text-right">Score</span>
        <span className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider w-8 text-center">Inn</span>
      </div>
      {games.map((g, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-1.5 border-b border-[#ede8e1] last:border-b-0 hover:bg-[#f3f0eb] transition-colors">
          <span className="text-xs font-mono text-[#555] w-14 whitespace-nowrap">{fmtDate(g.game_date)}</span>
          <span className="text-xs text-[var(--text)] flex-1 whitespace-nowrap">
            <span className="text-[#aaa] mr-1">{g.is_home ? 'vs' : '@'}</span>
            {nickName(g.opponent_name)}
          </span>
          <a
            href={`https://www.mlb.com/gameday/${g.game_pk}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs font-mono w-16 text-right font-semibold hover:underline ${isWin ? 'text-[#1a7a3a]' : 'text-[#c0392b]'}`}
          >
            {isWin ? 'W' : 'L'} {g.team_score}–{g.opponent_score}
          </a>
          <span className="text-[10px] font-mono text-[#aaa] w-8 text-center">
            {g.innings_played > 9 ? `F/${g.innings_played}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function Seg({
  count, width, style, title, darkText, onClick, active,
}: {
  count: number; width: number; style: React.CSSProperties; title?: string
  darkText?: boolean; onClick?: () => void; active?: boolean
}) {
  if (count === 0) return null
  return (
    <div
      className={`relative h-full flex items-center justify-center overflow-hidden shrink-0 transition-opacity ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'ring-2 ring-inset ring-white/60' : ''}`}
      style={{ width, ...style }}
      title={title}
      onClick={onClick}
    >
      {width >= 20 && (
        <span className={`text-[10px] font-bold leading-none select-none ${darkText ? 'text-[#222]' : 'text-white drop-shadow-sm'}`}>
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
  const [expanded, setExpanded] = useState<{ teamId: number; category: Category } | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    setExpanded(null)
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

  function toggleSeg(teamId: number, category: Category) {
    setExpanded(prev =>
      prev?.teamId === teamId && prev?.category === category ? null : { teamId, category }
    )
  }

  const maxGames = rows.length
    ? Math.ceil(Math.max(...rows.map(r => Math.max(r.one_run_wins, r.one_run_losses))) / 5) * 5
    : 30

  const SIDE = 260
  const toW = (n: number) => Math.round((n / maxGames) * SIDE)
  const ticks = Array.from({ length: Math.floor(maxGames / 5) + 1 }, (_, i) => i * 5)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Blame Split</h1>
        <p className="text-sm text-[var(--dim)] max-w-2xl">
          The {season} one-run whodunit — who won and lost each team's close games, and why.{' '}
          <span className="text-[var(--dimmer)]">Click any segment to see the games.</span>
        </p>
        <p className="text-xs text-[var(--dimmer)] mt-1">
          Methodology from{' '}
          <a
            href="https://razzball.com/stat-chat-blame-split-and-the-one-run-whodunit/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            The One-Run Whodunit
          </a>
          {' '}· Razzball
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
        {expanded && (
          <span className="text-xs text-[var(--dim)] bg-[var(--panel)] border border-[var(--rule)] rounded-md px-2 py-1">
            {CATEGORY_LABEL[expanded.category]}
            <button onClick={() => setExpanded(null)} className="ml-2 text-[#bbb] hover:text-[var(--text)]">✕</button>
          </span>
        )}
      </div>

      {error ? (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl px-6 py-8 text-center text-sm text-[#c0392b]">{error}</div>
      ) : loading ? (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl px-6 py-8 text-center text-sm text-[var(--dimmer)]">Loading…</div>
      ) : (
        <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
          {/* Column headers */}
          <div className="flex items-center border-b border-[var(--rule)] px-4 py-2.5">
            <div className="w-28 shrink-0" />
            <div className="flex items-center" style={{ width: SIDE * 2 + 2 }}>
              <span className="flex-1 text-center text-[11px] font-semibold text-[var(--dim)] uppercase tracking-wider">← Losses</span>
              <div className="w-px h-4 bg-[var(--rule)]" />
              <span className="flex-1 text-center text-[11px] font-semibold text-[var(--dim)] uppercase tracking-wider">Wins →</span>
            </div>
            <div className="w-14 shrink-0" />
          </div>

          {/* Axis tick labels */}
          <div className="flex items-center px-4 pb-1 pt-0.5">
            <div className="w-28 shrink-0" />
            <div className="flex items-end" style={{ width: SIDE * 2 + 2 }}>
              <div className="flex justify-between" style={{ width: SIDE, direction: 'rtl' }}>
                {ticks.filter(t => t > 0).map(t => (
                  <span key={t} className="text-[9px] text-[var(--dimmer)] tabular-nums">{t}</span>
                ))}
              </div>
              <div className="w-px" />
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
              const bpLossW = toW(row.bullpen_loss)
              const luLossW = toW(row.lineup_loss)
              const cfLossW = toW(row.coin_flip_loss)
              const bpWinW  = toW(row.bullpen_win)
              const lcWinW  = toW(row.lineup_comeback_win)
              const cfWinW  = toW(row.coin_flip_win)

              const isExpanded = expanded?.teamId === row.team_id
              const expandedCat = isExpanded ? expanded!.category : null

              return (
                <Fragment key={row.team_id}>
                  <div className={`flex items-center px-4 py-[3px] transition-colors ${isExpanded ? 'bg-[#f8f5f0]' : 'hover:bg-[#f8f5f0]'}`}>
                    {/* Team label */}
                    <div className="w-28 shrink-0 flex items-center justify-end gap-1 pr-2">
                      <span className="text-[11px] text-[var(--text)] truncate font-medium">{nickName(row.team_name)}</span>
                      <span className="text-[10px] text-[#bbb] shrink-0">–</span>
                    </div>

                    {/* Loss bars (flex-row-reverse so segments grow left from center) */}
                    <div className="flex flex-row-reverse items-stretch" style={{ width: SIDE, height: 22 }}>
                      <Seg count={row.coin_flip_loss} width={cfLossW} style={{ background: '#b0aaa3' }}
                        title="Extra innings loss (coin flip)" darkText
                        active={expandedCat === 'coin_flip_loss'}
                        onClick={() => toggleSeg(row.team_id, 'coin_flip_loss')} />
                      <Seg count={row.lineup_loss} width={luLossW} style={{ background: HATCH_RED }}
                        title="Lineup loss (never led)" darkText
                        active={expandedCat === 'lineup_loss'}
                        onClick={() => toggleSeg(row.team_id, 'lineup_loss')} />
                      <Seg count={row.bullpen_loss} width={bpLossW} style={{ background: '#c0392b' }}
                        title="Bullpen loss (blew lead)"
                        active={expandedCat === 'bullpen_loss'}
                        onClick={() => toggleSeg(row.team_id, 'bullpen_loss')} />
                    </div>

                    {/* Center divider */}
                    <div className="w-px self-stretch bg-[var(--text)] opacity-40 shrink-0" />

                    {/* Win bars */}
                    <div className="flex items-stretch" style={{ width: SIDE, height: 22 }}>
                      <Seg count={row.bullpen_win} width={bpWinW} style={{ background: '#1a7a3a' }}
                        title="Bullpen win (held lead)"
                        active={expandedCat === 'bullpen_win'}
                        onClick={() => toggleSeg(row.team_id, 'bullpen_win')} />
                      <Seg count={row.lineup_comeback_win} width={lcWinW} style={{ background: HATCH_GREEN }}
                        title="Lineup comeback win" darkText
                        active={expandedCat === 'lineup_comeback_win'}
                        onClick={() => toggleSeg(row.team_id, 'lineup_comeback_win')} />
                      <Seg count={row.coin_flip_win} width={cfWinW} style={{ background: '#b0aaa3' }}
                        title="Extra innings win (coin flip)" darkText
                        active={expandedCat === 'coin_flip_win'}
                        onClick={() => toggleSeg(row.team_id, 'coin_flip_win')} />
                    </div>

                    {/* W-L record */}
                    <div className="w-14 shrink-0 pl-2 text-right">
                      <span className="text-[11px] font-mono text-[var(--dim)] tabular-nums">
                        {row.one_run_wins}–{row.one_run_losses}
                      </span>
                    </div>
                  </div>

                  {/* Expanded game detail */}
                  {isExpanded && expandedCat && (
                    <GameDetailRows teamId={row.team_id} season={season} category={expandedCat} />
                  )}
                </Fragment>
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
