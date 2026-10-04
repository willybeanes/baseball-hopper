// Imports MLB Trade Rumors' list of players projected to become free agents after the season.
// It fills the free-agent pool with players Cot's no longer lists (released or outrighted in-season).
// MLBTR updates the list as moves happen; re-run this to pick up changes.
//
//   bun scripts/team-builder/import-mlbtr-fa.ts [article url]

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import config from '../../lib/team-builder/cots-sheets.json'
import { matchPlayer } from '../../lib/team-builder/ids'
import { leaguePool, searchMajorLeaguer } from '../../lib/team-builder/rosters'

const URL = process.argv[2] ?? 'https://www.mlbtraderumors.com/2025/08/2026-27-mlb-free-agents.html'
const OUT = join(import.meta.dir, `../../lib/team-builder/mlbtr-fa-${config.targetYear}.json`)

const HEADINGS: Record<string, string> = {
  Catchers: 'c', 'First Basemen': '1b', 'Second Basemen': '2b', Shortstops: 'ss', 'Third Basemen': '3b',
  'Left Fielders': 'lf', 'Center Fielders': 'cf', 'Right Fielders': 'rf', 'Designated Hitters': 'dh',
  'Starting Pitchers': 'sp', 'Right-Handed Relievers': 'rhp', 'Left-Handed Relievers': 'lhp',
}

async function main() {
  const r = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } })
  if (!r.ok) throw new Error(`MLBTR returned HTTP ${r.status}`)
  const html = await r.text()
  const start = html.indexOf('class="entry-content')
  const body = html.slice(start, html.indexOf('</article>', start))
  const lines = body
    .replace(/<(p|li|h\d|br)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8217;|&rsquo;/g, '’').replace(/&#8211;|&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&nbsp;| /g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean)

  const updated = lines.find((l) => /^Updated /.test(l))?.replace('Updated ', '') ?? null
  const seen = new Map<string, { name: string; age: number; positions: string[]; note?: string }>()
  let pos: string | null = null
  for (const line of lines) {
    if (HEADINGS[line]) { pos = HEADINGS[line]; continue }
    if (!pos) continue
    const m = line.match(/^(.+?) \((\d{2})\)(?:\s*[–-]\s*(.+))?$/)
    if (!m) { if (/^Share$/.test(line)) break; continue }
    const [, name, age, note] = m
    const prev = seen.get(name)
    if (prev) prev.positions.push(pos) // listed at two positions
    else seen.set(name, { name, age: Number(age), positions: [pos], ...(note ? { note } : {}) })
  }
  if (seen.size < 150) throw new Error(`Only ${seen.size} players found — the article layout may have changed`)

  // No team to search within: try everyone on the Cot's sheets (already matched to ids), then
  // the league-wide list. Only a single clear match counts.
  const teamsDir = join(import.meta.dir, '../../public/data/team-builder/teams')
  const onSheets = readdirSync(teamsDir).flatMap((f) =>
    (JSON.parse(readFileSync(join(teamsDir, f), 'utf8')).players as { mlbamId?: number; name: string }[])
      .filter((p) => p.mlbamId)
      .map((p) => ({ id: p.mlbamId!, fullName: p.name })),
  )
  const league = await leaguePool(config.firstYear)
  const players = await Promise.all(
    [...seen.values()].map(async (p) => ({ ...p, mlbamId: matchPlayer(p.name, onSheets, league)?.id ?? (await searchMajorLeaguer(p.name)) })),
  )
  const unmatched = players.filter((p) => p.mlbamId == null)

  writeFileSync(
    OUT,
    JSON.stringify({ source: { title: `${config.targetYear - 1}-${String(config.targetYear).slice(2)} MLB Free Agents`, site: 'MLB Trade Rumors', url: URL, updated, importedAt: new Date().toISOString().slice(0, 10) }, players }, null, 1) + '\n',
  )
  console.log(`Saved ${players.length} free agents (MLBTR list updated ${updated}).`)
  if (unmatched.length) console.log(`No MLBAM id for ${unmatched.length}: ${unmatched.map((p) => p.name).join(', ')}`)
}

main()
