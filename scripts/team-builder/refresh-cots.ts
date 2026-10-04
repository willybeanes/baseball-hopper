// Downloads the 30 Cot's team sheets, checks them, and writes the Team Builder snapshot.
// If any check fails nothing is written, so the last good snapshot stays live.
//
//   bun scripts/team-builder/refresh-cots.ts                 # fetch from Google Sheets
//   bun scripts/team-builder/refresh-cots.ts --from <dir>    # use saved <TEAM>.csv files instead
//   bun scripts/team-builder/refresh-cots.ts --save-raw <dir> # also keep the downloaded CSVs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import config from '../../lib/team-builder/cots-sheets.json'
import overrides from '../../lib/team-builder/id-overrides.json'
import assumptions from '../../lib/team-builder/assumptions.json'
import optionsFile from '../../lib/team-builder/options-2027.json'
import arbFile from '../../lib/team-builder/mlbtr-arb-2027.json'
import faFile from '../../lib/team-builder/mlbtr-fa-2027.json'
import { buildPool } from '../../lib/team-builder/pool'
import type { TeamFile } from '../../lib/team-builder/roster'
import { applyEstimates, type OptionFact } from '../../lib/team-builder/estimates'
import { checkTeamSheet, parseTeamSheet, type KnownMismatch, type TeamSheet } from '../../lib/team-builder/cots'
import { matchPlayer } from '../../lib/team-builder/ids'
import { leaguePool, teamPool } from '../../lib/team-builder/rosters'

const OUT_DIR = join(import.meta.dir, '../../public/data/team-builder')
const TIER_STEPS = [20e6, 40e6, 60e6] // gaps above the base line used since 2022
const MAX_UNMATCHED = 15 // more than this many unmatched names means something is broken, not just new

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const fromDir = arg('--from')
const rawDir = arg('--save-raw')

async function download(team: string, id: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
      const text = await r.text()
      if (r.ok && !text.trimStart().startsWith('<')) return text
      lastError = r.ok ? 'got a web page instead of CSV (sheet private, moved or deleted?)' : `HTTP ${r.status}`
    } catch (e) {
      lastError = (e as Error).message
    }
    await new Promise((res) => setTimeout(res, 2000 * attempt))
  }
  throw new Error(`${team}: download failed — ${lastError}`)
}

async function assignIds(sheets: TeamSheet[]): Promise<{ unmatched: string[]; fuzzy: string[]; stale: string[] }> {
  const league = await leaguePool(config.firstYear)
  const known = overrides as Record<string, number>
  const unmatched: string[] = []
  const fuzzy: string[] = []
  const fortyMen = new Map<string, Set<number>>()
  for (const sheet of sheets) {
    const { pool, fortyMan } = await teamPool(sheet.team, config.firstYear)
    fortyMen.set(sheet.team, fortyMan)
    const everyone = [...pool, ...league]
    for (const p of sheet.players) {
      const m = matchPlayer(p.name, pool, league, known[`${sheet.team}|${p.sheetName}`])
      if (!m) { unmatched.push(`${sheet.team}|${p.sheetName}`); continue }
      p.mlbamId = m.id
      if (m.how !== 'team' && m.how !== 'override') {
        fuzzy.push(`${sheet.team} ${p.name} -> ${everyone.find((x) => x.id === m.id)?.fullName} (${m.id}, ${m.how})`)
      }
    }
  }

  // Cot's sometimes leaves a moved player on his old team's roster too. When one player is
  // on two sheets, keep him where MLB's 40-man says he is and drop the stale row.
  const stale: string[] = []
  const teamsById = new Map<number, string[]>()
  for (const s of sheets) for (const p of s.players) if (p.mlbamId) teamsById.set(p.mlbamId, [...(teamsById.get(p.mlbamId) ?? []), s.team])
  for (const [id, teams] of teamsById) {
    if (teams.length < 2) continue
    const keep = teams.filter((t) => fortyMen.get(t)?.has(id))
    if (keep.length !== 1) { stale.push(`${id} is on ${teams.join(' and ')} — left on both, MLB's 40-man doesn't settle it`); continue }
    for (const t of teams.filter((t) => t !== keep[0])) {
      const sheet = sheets.find((s) => s.team === t)!
      const p = sheet.players.find((x) => x.mlbamId === id)!
      sheet.players = sheet.players.filter((x) => x !== p)
      stale.push(`${p.name} dropped from ${t} (MLB has him on ${keep[0]}'s 40-man)`)
    }
  }
  return { unmatched, fuzzy, stale }
}

function mode(values: number[]): number | null {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

async function main() {
  const teams = Object.entries(config.teams)
  const known = config.knownMismatches as unknown as Record<string, { payroll?: KnownMismatch; tax?: KnownMismatch }>
  const errors: string[] = []
  const sheets: TeamSheet[] = []

  const csvs = await Promise.all(
    teams.map(async ([team, id]) => {
      try {
        const text = fromDir ? readFileSync(join(fromDir, `${team}.csv`), 'utf8') : await download(team, id)
        if (rawDir) { mkdirSync(rawDir, { recursive: true }); writeFileSync(join(rawDir, `${team}.csv`), text) }
        return [team, text] as const
      } catch (e) {
        errors.push((e as Error).message)
        return [team, null] as const
      }
    }),
  )

  for (const [team, text] of csvs) {
    if (text == null) continue
    try {
      const sheet = parseTeamSheet(team, text, config.firstYear, config.targetYear)
      errors.push(...checkTeamSheet(sheet, known[team]))

      const prevFile = join(OUT_DIR, 'teams', `${team}.json`)
      if (existsSync(prevFile)) {
        const prev = JSON.parse(readFileSync(prevFile, 'utf8')) as { players: { sheetName: string; salaryPrevYear: number | null }[]; sheetFirstYear?: number }
        // A sheet that suddenly lost a lot of rows is more likely broken than gutted — except on
        // the day Cot's rolls it over to the new season, when last season's free agents drop off.
        const justRolled = sheet.sheetFirstYear !== (prev.sheetFirstYear ?? config.firstYear)
        if (!justRolled && sheet.players.length < prev.players.length * 0.8) {
          errors.push(`${team}: ${sheet.players.length} players, down from ${prev.players.length} last refresh`)
        }
        // A rolled-over sheet no longer shows last season's pay; keep it from the last snapshot.
        const prevPay = new Map(prev.players.map((p) => [p.sheetName, p.salaryPrevYear]))
        for (const p of sheet.players) if (p.salaryPrevYear == null) p.salaryPrevYear = prevPay.get(p.sheetName) ?? null
      }
      sheets.push(sheet)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }

  let ids = { unmatched: [] as string[], fuzzy: [] as string[], stale: [] as string[] }
  if (!errors.length) {
    try {
      ids = await assignIds(sheets)
      if (ids.unmatched.length > MAX_UNMATCHED) errors.push(`${ids.unmatched.length} players couldn't be matched to an MLBAM id`)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }

  if (errors.length) {
    console.error(`Refresh stopped, nothing written (${errors.length} problem${errors.length > 1 ? 's' : ''}):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  for (const s of sheets) applyEstimates(s, optionsFile.options as OptionFact[], arbFile.players, assumptions)

  const base = mode(sheets.map((s) => s.threshold).filter((t): t is number => t != null))
  const sheetTiers = sheets.find((s) => s.tiers && s.tiers[0] === base)?.tiers ?? null
  const meta = {
    sheetsCollected: config.sheetsCollected,
    targetYear: config.targetYear,
    // Placeholders either way until a new labor agreement sets real ones.
    // Once Cot's rolls sheets over they spell out the tiers; until then they're derived.
    taxThreshold: base == null ? null : sheetTiers ? { base, tiers: sheetTiers.slice(1), derived: false } : { base, tiers: TIER_STEPS.map((step) => base + step), derived: true },
    teams: sheets.map((s) => s.team).sort(),
    assumptions: { leagueMinimum: assumptions.leagueMinimum, roughArbitration: assumptions.roughArbitration },
    sources: {
      contracts: "Cot's Baseball Contracts",
      arbitration: arbFile.source,
      options: { compiled: optionsFile.compiled, ...optionsFile.sources },
      freeAgents: faFile.source,
    },
  }

  // Only touch the files when the data itself changed, so a quiet day makes no commit
  // and no redeploy. updatedAt is therefore "when Cot's last changed", not "when we last looked".
  const files = new Map(sheets.map((s) => [join(OUT_DIR, 'teams', `${s.team}.json`), JSON.stringify(s, null, 1) + '\n']))
  // One file with every player a user could add (free agents and other teams' players).
  const pool = buildPool(sheets as unknown as TeamFile[], faFile.players)
  files.set(join(OUT_DIR, 'pool.json'), JSON.stringify(pool) + '\n')
  const metaFile = join(OUT_DIR, 'meta.json')
  const prevMeta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null
  const changed = [...files].filter(([f, text]) => !existsSync(f) || readFileSync(f, 'utf8') !== text)
  const metaChanged = !prevMeta || JSON.stringify({ ...prevMeta, updatedAt: undefined }) !== JSON.stringify({ ...meta, updatedAt: undefined })

  if (changed.length || metaChanged) {
    mkdirSync(join(OUT_DIR, 'teams'), { recursive: true })
    for (const [f, text] of changed) writeFileSync(f, text)
    writeFileSync(metaFile, JSON.stringify({ updatedAt: new Date().toISOString(), ...meta }, null, 2) + '\n')
  }

  const count = (status: string) => sheets.reduce((n, s) => n + s.players.filter((p) => p.status === status).length, 0)
  console.log(
    changed.length || metaChanged
      ? `Updated ${changed.length} files (${sheets.length} teams + pool of ${pool.length} players) in public/data/team-builder (base tax line ${base ? `$${base / 1e6}M` : 'not found'}).`
      : `No changes since the last refresh (${prevMeta.updatedAt}).`,
  )
  const by = (src: string) => sheets.reduce((n, s) => n + s.players.filter((p) => (p as { salarySource?: string }).salarySource === src).length, 0)
  console.log(`2027 salaries: ${['cots', 'option', 'mlbtr-arb', 'rough-arb', 'minimum', 'unknown'].map((s) => `${by(s)} ${s}`).join(', ')}`)
  const unknown = sheets.flatMap((s) => s.players.filter((p) => (p as { salarySource?: string }).salarySource === 'unknown').map((p) => `${s.team} ${p.name}`))
  if (unknown.length) console.log(`Options with no known salary (left out of payroll): ${unknown.join(', ')}`)
  console.log(`Players: ${['signed', 'arb', 'prearb', 'option', 'fa', 'unknown'].map((s) => `${count(s)} ${s}`).join(', ')}`)
  console.log(`MLBAM ids: ${count('signed') + count('arb') + count('prearb') + count('option') + count('fa') + count('unknown') - ids.unmatched.length} matched, ${ids.unmatched.length} unmatched.`)
  if (ids.stale.length) console.log(`Same player on two sheets:\n  ${ids.stale.join('\n  ')}`)
  if (ids.fuzzy.length) console.log(`Matched on a looser rule (worth a glance):\n  ${ids.fuzzy.join('\n  ')}`)
  if (ids.unmatched.length) {
    console.log(`Unmatched — add to lib/team-builder/id-overrides.json:\n  ${ids.unmatched.join('\n  ')}`)
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = ['### Team Builder: players without an MLBAM id', '', ...ids.unmatched.map((u) => `- \`${u}\``)]
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' })
    }
  }
}

main()
