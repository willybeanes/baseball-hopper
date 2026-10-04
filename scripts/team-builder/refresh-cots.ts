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
import { checkTeamSheet, parseTeamSheet, type KnownMismatch, type TeamSheet } from '../../lib/team-builder/cots'
import { MLB_TEAM_IDS, matchPlayer, type RosterPerson } from '../../lib/team-builder/ids'

const OUT_DIR = join(import.meta.dir, '../../public/data/team-builder')
const TIER_STEPS = [20e6, 40e6, 60e6] // gaps above the base line used since 2022
const MAX_UNMATCHED = 15 // more than this many unmatched names means something is broken, not just new
const STATS_API = 'https://statsapi.mlb.com/api/v1'

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

async function statsApi<T>(path: string): Promise<T> {
  const r = await fetch(STATS_API + path, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`MLB stats API ${path} returned HTTP ${r.status}`)
  return r.json() as Promise<T>
}

// Each team's 40-man, everyone it used this season, and its whole organization.
async function teamPool(team: string): Promise<{ pool: RosterPerson[]; fortyMan: Set<number> }> {
  const types = ['40Man', 'fullSeason', 'fullRoster']
  const rosters = await Promise.all(
    types.map((t) => statsApi<{ roster?: { person: RosterPerson }[] }>(`/teams/${MLB_TEAM_IDS[team]}/roster?rosterType=${t}&season=${config.firstYear}`)),
  )
  const people = rosters.map((d) => (d.roster ?? []).map((r) => ({ id: r.person.id, fullName: r.person.fullName })))
  return { pool: people.flat(), fortyMan: new Set(people[0].map((p) => p.id)) }
}

// Everyone who played in the majors this season or last.
async function leaguePool(): Promise<RosterPerson[]> {
  const seasons = [config.firstYear, config.firstYear - 1]
  const lists = await Promise.all(seasons.map((y) => statsApi<{ people: RosterPerson[] }>(`/sports/1/players?season=${y}`)))
  return lists.flatMap((d) => d.people.map((p) => ({ id: p.id, fullName: p.fullName })))
}

async function assignIds(sheets: TeamSheet[]): Promise<{ unmatched: string[]; fuzzy: string[]; stale: string[] }> {
  const league = await leaguePool()
  const known = overrides as Record<string, number>
  const unmatched: string[] = []
  const fuzzy: string[] = []
  const fortyMen = new Map<string, Set<number>>()
  for (const sheet of sheets) {
    const { pool, fortyMan } = await teamPool(sheet.team)
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

      // A sheet that suddenly lost a lot of rows is more likely broken than gutted.
      const prevFile = join(OUT_DIR, 'teams', `${team}.json`)
      if (existsSync(prevFile)) {
        const prev = JSON.parse(readFileSync(prevFile, 'utf8')) as { players: unknown[] }
        if (sheet.players.length < prev.players.length * 0.8) {
          errors.push(`${team}: ${sheet.players.length} players, down from ${prev.players.length} last refresh`)
        }
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

  const base = mode(sheets.map((s) => s.threshold).filter((t): t is number => t != null))
  const meta = {
    sheetsCollected: config.sheetsCollected,
    targetYear: config.targetYear,
    // Cot's carries only the 2027 base line, and only on some sheets. The tiers are derived
    // and are placeholders until a new labor agreement sets real ones.
    taxThreshold: base == null ? null : { base, tiers: TIER_STEPS.map((step) => base + step), derived: true },
    teams: sheets.map((s) => s.team).sort(),
  }

  // Only touch the files when the data itself changed, so a quiet day makes no commit
  // and no redeploy. updatedAt is therefore "when Cot's last changed", not "when we last looked".
  const files = new Map(sheets.map((s) => [join(OUT_DIR, 'teams', `${s.team}.json`), JSON.stringify(s, null, 1) + '\n']))
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
      ? `Updated ${changed.length} of ${sheets.length} teams in public/data/team-builder (base tax line ${base ? `$${base / 1e6}M` : 'not found'}).`
      : `No changes since the last refresh (${prevMeta.updatedAt}).`,
  )
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
