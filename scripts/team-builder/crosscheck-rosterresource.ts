// Compares each team's default 2027 roster (from the snapshot the refresh just wrote) with
// FanGraphs' RosterResource 40-man, and lists the differences in the run summary and in
// public/data/team-builder/crosscheck.json. Report only: it never changes the roster data.
//
//   bun scripts/team-builder/crosscheck-rosterresource.ts

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defaultRoster, type TeamFile } from '../../lib/team-builder/roster'
import { compareRoster, fetchTeam, FG_TEAM_IDS, type TeamCheck } from '../../lib/team-builder/rosterresource'

const DIR = join(import.meta.dir, '../../public/data/team-builder')
const OUT = join(DIR, 'crosscheck.json')

const teams = Object.keys(FG_TEAM_IDS).sort()
const results: Record<string, TeamCheck> = {}
const failed: string[] = []

// A few at a time, to go easy on fg-proxy and FanGraphs.
for (let i = 0; i < teams.length; i += 5) {
  await Promise.all(teams.slice(i, i + 5).map(async (team) => {
    const file = join(DIR, 'teams', `${team}.json`)
    if (!existsSync(file)) return void failed.push(`${team}: no team file`)
    const t = JSON.parse(readFileSync(file, 'utf8')) as TeamFile
    try {
      const rr = await fetchTeam(team)
      results[team] = compareRoster(defaultRoster(t).onRoster, t.players, rr.roster, rr.transactions)
    } catch (e) {
      failed.push((e as Error).message)
    }
  }))
}

const differing = teams.filter((t) => results[t] && (results[t].leftRoster.length || results[t].joinedRoster.length))
const report = { source: 'https://www.fangraphs.com/roster-resource/depth-charts', teams: Object.fromEntries(differing.map((t) => [t, results[t]])), failed }

// Only rewrite when the differences change, so a quiet day makes no commit.
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
if (!prev || JSON.stringify({ ...prev, checkedAt: undefined }) !== JSON.stringify(report)) {
  writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString(), ...report }, null, 1) + '\n')
}

const lines = [`### Team Builder vs RosterResource: ${differing.length} of ${teams.length} teams differ`, '']
for (const t of differing) {
  lines.push(`**${t}**`)
  for (const d of results[t].leftRoster) lines.push(`- ${d.name} is on our roster, but RosterResource has him ${d.where}${d.move ? ` (${d.move})` : ''}`)
  for (const d of results[t].joinedRoster) lines.push(`- ${d.name} is on RosterResource's 40-man, but he's ${d.where}${d.move ? ` (${d.move})` : ''}`)
  lines.push('')
}
if (failed.length) lines.push(`Couldn't check: ${failed.join('; ')}`, '')
console.log(lines.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' })
if (failed.length === teams.length) process.exit(1)
