// Run the offseason simulation many times and write the results out for analysis.
//
//   bun scripts/team-builder/simulate-many.ts --runs 500
//   bun scripts/team-builder/simulate-many.ts --runs 500 --from HOU --m redgf.adxst-1p4
//   bun scripts/team-builder/simulate-many.ts --link 'https://baseballhopper.com/team-builder/simulate?from=HOU&a=...&mm=...'
//
// Options:
//   --runs N      how many runs (default 500)
//   --seed N      seed of the first run; run i uses seed + i (default 1)
//   --link URL    take plans and moves from a simulate page link (its seed is ignored)
//   --from TEAM   the team whose Team Builder moves --m carries, as on the page
//   --m TEXT      that team's moves (the Team Builder's m= parameter)
//   --mm TEXT     moves for any teams (the simulate page's mm= parameter)
//   --a TEXT      every team's plan (the simulate page's a= parameter); default: suggested plans
//   --talent-sd N how far off a projection can be, in wins (default season.talentSd, 5)
//   --out DIR     where to write (default sim-results/<date-time>)
//
// Uses the data in public/data/team-builder, the copy the daily job commits; pull first for
// today's. The same plans, moves and seed give exactly what the page shows: each run's link
// is in runs.csv.
//
// After each offseason the 2027 season and postseason are played out (lib/team-builder/season.ts)
// from the projected records, which is what gives division, playoff and title odds. The page
// shows only the projections; the played season is here only.
//
// Writes:
//   runs.csv          one row per run: seed, the page link that reproduces it, the champion
//   teams.csv         one row per team per run: plan, projected wins, payroll, budget, moves,
//                     then the played season: record, division title, playoff seed, how far
//   transactions.csv  every move of every run
//   summary.txt       per team: projected and played wins, odds of the division, playoffs,
//                     pennant and title; where free agents sign; who gets traded

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import assumptions from '../../lib/team-builder/assumptions.json'
import type { Move } from '../../lib/team-builder/moves'
import { ATTITUDES, defaultAttitudes, simulateOffseason, type Attitude, type Simulation } from '../../lib/team-builder/offseason'
import type { PoolPlayer } from '../../lib/team-builder/pool'
import type { Meta, TeamFile } from '../../lib/team-builder/roster'
import { ROUNDS, SEASON, simulateSeason } from '../../lib/team-builder/season'
import { decodeAttitudes, decodeMoves, decodeTeamMoves, encodeAttitudes, encodeSeed, encodeTeamMoves } from '../../lib/team-builder/share'
import { DIVISIONS, TEAM_NAMES } from '../../lib/team-builder/teams'

export interface BatchOptions {
  runs: number
  seed: number
  attitudes: Record<string, string> // only the teams the user set; the rest get suggested plans
  manual: Record<string, Move[]>
  from: string | null
  out: string | null
  talentSd: number
}

// Reads the command line. Plans and moves can come from a page link, flags, or both (flags win).
export function parseArgs(argv: string[]): BatchOptions {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) throw new Error(`Unexpected argument: ${k}`)
    const v = argv[i + 1]
    if (v == null || v.startsWith('--')) throw new Error(`${k} needs a value`)
    flags[k.slice(2)] = v
    i++
  }
  const known = new Set(['runs', 'seed', 'link', 'from', 'm', 'mm', 'a', 'out', 'talent-sd'])
  for (const k of Object.keys(flags)) if (!known.has(k)) throw new Error(`Unknown option --${k}`)
  const link = flags.link ? new URL(flags.link, 'https://baseballhopper.com').searchParams : new URLSearchParams()
  const get = (k: string) => flags[k] ?? link.get(k)

  const runs = Number(flags.runs ?? 500)
  const seed = Number(flags.seed ?? 1)
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a whole number of 1 or more')
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be a whole number from 0 to 4294967295')
  const talentSd = Number(flags['talent-sd'] ?? SEASON.talentSd)
  if (!Number.isFinite(talentSd) || talentSd < 0) throw new Error('--talent-sd must be 0 or more')
  const fromRaw = get('from')?.toUpperCase() ?? null
  if (fromRaw && !TEAM_NAMES[fromRaw]) throw new Error(`Unknown team: ${fromRaw}`)

  // As on the page: mm= for any teams, plus the from team's carried-in Team Builder moves.
  const manual = decodeTeamMoves(get('mm'))
  const carried = decodeMoves(get('m'))
  if (fromRaw && carried.length && !manual[fromRaw]) manual[fromRaw] = carried
  return { runs, seed, attitudes: decodeAttitudes(get('a')), manual, from: fromRaw, out: flags.out ?? null, talentSd }
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',')
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`
const M = (n: number) => `$${(n / 1e6).toFixed(1)}M`

function loadData(root: string) {
  const dir = join(root, 'public/data/team-builder')
  const read = <T>(f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T
  return {
    meta: read<Meta>('meta.json'),
    pool: read<PoolPlayer[]>('pool.json'),
    teams: Object.keys(TEAM_NAMES).map((t) => read<TeamFile>(`teams/${t}.json`)),
  }
}

async function main() {
  let opts: BatchOptions
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`${(e as Error).message}\nUsage: bun scripts/team-builder/simulate-many.ts [--runs 500] [--seed 1] [--link URL] [--from TEAM --m MOVES] [--mm MOVES] [--a PLANS] [--talent-sd 5] [--out DIR]`)
    process.exit(1)
  }
  const root = join(import.meta.dir, '../..')
  const { meta, pool, teams } = loadData(root)
  const attitudes = { ...defaultAttitudes(teams, pool), ...opts.attitudes } as Record<string, Attitude>
  const perWin = assumptions.dollarsPerWar.value
  const minimum = meta.assumptions.leagueMinimum.value ?? 780_000
  const out = opts.out ?? join('sim-results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))
  mkdirSync(out, { recursive: true })

  const moveCount = Object.values(opts.manual).reduce((n, m) => n + m.length, 0)
  console.log(`Data from ${meta.updatedAt}; ${opts.runs} runs from seed ${opts.seed}; ${moveCount} move${moveCount === 1 ? '' : 's'} of yours; projections off by up to ±${opts.talentSd} wins (1 SD).`)

  // The page link for a run, so any run can be opened and looked at.
  const linkBase = new URLSearchParams()
  if (opts.from) linkBase.set('from', opts.from)
  linkBase.set('a', encodeAttitudes(attitudes))
  const mm = encodeTeamMoves(opts.manual)
  if (mm) linkBase.set('mm', mm)
  const linkFor = (seed: number) => {
    const q = new URLSearchParams(linkBase)
    q.set('s', encodeSeed(seed))
    return `https://baseballhopper.com/team-builder/simulate?${q.toString()}`
  }

  const runsCsv = [csvRow(['run', 'seed', 'link', 'champion'])]
  const teamsCsv = [csvRow(['run', 'seed', 'team', 'division', 'plan', 'wins_before', 'wins_after', 'win_change', 'war_before', 'war_after', 'payroll_before', 'payroll_after', 'budget', 'moves', 'projected_division_rank', 'season_wins', 'season_losses', 'won_division', 'playoff_seed', 'postseason'])]
  const txCsv = [csvRow(['run', 'seed', 'phase', 'kind', 'team', 'other_team', 'player_id', 'player', 'war', 'salary', 'asking_price', 'bidders', 'prospects'])]

  // Running totals for the summary.
  const wins = new Map<string, number[]>()
  const played = new Map<string, number[]>()
  const odds = new Map<string, { division: number; playoffs: number; pennant: number; title: number }>()
  const moves = new Map<string, number>()
  const payroll = new Map<string, number>()
  const signings = new Map<number, { name: string; war: number; teams: Map<string, number>; salary: number; count: number }>()
  const trades = new Map<number, { name: string; count: number; buyers: Map<string, number> }>()
  const division = new Map(DIVISIONS.flatMap((d) => d.teams.map((t) => [t, d.name] as const)))

  const t0 = performance.now()
  for (let i = 0; i < opts.runs; i++) {
    const seed = (opts.seed + i) >>> 0
    const sim: Simulation = simulateOffseason({ teams, pool, attitudes, manual: opts.manual, seed, perWin, minimum })
    // The season gets its own random numbers, so the offseason still matches the page's link.
    const season = new Map(simulateSeason(Object.fromEntries(Object.entries(sim.teams).map(([t, r]) => [t, r.winsAfter])), (Math.imul(seed, 2654435761) ^ 0x5eed) >>> 0, opts.talentSd).map((r) => [r.team, r]))
    runsCsv.push(csvRow([i + 1, seed, linkFor(seed), [...season.values()].find((r) => r.round === 'champion')!.team]))

    const ranks = new Map<string, number>()
    for (const d of DIVISIONS) {
      const order = [...d.teams].sort((a, b) => sim.teams[b].winsAfter - sim.teams[a].winsAfter)
      order.forEach((t, k) => ranks.set(t, k + 1))
    }
    const moveTally = new Map<string, number>()
    for (const x of sim.log) moveTally.set(x.team, (moveTally.get(x.team) ?? 0) + 1)
    for (const [code, r] of Object.entries(sim.teams)) {
      ;(wins.get(code) ?? wins.set(code, []).get(code)!).push(r.winsAfter)
      moves.set(code, (moves.get(code) ?? 0) + (moveTally.get(code) ?? 0))
      payroll.set(code, (payroll.get(code) ?? 0) + r.payrollAfter)
      const p = season.get(code)!
      ;(played.get(code) ?? played.set(code, []).get(code)!).push(p.wins)
      const o = odds.get(code) ?? odds.set(code, { division: 0, playoffs: 0, pennant: 0, title: 0 }).get(code)!
      const reached = ROUNDS.indexOf(p.round)
      o.division += p.divisionWinner ? 1 : 0
      o.playoffs += reached > 0 ? 1 : 0
      o.pennant += reached >= ROUNDS.indexOf('worldseries') ? 1 : 0
      o.title += p.round === 'champion' ? 1 : 0
      teamsCsv.push(csvRow([i + 1, seed, code, division.get(code), ATTITUDES[r.attitude].label, round(r.winsBefore, 1), round(r.winsAfter, 1), round(r.winsAfter - r.winsBefore, 1),
        round(r.warBefore, 1), round(r.warAfter, 1), r.payrollBefore, r.payrollAfter, r.budget, moveTally.get(code) ?? 0, ranks.get(code),
        p.wins, p.losses, p.divisionWinner ? 1 : 0, p.seed ?? '', p.round]))
    }
    for (const x of sim.log) {
      txCsv.push(csvRow([i + 1, seed, x.phase, x.kind, x.team, x.other ?? '', x.id, x.name, x.war, x.salary, x.ask ?? '', x.bidders ?? '',
        (x.prospects ?? []).map((p) => p.name).join('; ')]))
      if (x.kind === 'signed') {
        const s = signings.get(x.id) ?? signings.set(x.id, { name: x.name, war: x.war ?? 0, teams: new Map(), salary: 0, count: 0 }).get(x.id)!
        s.teams.set(x.team, (s.teams.get(x.team) ?? 0) + 1)
        s.salary += x.salary ?? 0
        s.count++
      } else if (x.kind === 'traded') {
        const t = trades.get(x.id) ?? trades.set(x.id, { name: x.name, count: 0, buyers: new Map() }).get(x.id)!
        t.count++
        t.buyers.set(x.team, (t.buyers.get(x.team) ?? 0) + 1)
      }
    }
    if ((i + 1) % 50 === 0 || i + 1 === opts.runs) {
      const secs = (performance.now() - t0) / 1000
      process.stdout.write(`\r  ${i + 1} / ${opts.runs} runs (${secs.toFixed(0)}s)`)
    }
  }
  process.stdout.write('\n')

  // Summary.
  const N = opts.runs
  const lines: string[] = []
  lines.push(`${N} offseasons and 2027 seasons, seeds ${opts.seed}–${opts.seed + N - 1}`)
  lines.push(`proj = projected wins after the offseason; wins = played seasons (projections off by ±${opts.talentSd} wins, 1 SD, plus game luck)`)
  lines.push(`Moves of yours: ${moveCount ? Object.entries(opts.manual).map(([t, m]) => `${t} ${m.length}`).join(', ') : 'none'}`)
  lines.push('')
  for (const d of DIVISIONS) {
    lines.push(d.name)
    lines.push(`  ${'team'.padEnd(5)}${'plan'.padEnd(15)}${'proj'.padStart(6)}${'wins'.padStart(6)}${'10th-90th'.padStart(11)}${'div'.padStart(6)}${'playoffs'.padStart(10)}${'pennant'.padStart(9)}${'title'.padStart(7)}${'payroll'.padStart(10)}${'moves'.padStart(7)}`)
    const avg = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length
    const rows = d.teams.map((t) => {
      const w = [...played.get(t)!].sort((a, b) => a - b)
      const q = (p: number) => w[Math.min(w.length - 1, Math.floor(p * w.length))]
      return { t, proj: avg(wins.get(t)!), avg: avg(w), lo: q(0.1), hi: q(0.9), o: odds.get(t)! }
    }).sort((a, b) => b.proj - a.proj)
    for (const r of rows) {
      lines.push(`  ${r.t.padEnd(5)}${ATTITUDES[attitudes[r.t]].label.padEnd(15)}${r.proj.toFixed(1).padStart(6)}${r.avg.toFixed(1).padStart(6)}${`${r.lo}-${r.hi}`.padStart(11)}${pct(r.o.division, N).padStart(6)}${pct(r.o.playoffs, N).padStart(10)}${pct(r.o.pennant, N).padStart(9)}${pct(r.o.title, N).padStart(7)}${M((payroll.get(r.t) ?? 0) / N).padStart(10)}${((moves.get(r.t) ?? 0) / N).toFixed(1).padStart(7)}`)
    }
    lines.push('')
  }
  lines.push('Where the top free agents sign (share of runs, average salary)')
  const fas = pool.filter((e) => e.kind === 'fa' && !Object.values(opts.manual).some((ms) => ms.some((m) => m.id === e.mlbamId)))
    .sort((a, b) => (b.war ?? 0) - (a.war ?? 0)).slice(0, 40)
  for (const e of fas) {
    const s = signings.get(e.mlbamId)
    const where = s ? [...s.teams].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${t} ${pct(n, N)}`).join(', ') : 'never signs'
    lines.push(`  ${`${e.name} (${(e.war ?? 0).toFixed(1)})`.padEnd(30)}${s ? `${pct(s.count, N).padStart(5)} signed, ${M(s.salary / s.count).padStart(7)}` : ''.padStart(22)}  ${where}`)
  }
  lines.push('')
  lines.push('Most often traded')
  for (const t of [...trades.values()].sort((a, b) => b.count - a.count).slice(0, 20)) {
    lines.push(`  ${t.name.padEnd(26)}${pct(t.count, N).padStart(5)}  to ${[...t.buyers].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b, n]) => `${b} ${pct(n, N)}`).join(', ')}`)
  }

  writeFileSync(join(out, 'runs.csv'), runsCsv.join('\n') + '\n')
  writeFileSync(join(out, 'teams.csv'), teamsCsv.join('\n') + '\n')
  writeFileSync(join(out, 'transactions.csv'), txCsv.join('\n') + '\n')
  writeFileSync(join(out, 'summary.txt'), lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  console.log(`\nWrote ${out}/: runs.csv, teams.csv (${teamsCsv.length - 1} rows), transactions.csv (${txCsv.length - 1} rows), summary.txt`)
}

if (import.meta.main) await main()
