// Projected win-loss record from projected WAR. Settings and reasoning are in assumptions.json.

import assumptions from './assumptions.json'

const { replacementWinPct, games } = assumptions.projectedRecord
export const GAMES = games
export const REPLACEMENT_WINS = replacementWinPct * games

// Summed 40-man WAR overstates every team, so all of them are scaled by the same factor until
// the league plays .500 (the WAR above replacement that takes the average team to 81 wins,
// about 1,000 league-wide). Uses today's default rosters, so a user's moves don't shift
// everyone else.
export function warScale(teamWars: number[]): number {
  const total = teamWars.reduce((a, b) => a + b, 0)
  const leagueWar = (games / 2 - REPLACEMENT_WINS) * teamWars.length
  return total > 0 ? leagueWar / total : 1
}

export function projectedRecord(teamWar: number, scale: number): { wins: number; losses: number } {
  const wins = Math.min(games, Math.max(0, REPLACEMENT_WINS + teamWar * scale))
  return { wins, losses: games - wins }
}

export const fmtRecord = (r: { wins: number; losses: number }) => `${r.wins.toFixed(1)}–${r.losses.toFixed(1)}`
