// Play a 2027 season and postseason from projected records, so a batch of simulations gives
// odds (division, playoffs, pennant, World Series) and not just one projected record per team.
//
// Two kinds of luck, both seeded:
//   - talent: each team's true strength is its projection plus a normal error (season.talentSd
//     wins in assumptions.json), for what projections miss: injuries, breakouts, collapses;
//   - games: every game is played, team against team (log5), on a 162-game schedule shaped
//     like MLB's balanced one, so a team's luck in games comes out of the schedule itself.
// The postseason is MLB's 12-team format: three division winners and three wild cards per
// league, the top two division winners skip the best-of-three wild card round, then best of
// five, seven and seven. No home-field edge.

import assumptions from './assumptions.json'
import { mulberry32 } from './offseason'
import { DIVISIONS } from './teams'

export const SEASON = assumptions.season

export type Round = 'missed' | 'wildcard' | 'division' | 'pennant' | 'worldseries' | 'champion'
export const ROUNDS: Round[] = ['missed', 'wildcard', 'division', 'pennant', 'worldseries', 'champion']

export interface SeasonTeam {
  team: string
  projected: number // projected wins going in
  talent: number // true winning percentage this season, after the talent error
  wins: number
  losses: number
  divisionWinner: boolean
  seed: number | null // 1-6 in its league, null if it missed the playoffs
  round: Round // how far it got: 'pennant' lost the LCS, 'worldseries' lost the World Series
}

const LEAGUES = [DIVISIONS.slice(0, 3), DIVISIONS.slice(3, 6)]

// Games between every pair of teams: 13 against each division rival (52), 6 or 7 against the
// other ten in the league (64), 3 against each team in the other league plus a fourth against
// one natural rival (46). 162 each.
export function schedule(): [string, string, number][] {
  const games: [string, string, number][] = []
  const place = new Map<string, { league: number; div: number; pos: number }>()
  LEAGUES.forEach((divs, league) => divs.forEach((d, div) => d.teams.forEach((t, pos) => place.set(t, { league, div, pos }))))
  const teams = [...place.keys()]
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = place.get(teams[i])!
      const b = place.get(teams[j])!
      let n: number
      if (a.league !== b.league) n = 3 + (a.div === b.div && a.pos === b.pos ? 1 : 0)
      else if (a.div === b.div) n = 13
      else {
        // Each team gets a seventh game against two teams in each other division.
        const [lo, hi] = a.div < b.div ? [a, b] : [b, a]
        n = 6 + ((hi.pos - lo.pos + 5) % 5 <= 1 ? 1 : 0)
      }
      games.push([teams[i], teams[j], n])
    }
  }
  return games
}
const SCHEDULE = schedule()

// The chance a team of strength a beats a team of strength b (Bill James' log5).
export const log5 = (a: number, b: number) => (a * (1 - b)) / (a * (1 - b) + b * (1 - a))

function normal(rand: () => number) {
  const u = 1 - rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

// Projected wins per team in, one season out. The same seed gives the same season.
export function simulateSeason(projected: Record<string, number>, seed: number, talentSd = SEASON.talentSd): SeasonTeam[] {
  const rand = mulberry32(seed)
  const codes = Object.keys(projected)
  const errors = codes.map(() => normal(rand) * talentSd)
  const meanError = errors.reduce((n, e) => n + e, 0) / codes.length // keep the league at .500
  const talent = new Map(codes.map((t, i) => [t, Math.min(0.75, Math.max(0.25, (projected[t] + errors[i] - meanError) / 162))]))
  const wins = new Map(codes.map((t) => [t, 0]))

  for (const [a, b, n] of SCHEDULE) {
    const p = log5(talent.get(a)!, talent.get(b)!)
    let w = 0
    for (let g = 0; g < n; g++) if (rand() < p) w++
    wins.set(a, wins.get(a)! + w)
    wins.set(b, wins.get(b)! + n - w)
  }

  const result = new Map<string, SeasonTeam>(codes.map((t) => [t, {
    team: t, projected: projected[t], talent: talent.get(t)!, wins: wins.get(t)!, losses: 162 - wins.get(t)!,
    divisionWinner: false, seed: null, round: 'missed' as Round,
  }]))
  // Ties are broken by a coin flip, standing in for MLB's head-to-head tiebreakers.
  const tiebreak = new Map(codes.map((t) => [t, rand()]))
  const byRecord = (a: string, b: string) => wins.get(b)! - wins.get(a)! || tiebreak.get(b)! - tiebreak.get(a)!

  const series = (a: string, b: string, best: number) => {
    const p = log5(talent.get(a)!, talent.get(b)!)
    let wa = 0
    let wb = 0
    const need = Math.ceil(best / 2)
    while (wa < need && wb < need) rand() < p ? wa++ : wb++
    return wa === need ? a : b
  }
  const reach = (t: string, r: Round) => (result.get(t)!.round = r)

  const champs: string[] = []
  for (const divs of LEAGUES) {
    const leaders = divs.map((d) => [...d.teams].sort(byRecord)[0]).sort(byRecord)
    const wild = divs.flatMap((d) => d.teams).filter((t) => !leaders.includes(t)).sort(byRecord).slice(0, 3)
    const seeds = [...leaders, ...wild]
    seeds.forEach((t, i) => {
      const r = result.get(t)!
      r.seed = i + 1
      r.divisionWinner = i < 3
      r.round = i < 2 ? 'division' : 'wildcard'
    })
    const w45 = series(seeds[3], seeds[4], 3)
    const w36 = series(seeds[2], seeds[5], 3)
    reach(w45, 'division')
    reach(w36, 'division')
    const ds1 = series(seeds[0], w45, 5)
    const ds2 = series(seeds[1], w36, 5)
    reach(ds1, 'pennant')
    reach(ds2, 'pennant')
    const pennant = series(ds1, ds2, 7)
    reach(pennant, 'worldseries')
    champs.push(pennant)
  }
  reach(series(champs[0], champs[1], 7), 'champion')
  return codes.map((t) => result.get(t)!)
}
