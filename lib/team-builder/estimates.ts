// Fills in the 2027 salaries Cot's doesn't give. Real numbers always win: a dollar figure on
// Cot's beats MLBTR's estimate, which beats the rough rule of thumb. Every estimated salary
// also becomes the player's tax value (one-year figures, so the two are the same).

import type { CotsPlayer, TeamSheet } from './cots'

export type SalarySource = 'cots' | 'option' | 'mlbtr-arb' | 'rough-arb' | 'minimum' | 'unknown' | 'none'

export interface OptionFact {
  mlbamId: number
  decidedBy: 'club' | 'player' | 'both'
  type: string
  salary: number | null
  buyout: number | null
}

export interface ArbEstimate { mlbamId: number | null; salary: number }

export interface Assumptions {
  leagueMinimum: { value: number }
  roughArbitration: { byYear: Record<string, number> }
  optionDefaults: { club: string; player: string; mutual: string }
}

// Fields the refresh adds on top of what the sheet says.
export interface EstimatedFields {
  salarySource?: SalarySource
  decidedBy?: 'club' | 'player' | 'both'
  playerOption?: { type: string; buyout: number | null } // signed, but the player can walk away
  defaultExercised?: boolean // options only: on the default 2027 roster, or declined with the buyout counted
  corrected?: string // why we overrode Cot's status, if we did
}

export function applyEstimates(
  sheet: TeamSheet,
  options: OptionFact[],
  arb: ArbEstimate[],
  assumptions: Assumptions,
): void {
  const optionById = new Map(options.map((o) => [o.mlbamId, o]))
  const arbById = new Map(arb.filter((a) => a.mlbamId != null).map((a) => [a.mlbamId!, a.salary]))
  const min = assumptions.leagueMinimum.value

  for (const p of sheet.players as (CotsPlayer & EstimatedFields)[]) {
    const opt = p.mlbamId ? optionById.get(p.mlbamId) : undefined
    const arbSalary = p.mlbamId ? arbById.get(p.mlbamId) : undefined
    const clubOrMutual = opt && opt.decidedBy !== 'player'

    // Cot's slips that MLBTR catches: an option buyout sitting in the salary column
    // (Carson Kelly), or a pending option marked FA (Garrett Whitlock).
    if (p.status === 'signed' && clubOrMutual && opt.buyout != null && p.salary === opt.buyout) {
      Object.assign(p, { status: 'option', buyout: p.salary, salary: null, taxValue: null, walkYear: undefined })
      p.corrected = "Cot's salary is the option buyout"
    } else if (p.status === 'fa' && clubOrMutual && opt.salary != null) {
      p.status = 'option'
      if (opt.buyout != null) p.buyout = opt.buyout
      p.corrected = "Cot's shows FA, but the option is still pending (MLBTR)"
    }

    if (p.status === 'option') {
      if (opt) p.optionType = (opt.type as CotsPlayer['optionType']) ?? p.optionType
      p.decidedBy = opt?.decidedBy ?? (p.optionType === 'mutual' ? 'both' : 'club')
      const rule = p.decidedBy === 'both' ? assumptions.optionDefaults.mutual : p.decidedBy === 'player' ? assumptions.optionDefaults.player : assumptions.optionDefaults.club
      p.defaultExercised = rule === 'exercised'
      if (p.buyout == null && opt?.buyout != null) p.buyout = opt.buyout
      if (opt?.salary != null) {
        p.salary = p.taxValue = opt.salary
        p.salarySource = 'option'
      } else if (arbSalary != null) {
        // An option nobody can price on a player who is arbitration-eligible anyway.
        p.status = 'arb'
        p.salary = p.taxValue = arbSalary
        p.salarySource = 'mlbtr-arb'
        delete p.defaultExercised
      } else {
        p.salarySource = 'unknown'
      }
      continue
    }

    if (p.status === 'signed') {
      p.salarySource = 'cots'
      if (opt?.decidedBy === 'player') p.playerOption = { type: opt.type, buyout: opt.buyout }
      continue
    }

    // MLBTR's list settles who is arbitration-eligible (it catches Super Twos Cot's lists as pre-arb).
    if ((p.status === 'arb' || p.status === 'prearb') && arbSalary != null) {
      p.status = 'arb'
      p.salary = p.taxValue = arbSalary
      p.salarySource = 'mlbtr-arb'
    } else if (p.status === 'arb') {
      const flat = assumptions.roughArbitration.byYear[String(p.arbYear ?? 1)] ?? assumptions.roughArbitration.byYear['1']
      p.salary = p.taxValue = Math.max(flat, p.salaryPrevYear ?? 0, min)
      p.salarySource = 'rough-arb'
    } else if (p.status === 'prearb') {
      p.salary = p.taxValue = min
      p.salarySource = 'minimum'
    } else {
      p.salarySource = 'none' // free agent or unknown: not on the 2027 roster
    }
  }
}
