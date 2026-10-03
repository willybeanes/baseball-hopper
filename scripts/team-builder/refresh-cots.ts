// Downloads the 30 Cot's team sheets, checks them, and writes the Team Builder snapshot.
// If any check fails nothing is written, so the last good snapshot stays live.
//
//   bun scripts/team-builder/refresh-cots.ts                 # fetch from Google Sheets
//   bun scripts/team-builder/refresh-cots.ts --from <dir>    # use saved <TEAM>.csv files instead
//   bun scripts/team-builder/refresh-cots.ts --save-raw <dir> # also keep the downloaded CSVs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import config from '../../lib/team-builder/cots-sheets.json'
import { checkTeamSheet, parseTeamSheet, type KnownMismatch, type TeamSheet } from '../../lib/team-builder/cots'

const OUT_DIR = join(import.meta.dir, '../../public/data/team-builder')
const TIER_STEPS = [20e6, 40e6, 60e6] // gaps above the base line used since 2022

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

  if (errors.length) {
    console.error(`Refresh stopped, nothing written (${errors.length} problem${errors.length > 1 ? 's' : ''}):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  const base = mode(sheets.map((s) => s.threshold).filter((t): t is number => t != null))
  const meta = {
    refreshedAt: new Date().toISOString(),
    sheetsCollected: config.sheetsCollected,
    targetYear: config.targetYear,
    // Cot's carries only the 2027 base line, and only on some sheets. The tiers are derived
    // and are placeholders until a new labor agreement sets real ones.
    taxThreshold: base == null ? null : { base, tiers: TIER_STEPS.map((step) => base + step), derived: true },
    teams: sheets.map((s) => s.team).sort(),
  }

  mkdirSync(join(OUT_DIR, 'teams'), { recursive: true })
  for (const s of sheets) writeFileSync(join(OUT_DIR, 'teams', `${s.team}.json`), JSON.stringify(s, null, 1) + '\n')
  writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

  const count = (status: string) => sheets.reduce((n, s) => n + s.players.filter((p) => p.status === status).length, 0)
  console.log(`Wrote ${sheets.length} teams to public/data/team-builder (base tax line ${base ? `$${base / 1e6}M` : 'not found'}).`)
  console.log(`Players: ${['signed', 'arb', 'prearb', 'option', 'fa', 'unknown'].map((s) => `${count(s)} ${s}`).join(', ')}`)
}

main()
