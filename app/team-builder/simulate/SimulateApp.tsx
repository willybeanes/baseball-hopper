'use client'

// The offseason simulation: pick every team's attitude and make any moves of your own (setup),
// watch the winter play out (progress), then see the transactions and the projected 2027
// standings (results). The work is done by lib/team-builder/offseason.ts, in the browser.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import assumptions from '@/lib/team-builder/assumptions.json'
import { loadJson } from '@/lib/team-builder/data'
import { MLB_TEAM_IDS } from '@/lib/team-builder/ids'
import { buildRoster, type Move } from '@/lib/team-builder/moves'
import {
  ATTITUDE_ORDER, ATTITUDES, PHASES, defaultAttitudes, simulateOffseason, teamDepth, teamWar,
  type Attitude, type Simulation, type Transaction,
} from '@/lib/team-builder/offseason'
import type { PoolPlayer } from '@/lib/team-builder/pool'
import { fmtRecord, projectedRecord, roundedWins, warScale } from '@/lib/team-builder/record'
import { fmtWar, money, warPrice, type Meta, type TeamFile } from '@/lib/team-builder/roster'
import {
  decodeAttitudes, decodeMoves, decodeSeed, decodeTeamMoves, encodeAttitudes, encodeMoves, encodeSeed, encodeTeamMoves,
} from '@/lib/team-builder/share'
import { DIVISIONS, TEAM_NAMES } from '@/lib/team-builder/teams'
import { FIELD_SPOTS, SPOT_NAMES, type FieldSpot } from '@/lib/team-builder/field'

type Stage = 'setup' | 'running' | 'results'

const RUN_MS = 3600 // how long the progress screen takes, start to finish
const ATTITUDE_HINTS: Record<Attitude, string> = {
  allin: 'Spends past last year’s payroll and trades prospects for stars.',
  contend: 'Adds where it helps and buys a veteran or two.',
  buysell: 'Sells players in their last year, fills holes on budget.',
  rebuild: 'Sells veterans 30 and up, signs younger, cheaper players.',
  tank: 'Sells anyone 28 and up for prospects, spends little.',
}
const newSeed = () => Math.floor(Math.random() * 2 ** 32)
const LAST_RESULT_KEY = 'team-builder-last-offseason' // this browser's most recent result link

// The plans, moves and seed behind a result: enough to rebuild it exactly.
type Run = { attitudes: Record<string, Attitude>; manual: Record<string, Move[]>; seed: number }

function simulateLink(fromTeam: string | null, attitudes: Record<string, Attitude>, manual: Record<string, Move[]>, seed?: number) {
  const q = new URLSearchParams()
  if (fromTeam) q.set('from', fromTeam)
  q.set('a', encodeAttitudes(attitudes))
  const mm = encodeTeamMoves(manual)
  if (mm) q.set('mm', mm)
  if (seed != null) q.set('s', encodeSeed(seed))
  return `/team-builder/simulate?${q.toString()}`
}

function Logo({ code, size = 'h-5 w-5' }: { code: string; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://www.mlbstatic.com/team-logos/${MLB_TEAM_IDS[code]}.svg`} alt="" className={`${size} shrink-0 object-contain`} />
}

function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--panel-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const buttonPrimary = 'rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-medium text-[var(--panel)] hover:opacity-90'
const buttonQuiet = 'rounded-lg border border-[var(--rule)] bg-[var(--panel)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:border-[var(--dim)]'
const select = 'rounded-lg border border-[var(--rule)] bg-[var(--panel)] px-2 py-1 text-[13px]'

export default function SimulateApp() {
  const params = useSearchParams()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pool, setPool] = useState<PoolPlayer[] | null>(null)
  const [teams, setTeams] = useState<TeamFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const from = params.get('from')?.toUpperCase()
  const fromTeam = from && TEAM_NAMES[from] ? from : null
  const [stage, setStage] = useState<Stage>('setup')
  const [attitudes, setAttitudes] = useState<Record<string, Attitude>>({})
  const [manual, setManual] = useState<Record<string, Move[]>>({})
  const [ran, setRan] = useState<Run | null>(null)
  // The last result this browser saw, offered on the setup screen after a reload.
  const [lastLink, setLastLink] = useState<string | null>(null)
  useEffect(() => {
    try { setLastLink(window.localStorage.getItem(LAST_RESULT_KEY)) } catch { /* storage blocked */ }
  }, [])
  const [sim, setSim] = useState<Simulation | null>(null)

  useEffect(() => {
    Promise.all([
      loadJson<Meta>('meta.json'),
      loadJson<PoolPlayer[]>('pool.json'),
      Promise.all(Object.keys(TEAM_NAMES).map((t) => loadJson<TeamFile>(`teams/${t}.json`))),
    ])
      .then(([m, p, ts]) => { setMeta(m); setPool(p); setTeams(ts) })
      .catch(() => setError('Could not load the roster data.'))
  }, [])

  const minimum = meta?.assumptions.leagueMinimum.value ?? 780_000
  const perWin = assumptions.dollarsPerWar.value
  const suggested = useMemo(() => (teams && pool ? defaultAttitudes(teams, pool) : null), [teams, pool])

  // Read the address once the data is in: attitudes, the user's moves, and (for a shared
  // result) the seed, which opens straight onto the results.
  useEffect(() => {
    if (!suggested || !teams || !pool) return
    const linked = decodeAttitudes(params.get('a')) as Record<string, Attitude>
    setAttitudes({ ...suggested, ...linked })
    const moves = decodeTeamMoves(params.get('mm'))
    const carried = decodeMoves(params.get('m'))
    if (fromTeam && carried.length && !moves[fromTeam]) moves[fromTeam] = carried
    setManual(moves)
    const s = decodeSeed(params.get('s'))
    if (s != null) {
      setRan({ attitudes: { ...suggested, ...linked }, manual: moves, seed: s })
      setSim(simulateOffseason({ teams, pool, attitudes: { ...suggested, ...linked }, manual: moves, seed: s, perWin, minimum }))
      setStage('results')
    }
    // Only on first load: after that the page writes the address, it doesn't read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested])

  const resultLink = ran ? simulateLink(fromTeam, ran.attitudes, ran.manual, ran.seed) : null
  // Plans and moves still match the last run, so its result is what "Simulate" would rebuild.
  const unchanged = ran != null
    && encodeAttitudes(ran.attitudes) === encodeAttitudes(attitudes)
    && encodeTeamMoves(ran.manual) === encodeTeamMoves(manual)

  // Keep the address in step, so it can be copied at any point. Going back to change plans
  // keeps the result's link until a plan or move actually changes.
  useEffect(() => {
    if (!suggested) return
    const next = stage !== 'setup' || unchanged ? resultLink : simulateLink(fromTeam, attitudes, manual)
    if (next && next !== window.location.pathname + window.location.search) window.history.replaceState(null, '', next)
  }, [suggested, attitudes, manual, stage, fromTeam, unchanged, resultLink])

  useEffect(() => {
    if (!resultLink) return
    setLastLink(resultLink)
    try { window.localStorage.setItem(LAST_RESULT_KEY, resultLink) } catch { /* storage blocked */ }
  }, [resultLink])

  const run = (s: number) => {
    if (!teams || !pool) return
    setRan({ attitudes, manual, seed: s })
    setSim(simulateOffseason({ teams, pool, attitudes, manual, seed: s, perWin, minimum }))
    setStage('running')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-5">
        <a href={`/team-builder${fromTeam ? `?team=${fromTeam}` : ''}`} className="text-[13px] text-[var(--dim)] hover:underline">← 2027 Team Builder</a>
        <h1 className="mb-1 mt-1 text-2xl font-bold tracking-tight">Simulate the offseason</h1>
        <p className="max-w-[62ch] text-sm text-[var(--dim)]">
          {stage === 'results'
            ? 'How the winter played out: every transaction, and the projected 2027 standings that came out of it.'
            : 'Give every team a plan for the winter and make any moves of your own. The simulation handles option decisions, non-tenders, trades and free agency for everyone, then projects the 2027 standings.'}
        </p>
      </header>

      {error && <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]">{error}</p>}
      {!error && (!teams || !pool || !suggested || !Object.keys(attitudes).length) && <p className="py-10 text-center text-sm text-[var(--dimmer)]">Loading…</p>}

      {teams && pool && suggested && Object.keys(attitudes).length > 0 && (
        <>
          {stage === 'setup' && (sim || lastLink) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--rule)] bg-[var(--panel)] px-4 py-3">
              <p className="text-sm text-[var(--dim)]">
                {sim
                  ? unchanged ? 'Your last result is still here.' : 'Your last result is still here, from the plans before your changes.'
                  : 'You have a saved result from an earlier visit.'}
              </p>
              {sim
                ? <button type="button" className={buttonQuiet} onClick={() => { setStage('results'); window.scrollTo({ top: 0 }) }}>Back to results</button>
                : <a href={lastLink!} className={buttonQuiet}>Open last result</a>}
            </div>
          )}
          {stage === 'setup' && (
            <Setup
              teams={teams} pool={pool} attitudes={attitudes} setAttitudes={setAttitudes} suggested={suggested}
              manual={manual} setManual={setManual} fromTeam={fromTeam} perWin={perWin} minimum={minimum}
              onRun={() => run(newSeed())}
            />
          )}
          {stage === 'running' && sim && <Progress sim={sim} onDone={() => setStage('results')} />}
          {stage === 'results' && sim && (
            <Results
              sim={sim}
              teams={teams!}
              pool={pool!}
              manual={ran?.manual ?? {}}
              onAgain={() => run(newSeed())}
              onChange={() => { setStage('setup'); window.scrollTo({ top: 0 }) }}
            />
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------- setup

function Setup(props: {
  teams: TeamFile[]
  pool: PoolPlayer[]
  attitudes: Record<string, Attitude>
  setAttitudes: (a: Record<string, Attitude>) => void
  suggested: Record<string, Attitude>
  manual: Record<string, Move[]>
  setManual: (m: Record<string, Move[]>) => void
  fromTeam: string | null
  perWin: number
  minimum: number
  onRun: () => void
}) {
  const { teams, pool, attitudes, setAttitudes, suggested, manual, setManual, fromTeam } = props
  // Today's projected records, with the user's moves in, for context next to each team.
  const records = useMemo(() => {
    const wars = Object.fromEntries(teams.map((t) => [t.team, teamWar(buildRoster(t, manual[t.team] ?? [], pool))]))
    const scale = warScale(teams.map((t) => teamWar(buildRoster(t, [], pool))))
    return Object.fromEntries(Object.entries(wars).map(([t, w]) => [t, projectedRecord(w, scale)]))
  }, [teams, pool, manual])
  const moveCount = Object.values(manual).reduce((n, ms) => n + ms.length, 0)

  return (
    <div className="space-y-4">
      <Panel
        title="Team plans"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <label htmlFor="set-all" className="text-[var(--dim)]">Set every team to</label>
            <select
              id="set-all" value="" className={select}
              onChange={(e) => e.target.value && setAttitudes(Object.fromEntries(Object.keys(attitudes).map((t) => [t, e.target.value as Attitude])))}
            >
              <option value="">Choose…</option>
              {ATTITUDE_ORDER.map((a) => <option key={a} value={a}>{ATTITUDES[a].label}</option>)}
            </select>
            <button type="button" className={buttonQuiet} onClick={() => setAttitudes(suggested)}>Suggested plans</button>
          </div>
        }
      >
        <ul className="grid gap-x-6 gap-y-1 border-t border-[var(--rule)] px-4 py-3 text-[12px] text-[var(--dim)] sm:grid-cols-2 lg:grid-cols-5">
          {ATTITUDE_ORDER.map((a) => (
            <li key={a}><span className="font-medium text-[var(--text)]">{ATTITUDES[a].label}.</span> {ATTITUDE_HINTS[a]}</li>
          ))}
        </ul>
        <div className="grid gap-x-6 border-t border-[var(--rule)] px-4 pb-3 sm:grid-cols-2 lg:grid-cols-3">
          {DIVISIONS.map((div) => (
            <div key={div.name} className="pt-3">
              <h3 className="mb-1 text-[11px] font-medium uppercase text-[var(--dimmer)]">{div.name}</h3>
              <ul className="divide-y divide-[var(--rule)]">
                {div.teams.map((t) => (
                  <li key={t} className="flex items-center gap-2 py-1.5">
                    <Logo code={t} />
                    <span className="min-w-0 flex-1 truncate text-sm">{TEAM_NAMES[t]}</span>
                    <span className="font-mono text-[11px] text-[var(--dim)]" title="Projected record today">{fmtRecord(records[t])}</span>
                    <label htmlFor={`att-${t}`} className="sr-only">{`${TEAM_NAMES[t]} plan`}</label>
                    <select
                      id={`att-${t}`} value={attitudes[t]} className={`${select} w-32`}
                      onChange={(e) => setAttitudes({ ...attitudes, [t]: e.target.value as Attitude })}
                    >
                      {ATTITUDE_ORDER.map((a) => <option key={a} value={a}>{ATTITUDES[a].label}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <ManualMoves {...props} />

      <div className="flex flex-wrap items-center gap-3 pb-12 sm:pb-0">
        <button type="button" className={buttonPrimary} onClick={props.onRun}>Simulate the offseason</button>
        <span className="text-[13px] text-[var(--dim)]">
          {moveCount ? `${moveCount} move${moveCount === 1 ? '' : 's'} of yours go first; the simulation won’t undo them. ` : ''}
          Contracts are one-year salaries, like the rest of the Team Builder.
        </span>
      </div>
    </div>
  )
}

function ManualMoves({ teams, pool, manual, setManual, fromTeam, perWin, minimum }: {
  teams: TeamFile[]
  pool: PoolPlayer[]
  manual: Record<string, Move[]>
  setManual: (m: Record<string, Move[]>) => void
  fromTeam: string | null
  perWin: number
  minimum: number
}) {
  const [team, setTeam] = useState(fromTeam ?? 'NYM')
  const [query, setQuery] = useState('')
  const [salaries, setSalaries] = useState<Record<number, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const byCode = useMemo(() => new Map(teams.map((t) => [t.team, t])), [teams])
  const poolById = useMemo(() => new Map(pool.map((e) => [e.mlbamId, e])), [pool])
  const nameOf = (id: number) => poolById.get(id)?.name ?? 'a player'

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return pool.filter((e) => plain(e.name).includes(plain(q))).sort((a, b) => (b.war ?? 0) - (a.war ?? 0)).slice(0, 8)
  }, [pool, query])

  // Adds moves only if every one of them applies to the roster as it stands.
  const add = (changes: [string, Move][]) => {
    const next = { ...manual }
    for (const [t, m] of changes) next[t] = [...(next[t] ?? []), m]
    for (const [t, m] of changes) {
      if (buildRoster(byCode.get(t)!, next[t], pool).skipped.includes(m)) {
        setProblem(`That doesn’t work with the ${TEAM_NAMES[t]} roster as it stands (the player may already be there, or gone).`)
        return
      }
    }
    setProblem(null)
    setManual(next)
    setQuery('')
  }
  const undo = (t: string, i: number) => {
    const list = manual[t].filter((_, j) => j !== i)
    const next = { ...manual }
    if (list.length) next[t] = list
    else delete next[t]
    setManual(next)
  }

  const describe = (t: string, m: Move) => {
    const n = nameOf(m.id)
    const pay = 'salary' in m && m.salary != null ? `, ${money(m.salary)}` : ''
    switch (m.type) {
      case 'add': return poolById.get(m.id)?.kind === 'fa' ? `Sign ${n}${pay}` : `Trade for ${n}${pay}`
      case 'remove': return `Trade away or release ${n}`
      case 'decline': return `Decline ${n}’s option`
      case 'exercise': return `Exercise ${n}’s option${pay}`
      case 'optOut': return `${n} opts out`
      case 'resign': return `Re-sign ${n}${pay}`
      case 'salary': return `${n}’s salary set to ${money(m.salary)}`
      case 'promote': return `Call up ${n}`
    }
    return `${t} move`
  }

  return (
    <Panel title="Your moves">
      <div className="border-t border-[var(--rule)] px-4 py-3">
        <p className="mb-3 max-w-[70ch] text-[13px] text-[var(--dim)]">
          Moves made here happen before the simulation starts, and it leaves those players alone.
          {fromTeam && manual[fromTeam]?.length ? ` Your ${TEAM_NAMES[fromTeam]} changes from the Team Builder are already in.` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="move-team" className="text-[13px] text-[var(--dim)]">For</label>
          <select id="move-team" value={team} onChange={(e) => setTeam(e.target.value)} className={`${select} py-1.5`}>
            {Object.entries(TEAM_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <label htmlFor="move-search" className="sr-only">Search players</label>
          <input
            id="move-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a player to sign, trade for or let go"
            className="min-w-0 flex-1 rounded-lg border border-[var(--rule)] bg-[var(--panel)] px-3 py-1.5 text-sm sm:max-w-md"
          />
        </div>
        {problem && <p className="mt-2 text-[13px] text-[var(--accent)]">{problem}</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
            {results.map((e) => {
              const own = e.from === team
              const where = e.kind === 'fa' ? 'Free agent' : `${e.from}${e.minors ? ' minors' : ''}`
              const price = warPrice(e.war, perWin, minimum) ?? Math.max(e.salaryPrevYear ?? minimum, minimum)
              const typed = salaries[e.mlbamId]
              const salary = typed != null && typed !== '' && Number.isFinite(Number(typed)) ? Math.round(Number(typed) * 1e5) * 10 : price
              return (
                <li key={e.mlbamId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{e.name}</span>{' '}
                    <span className="text-[11px] uppercase text-[var(--dimmer)]">{e.pos}</span>{' '}
                    <span className="text-[12px] text-[var(--dim)]">{where} · {fmtWar(e.war)} WAR</span>
                  </span>
                  {e.kind === 'fa' && (
                    <span className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[12px] text-[var(--dim)]">
                        $
                        <input
                          type="number" min={0.78} step={0.1} inputMode="decimal" aria-label={`Salary for ${e.name}, in millions`}
                          value={typed ?? (price / 1e6).toFixed(1)}
                          onChange={(ev) => setSalaries({ ...salaries, [e.mlbamId]: ev.target.value })}
                          className="w-16 rounded border border-[var(--rule)] bg-[var(--panel)] px-1.5 py-0.5 text-right text-[13px]"
                        />
                        M
                      </label>
                      <button type="button" className={buttonQuiet} onClick={() => add([[team, { type: 'add', id: e.mlbamId, salary: Math.max(salary, minimum) }]])}>
                        Sign
                      </button>
                    </span>
                  )}
                  {e.kind === 'roster' && !own && (
                    <button
                      type="button" className={buttonQuiet}
                      onClick={() => add(e.minors || !e.from ? [[team, { type: 'add', id: e.mlbamId }]] : [[e.from, { type: 'remove', id: e.mlbamId }], [team, { type: 'add', id: e.mlbamId }]])}
                    >
                      Trade for him
                    </button>
                  )}
                  {e.kind === 'roster' && own && !e.minors && (
                    <button type="button" className={buttonQuiet} onClick={() => add([[team, { type: 'remove', id: e.mlbamId }]])}>Trade away or release</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {Object.keys(manual).length > 0 && (
        <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
          {Object.entries(manual).flatMap(([t, ms]) => ms.map((m, i) => (
            <li key={`${t}-${i}`} className="flex items-center gap-2 px-4 py-2 text-sm">
              <Logo code={t} />
              <span className="min-w-0 flex-1">{describe(t, m)}</span>
              <button type="button" onClick={() => undo(t, i)} className="text-[12px] text-[var(--dim)] underline hover:text-[var(--text)]">Undo</button>
            </li>
          )))}
        </ul>
      )}
    </Panel>
  )
}

// ------------------------------------------------------------------------------- progress

function Progress({ sim, onDone }: { sim: Simulation; onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  // The latest callback, so a re-render of the page doesn't restart the clock.
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone }, [onDone])
  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = () => {
      const t = performance.now() - start
      setElapsed(t)
      if (t < RUN_MS) frame = requestAnimationFrame(tick)
      else done.current()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [sim])
  const share = Math.min(1, elapsed / RUN_MS)
  const shown = sim.log.slice(0, Math.floor(sim.log.length * share))
  const current = shown.length ? shown[shown.length - 1].phase : PHASES[0].key
  const at = PHASES.findIndex((p) => p.key === current)

  return (
    <Panel title="Simulating the offseason" aside={<button type="button" className={buttonQuiet} onClick={onDone}>Skip to results</button>}>
      <div className="border-t border-[var(--rule)] px-4 py-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <div className="h-full w-full origin-left rounded-full bg-[var(--accent)]" style={{ transform: `scaleX(${share})` }} />
        </div>
        <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          {[...PHASES, { key: 'standings', label: 'Projected standings' }].map((p, i) => (
            <li key={p.key} className={i < at || share >= 1 ? 'text-[var(--dim)]' : i === at ? 'font-medium text-[var(--text)]' : 'text-[var(--dimmer)]'}>
              {i < at || share >= 1 ? '✓ ' : ''}{p.label}
            </li>
          ))}
        </ol>
        <ul className="mt-4 space-y-1 text-[13px]" aria-live="polite">
          {shown.slice(-6).reverse().map((x, i) => (
            <li key={`${x.id}-${x.kind}-${x.team}`} className={i === 0 ? 'text-[var(--text)]' : 'text-[var(--dim)]'}>{sentence(x)}</li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

// -------------------------------------------------------------------------------- results

function sentence(x: Transaction): string {
  const war = x.war != null ? ` (${fmtWar(x.war)} WAR)` : ''
  const pay = x.salary != null ? `, ${money(x.salary)}` : ''
  switch (x.kind) {
    case 'signed': return `${x.team} signed ${x.name}${war}${pay}${x.other === x.team ? ', re-signed' : ''}`
    case 'traded': {
      const back = x.prospects?.length ? x.prospects.map((p) => p.name).join(' and ') : 'a minor leaguer'
      return `${x.team} acquired ${x.name}${war} from ${x.other} for ${back}`
    }
    case 'declined': return `${x.team} declined ${x.name}’s option${pay}`
    case 'exercised': return `${x.team} exercised ${x.name}’s option${pay}`
    case 'non-tendered': return `${x.team} non-tendered ${x.name}${war}`
    case 'opted-out': return `${x.name} opted out of his ${x.team} deal${war}`
    case 'released': return `${x.team} released ${x.name} to make room on the 40-man`
  }
}

// A payroll change, to the nearest million: +$12M, −$4M, or 0.
function payDelta(d: number) {
  const m = Math.round(d / 1e6)
  return m > 0 ? `+$${m}M` : m < 0 ? `−$${-m}M` : '0'
}

function Results({ sim, teams, pool, manual, onAgain, onChange }: {
  sim: Simulation
  teams: TeamFile[]
  pool: PoolPlayer[]
  manual: Record<string, Move[]>
  onAgain: () => void
  onChange: () => void
}) {
  const [filter, setFilter] = useState('all')
  const [openBids, setOpenBids] = useState<string | null>(null)
  const [copied, setCopied] = useState<'copied' | 'manual' | null>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied('copied')
      setTimeout(() => setCopied(null), 2500)
    } catch {
      setCopied('manual')
    }
  }
  const log = filter === 'all' ? sim.log : sim.log.filter((x) => x.team === filter || (x.other === filter && x.kind !== 'signed')) // not where its departed free agents signed
  const r = sim.teams
  const builderLink = (t: string) => {
    const m = encodeMoves(r[t].moves)
    // The rest of the league's WAR after this offseason, so the Team Builder projects the same record.
    const others = Object.values(r).reduce((n, x) => n + (x.team === t ? 0 : x.warAfter), 0)
    return `/team-builder?team=${t}${m ? `&m=${m}` : ''}&lw=${Math.round(others * 10) / 10}`
  }

  return (
    <div className="space-y-4 pb-12 sm:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonPrimary} onClick={onAgain}>Run again</button>
        <button type="button" className={buttonQuiet} onClick={onChange}>Change plans or moves</button>
        <button type="button" className={buttonQuiet} onClick={copy}>{copied === 'copied' ? 'Link copied' : 'Copy link to this result'}</button>
        <span className="text-[13px] text-[var(--dim)]">Run again keeps the plans and rolls the luck: who signs where can change.</span>
      </div>
      {copied === 'manual' && <p className="break-all text-[13px] text-[var(--dim)]">Copy this link: {typeof window !== 'undefined' ? window.location.href : ''}</p>}

      <Panel title="Projected 2027 standings">
        <div className="grid gap-x-6 border-t border-[var(--rule)] px-4 pb-3 md:grid-cols-2 lg:grid-cols-3">
          {DIVISIONS.map((div) => {
            const rows = [...div.teams].sort((a, b) => r[b].winsAfter - r[a].winsAfter)
            const lead = roundedWins({ wins: r[rows[0]].winsAfter })
            return (
              <div key={div.name} className="pt-3">
                <table className="w-full text-sm">
                  <caption className="mb-1 text-left text-[11px] font-medium uppercase text-[var(--dimmer)]">{div.name}</caption>
                  <thead>
                    <tr className="text-[11px] text-[var(--dimmer)]">
                      <th scope="col" className="pb-1 text-left font-medium">Team</th>
                      <th scope="col" className="pb-1 text-right font-medium">W–L</th>
                      <th scope="col" className="pb-1 text-right font-medium">GB</th>
                      <th scope="col" className="pb-1 text-right font-medium" title="Change in projected wins over the offseason">+/−</th>
                      <th scope="col" className="pb-1 text-right font-medium">Payroll</th>
                      <th scope="col" className="pb-1 pl-2 text-right font-medium" title="Change in 2027 payroll over the offseason">+/−</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule)]">
                    {rows.map((t) => {
                      const d = roundedWins({ wins: r[t].winsAfter }) - roundedWins({ wins: r[t].winsBefore })
                      const gb = lead - roundedWins({ wins: r[t].winsAfter })
                      return (
                        <tr key={t}>
                          <td className="py-1.5">
                            <a href={builderLink(t)} className="flex items-center gap-2 hover:underline" title={`Open the ${TEAM_NAMES[t]} roster in the Team Builder`}>
                              <Logo code={t} />
                              <span>{t}</span>
                              <span className="hidden text-[11px] text-[var(--dimmer)] xl:inline">{ATTITUDES[r[t].attitude].label}</span>
                            </a>
                          </td>
                          <td className="py-1.5 text-right font-mono text-[13px]">{fmtRecord({ wins: r[t].winsAfter })}</td>
                          <td className="py-1.5 text-right font-mono text-[13px] text-[var(--dim)]">{gb === 0 ? '—' : gb}</td>
                          <td className={`py-1.5 text-right font-mono text-[13px] ${d > 0 ? 'text-[var(--text)]' : 'text-[var(--dim)]'}`}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'}</td>
                          <td className="py-1.5 text-right font-mono text-[13px] text-[var(--dim)]">{money(r[t].payrollAfter, 0)}</td>
                          <td className="py-1.5 pl-2 text-right font-mono text-[13px] text-[var(--dim)]">{payDelta(r[t].payrollAfter - r[t].payrollBefore)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
        <p className="border-t border-[var(--rule)] px-4 py-2 text-[11px] text-[var(--dimmer)]">
          <span className="block max-w-[75ch]">The first +/− is the change in projected wins over the offseason, the second the change in payroll, both counted from where each team started, your moves included. A team can lose wins without losing a player: records are scaled so the league plays .500, and once free agents sign, the league has more WAR to share, so each win takes more of it. Click a team to open its new roster in the Team Builder.</span>
        </p>
      </Panel>

      <PositionRanks sim={sim} teams={teams} pool={pool} manual={manual} highlight={filter === 'all' ? null : filter} builderLink={builderLink} />

      <Panel
        title={`Transactions (${log.length})`}
        aside={
          <span className="flex items-center gap-2 text-[13px]">
            <label htmlFor="log-team" className="text-[var(--dim)]">Show</label>
            <select id="log-team" value={filter} onChange={(e) => setFilter(e.target.value)} className={select}>
              <option value="all">All teams</option>
              {Object.entries(TEAM_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </span>
        }
      >
        {PHASES.map((p) => {
          const rows = log.filter((x) => x.phase === p.key)
          if (!rows.length) return null
          return (
            <div key={p.key} className="border-t border-[var(--rule)]">
              <h3 className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase text-[var(--dimmer)]">{p.label}</h3>
              <ul className="divide-y divide-[var(--rule)]">
                {rows.map((x) => {
                  const key = `${x.id}-${x.kind}-${x.team}`
                  const hasBids = x.kind === 'signed' && x.bids != null && x.bids.length > 1
                  return (
                    <li key={key} className="px-4 py-1.5 text-sm">
                      <div className="flex items-start gap-2">
                        <Logo code={x.team} />
                        <span className="min-w-0 flex-1">{sentence(x)}</span>
                        {hasBids && (
                          <button
                            type="button"
                            aria-expanded={openBids === key}
                            onClick={() => setOpenBids(openBids === key ? null : key)}
                            className="shrink-0 text-[11px] text-[var(--dim)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--text)]"
                          >
                            {x.bids!.length} teams bid
                          </button>
                        )}
                      </div>
                      {hasBids && openBids === key && <Bids x={x} attitudes={sim.teams} />}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
        {!log.length && <p className="border-t border-[var(--rule)] px-4 py-3 text-sm text-[var(--dim)]">No moves for this team.</p>}
      </Panel>
    </div>
  )
}

// Who else wanted a free agent: each bidding team, how much he'd have added to its depth
// chart, and how keen it was next to the team that signed him.
// Where every team ranks at each position after the offseason, by depth-chart WAR (the same
// WAR the Team Builder's field diagram shows), with the rank it started from in each tooltip.
type RankColumn = FieldSpot | 'total'
const MOVED = 5 // places a rank must move to get an arrow, so small shuffles don't crowd the table
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

function PositionRanks({ sim, teams, pool, manual, highlight, builderLink }: {
  sim: Simulation
  teams: TeamFile[]
  pool: PoolPlayer[]
  manual: Record<string, Move[]>
  highlight: string | null
  builderLink: (t: string) => string
}) {
  const [show, setShow] = useState<'rank' | 'war'>('rank')
  const [sortBy, setSortBy] = useState<RankColumn>('total')
  const columns: RankColumn[] = [...FIELD_SPOTS, 'total']
  const table = useMemo(() => {
    const wars = (which: 'before' | 'after') => Object.fromEntries(teams.map((t) => {
      // Before: today's roster with the user's moves; after: with the simulation's too.
      const d = teamDepth(buildRoster(t, which === 'after' ? sim.teams[t.team].moves : manual[t.team] ?? [], pool))
      return [t.team, { ...Object.fromEntries(FIELD_SPOTS.map((s) => [s, d.bySpot[s].war])), total: d.total } as Record<RankColumn, number>]
    }))
    const ranks = (w: Record<string, Record<RankColumn, number>>) => Object.fromEntries(columns.map((c) => {
      const order = Object.keys(w).sort((a, b) => w[b][c] - w[a][c])
      return [c, Object.fromEntries(order.map((t, i) => [t, i + 1]))]
    })) as Record<RankColumn, Record<string, number>>
    const after = wars('after')
    const before = wars('before')
    return { after, rankAfter: ranks(after), rankBefore: ranks(before), before }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, teams, pool, manual])
  const rows = Object.keys(table.after).sort((a, b) => table.rankAfter[sortBy][a] - table.rankAfter[sortBy][b])
  const label = (c: RankColumn) => (c === 'total' ? 'Total' : c)
  const name = (c: RankColumn) => (c === 'total' ? 'Total' : SPOT_NAMES[c])

  return (
    <Panel
      title="Position rankings"
      aside={
        <span className="flex items-center gap-1 text-[13px]" role="group" aria-label="Show">
          {(['rank', 'war'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)}
              className={`rounded-md px-2 py-0.5 ${show === v ? 'bg-[var(--text)] text-[var(--panel)]' : 'text-[var(--dim)] hover:text-[var(--text)]'}`}>
              {v === 'rank' ? 'Rank' : 'WAR'}
            </button>
          ))}
        </span>
      }
    >
      <div className="overflow-x-auto border-t border-[var(--rule)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--dimmer)]">
              <th scope="col" className="px-4 py-1.5 text-left font-medium">Team</th>
              {columns.map((c) => (
                <th key={c} scope="col" className="px-1 py-1.5 text-center font-medium" aria-sort={sortBy === c ? 'ascending' : undefined}>
                  <button type="button" onClick={() => setSortBy(c)} title={`Sort by ${name(c).toLowerCase()}`}
                    className={`rounded px-1 ${sortBy === c ? 'font-semibold text-[var(--text)] underline underline-offset-2' : 'hover:text-[var(--text)]'}`}>
                    {label(c)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {rows.map((t) => (
              <tr key={t} className={highlight === t ? 'bg-[var(--accent-dim)]' : undefined}>
                <td className="px-4 py-1">
                  <a href={builderLink(t)} className="flex items-center gap-2 hover:underline" title={`Open the ${TEAM_NAMES[t]} roster in the Team Builder`}>
                    <Logo code={t} />
                    <span>{t}</span>
                  </a>
                </td>
                {columns.map((c) => {
                  const rank = table.rankAfter[c][t]
                  const was = table.rankBefore[c][t]
                  const war = table.after[t][c]
                  // Stronger is redder, like the Team Builder's field diagram; the bottom half stays plain.
                  const tint = Math.max(0, (16 - rank) / 15)
                  return (
                    <td key={c} className="px-0.5 py-0.5 text-center">
                      <span
                        className={`block rounded px-1 py-0.5 font-mono text-[13px] ${c === 'total' ? 'font-semibold' : ''}`}
                        style={{ backgroundColor: tint > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(tint * 30)}%, transparent)` : undefined }}
                        title={`${TEAM_NAMES[t]}, ${name(c).toLowerCase()}: ${fmtWar(war)} WAR, ${ordinal(rank)}${was !== rank ? ` (was ${ordinal(was)} with ${fmtWar(table.before[t][c])})` : ''}`}
                      >
                        {show === 'rank' ? rank : fmtWar(war)}
                        {show === 'rank' && Math.abs(was - rank) >= MOVED && <span className="ml-0.5 text-[11px] text-[var(--dim)]" aria-hidden>{was > rank ? '↑' : '↓'}</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--rule)] px-4 py-2 text-[11px] text-[var(--dimmer)]">
        <span className="block max-w-[75ch]">Each team&apos;s rank among the 30 by projected WAR at each spot, counted like a depth chart (the same WAR as the Team Builder&apos;s field diagram, before scaling). An arrow marks a rank that moved five or more places over the offseason; hover for the WAR and where the team started, your moves included. Click a column to sort, a team to open its roster.</span>
      </p>
    </Panel>
  )
}

function Bids({ x, attitudes }: { x: Transaction; attitudes: Simulation['teams'] }) {
  const bids = x.bids ?? []
  const pushed = x.ask && x.salary && x.salary > x.ask ? Math.round((x.salary / x.ask - 1) * 100) : 0
  return (
    <div className="mb-1.5 ml-7 mt-1.5 rounded-lg border border-[var(--rule)] px-3 py-2">
      <p className="mb-1.5 text-[12px] text-[var(--dim)]">
        Asking price {money(x.ask ?? 0, 1)}.{' '}
        {pushed > 0
          ? `${bids.length} bidders pushed it up ${pushed}%, to ${money(x.salary ?? 0, 1)}.`
          : `He signed for ${money(x.salary ?? 0, 1)}, as high as ${TEAM_NAMES[x.team]} could go.`}
        {' '}The keenest team wins: how much he adds to its roster, times how eager its plan is, with a little luck.
      </p>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-[var(--dimmer)]">
            <th className="py-1 font-normal">Team</th>
            <th className="py-1 text-right font-normal">WAR added</th>
            <th className="w-1/3 py-1 pl-3 font-normal">Interest</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((b, i) => (
            <tr key={b.team} className="border-t border-[var(--rule)]">
              <td className="py-1">
                <span className="flex items-center gap-2">
                  <Logo code={b.team} size="h-4 w-4" />
                  <span className={i === 0 ? 'font-medium' : ''}>{TEAM_NAMES[b.team]}</span>
                  <span className="hidden text-[11px] text-[var(--dimmer)] sm:inline">{ATTITUDES[attitudes[b.team].attitude].label}</span>
                  {i === 0 && <span className="text-[11px] text-[var(--dim)]">signed him</span>}
                </span>
              </td>
              <td className="py-1 text-right font-mono">{fmtWar(b.gain)}</td>
              <td className="py-1 pl-3">
                <span className="block h-1.5 rounded-full bg-[var(--rule)]">
                  <span className={`block h-1.5 rounded-full ${i === 0 ? 'bg-[var(--text)]' : 'bg-[var(--dim)]'}`} style={{ width: `${Math.max(4, b.interest * 100)}%` }} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
