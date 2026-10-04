// One-time import of MLB Trade Rumors' projected arbitration salaries (Matt Swartz's model).
// Re-run only if MLBTR revises the article; the daily refresh reads the saved file.
//
//   bun scripts/team-builder/import-mlbtr-arb.ts [article url]

import { writeFileSync } from 'fs'
import { join } from 'path'
import config from '../../lib/team-builder/cots-sheets.json'
import { matchPlayer } from '../../lib/team-builder/ids'
import { leaguePool, teamPool } from '../../lib/team-builder/rosters'

const URL = process.argv[2] ?? 'https://www.mlbtraderumors.com/2026/10/projected-arbitration-salaries-for-2027.html'
const OUT = join(import.meta.dir, `../../lib/team-builder/mlbtr-arb-${config.targetYear}.json`)

const TEAM_CODES: Record<string, string> = {
  'Arizona Diamondbacks': 'ARI', Athletics: 'ATH', 'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CWS', 'Cincinnati Reds': 'CIN',
  'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL', 'Detroit Tigers': 'DET', 'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC', 'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN', 'New York Mets': 'NYM', 'New York Yankees': 'NYY',
  'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD', 'Seattle Mariners': 'SEA',
  'San Francisco Giants': 'SF', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB', 'Texas Rangers': 'TEX',
  'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH',
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/&#8211;/g, '–').trim()

// "$4.1MM" -> 4_100_000, "$900K" -> 900_000
const amount = (s: string) => Math.round(parseFloat(s.replace(/[$,]/g, '')) * (/MM$/.test(s) ? 1e6 : 1e3))

async function main() {
  const r = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } })
  if (!r.ok) throw new Error(`MLBTR returned HTTP ${r.status}`)
  const html = await r.text()

  const rows: { team: string; name: string; mls: number; salary: number; note?: string }[] = []
  const errors: string[] = []
  // Each team is "<p>Team Name (N)</p>" followed by a <ul> of N players.
  const blocks = [...html.matchAll(/<p>(?:(?!<\/p>).)*?>([A-Z][A-Za-z. ]+) \((\d+)\)<(?:(?!<\/p>).)*<\/p>\s*<ul>([\s\S]*?)<\/ul>/g)]
  for (const [, teamName, count, list] of blocks) {
    const team = TEAM_CODES[teamName.trim()]
    if (!team) continue
    const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]))
    for (const item of items) {
      const m = item.match(/^(.+?) \((\d+\.\d{3})\): (\$[\d.,]+(?:MM|K))\s*(?:\((.+)\))?\s*$/)
      if (!m) { errors.push(`${team}: couldn't read "${item}"`); continue }
      rows.push({ team, name: m[1].trim(), mls: Number(m[2]), salary: amount(m[3]), ...(m[4] ? { note: m[4] } : {}) })
    }
    if (items.length !== Number(count)) errors.push(`${team}: heading says ${count} players, found ${items.length}`)
  }
  const teamsFound = new Set(rows.map((x) => x.team))
  if (teamsFound.size !== 30) errors.push(`found ${teamsFound.size} teams, expected 30`)

  // Match to MLBAM ids the same way the Cot's refresh does.
  const league = await leaguePool(config.firstYear)
  const pools = new Map(await Promise.all([...teamsFound].map(async (t) => [t, (await teamPool(t, config.firstYear)).pool] as const)))
  const players = rows.map((row) => ({ ...row, mlbamId: matchPlayer(row.name, pools.get(row.team)!, league)?.id ?? null }))
  const unmatched = players.filter((p) => p.mlbamId == null)

  if (errors.length) {
    console.error(`Import stopped, nothing written:\n  ${errors.join('\n  ')}`)
    process.exit(1)
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: {
          title: `Projected Arbitration Salaries For ${config.targetYear}`,
          site: 'MLB Trade Rumors',
          author: 'Matt Swartz',
          url: URL,
          importedAt: new Date().toISOString().slice(0, 10),
        },
        players,
      },
      null,
      1,
    ) + '\n',
  )
  console.log(`Saved ${players.length} players from ${teamsFound.size} teams to ${OUT.split('/baseball-hopper/')[1]}.`)
  if (unmatched.length) console.log(`No MLBAM id for ${unmatched.length}:\n  ${unmatched.map((p) => `${p.team} ${p.name}`).join('\n  ')}`)
}

main()
