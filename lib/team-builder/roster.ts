// The default 2027 roster and its totals, from one team's snapshot file.
// Shared by the page (and, from step 7, by the moves a user makes).

import type { CotsPlayer, DeadMoney, TeamSheet } from './cots'
import type { EstimatedFields } from './estimates'

export type Player = CotsPlayer & EstimatedFields
// A projected minor leaguer outside the 40-man. Adding him uses a 40-man spot at the minimum.
export interface MinorLeaguer {
  mlbamId: number
  name: string
  pos: string
  age: number | null
  war: number
  pa?: number
  ip?: number
  salary: number // league minimum, what he'd make on the 40-man
}

export type TeamFile = Omit<TeamSheet, 'players'> & { players: Player[]; minors?: MinorLeaguer[] }

export interface Meta {
  updatedAt: string
  targetYear: number
  taxThreshold: { base: number; tiers: number[]; derived: boolean } | null
  assumptions: {
    leagueMinimum: { value: number; note: string }
    roughArbitration: { note: string; byYear: Record<string, number> }
    optionDefaults?: { note: string }
    dollarsPerWar?: { value: number; note: string; url: string } // missing in data written before WAR was added
  }
  projections?: { system: string; label: string; note: string; url: string; fetchedAt: string | null; players: number }
  staleTeams?: Record<string, string[]>
  sources: {
    arbitration: { title: string; site: string; author: string; url: string; importedAt: string }
    options: { compiled: string; clubOptions: string; playerOptions: string }
    freeAgents?: { title: string; url: string; updated: string | null }
  }
  teams: string[]
}

export interface Roster {
  onRoster: Player[] // counts toward the totals
  declinedOptions: Player[] // off the roster; buyout counts toward payroll
  freeAgents: Player[] // the team's own free agents
  deadMoney: DeadMoney[]
  payroll: number // actual 2027 salary
  taxPayroll: number // luxury-tax payroll (adds benefits and the pre-arb bonus pool)
  unknownSalaries: Player[] // on the roster with no known salary, left out of both totals
}

export function defaultRoster(team: TeamFile): Roster {
  const onRoster = team.players.filter((p) => p.status !== 'fa' && (p.status !== 'option' || p.defaultExercised !== false))
  const declinedOptions = team.players.filter((p) => p.status === 'option' && p.defaultExercised === false)
  const freeAgents = team.players.filter((p) => p.status === 'fa')

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const dead = sum(team.deadMoney.map((d) => d.salary))
  const deadTax = sum(team.deadMoney.map((d) => d.taxValue))
  // Buyouts are paid in 2027 but, as on Cot's, don't count toward the 2027 tax payroll.
  const buyouts = sum(declinedOptions.map((p) => p.buyout ?? 0))

  return {
    onRoster,
    declinedOptions,
    freeAgents,
    deadMoney: team.deadMoney,
    payroll: sum(onRoster.map((p) => p.salary ?? 0)) + dead + buyouts,
    taxPayroll: sum(onRoster.map((p) => p.taxValue ?? 0)) + deadTax + (team.benefits ?? 0) + (team.bonusPool ?? 0),
    unknownSalaries: onRoster.filter((p) => p.salary == null),
  }
}

// Option salaries are contract terms, not estimates; everything else not from Cot's is.
export const isEstimate = (p: Player) => !!p.salarySource && !['cots', 'option', 'none'].includes(p.salarySource)

export function money(dollars: number, digits = 1): string {
  const sign = dollars < 0 ? '−' : ''
  const abs = Math.abs(dollars)
  if (abs < 1e6 && abs !== 0) return `${sign}$${Math.round(abs / 1000)}K`
  return `${sign}$${(abs / 1e6).toFixed(digits)}M`
}

// What a free agent might cost for one year: projected WAR times the market price of a win,
// rounded to $100K and never below the league minimum. Null without a projection.
export function warPrice(war: number | null | undefined, dollarsPerWar: number, minimum: number): number | null {
  if (war == null) return null
  return Math.max(minimum, Math.round((war * dollarsPerWar) / 1e5) * 1e5)
}

export const fmtWar = (war: number | null | undefined) => (war == null ? '—' : war.toFixed(1))
