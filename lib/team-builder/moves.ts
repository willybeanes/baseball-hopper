// A user's roster is the default roster plus a list of changes. Keeping the changes (not the
// roster) is what lets a share link replay them on top of today's data (step 10).

import type { DeadMoney } from './cots'
import { defaultRoster, type Player, type TeamFile } from './roster'

export type Move =
  | { type: 'remove'; id: number } // trade away, non-tender or release: the salary leaves
  | { type: 'decline'; id: number } // club or mutual option declined: buyout is owed
  | { type: 'exercise'; id: number; salary?: number } // a declined option picked up (salary needed if unknown)
  | { type: 'optOut'; id: number } // player walks away from a signed deal: buyout (if any) is owed
  | { type: 'resign'; id: number; salary: number } // the team's own free agent re-signed for one year
  | { type: 'salary'; id: number; salary: number } // user's own figure for an estimated salary

export type OffReason = 'declined' | 'opted-out' | 'removed' | 'free-agent'

export interface Slot {
  player: Player
  onRoster: boolean
  salary: number | null
  taxValue: number | null
  owed: number // buyout still paid while off the roster
  offReason?: OffReason
  userSalary?: boolean // salary typed by the user
}

export interface BuiltRoster {
  slots: Slot[]
  deadMoney: DeadMoney[]
  payroll: number
  taxPayroll: number
  rosterCount: number
  unknownSalaries: Player[]
}

const idOf = (p: Player) => p.mlbamId ?? -1

// Whether a salary is the user's to edit: estimates and options, never signed contracts.
export const salaryEditable = (s: Slot) => s.onRoster && (s.userSalary || s.player.salarySource !== 'cots')

export function buildRoster(team: TeamFile, moves: Move[]): BuiltRoster {
  const base = defaultRoster(team)
  const slots = new Map<number, Slot>()
  for (const p of base.onRoster) slots.set(idOf(p), { player: p, onRoster: true, salary: p.salary, taxValue: p.taxValue, owed: 0 })
  for (const p of base.declinedOptions) slots.set(idOf(p), { player: p, onRoster: false, salary: p.salary, taxValue: p.taxValue, owed: p.buyout ?? 0, offReason: 'declined' })
  for (const p of base.freeAgents) slots.set(idOf(p), { player: p, onRoster: false, salary: null, taxValue: null, owed: 0, offReason: 'free-agent' })

  // Moves that no longer apply (the player left the sheet, or an earlier move was undone) are skipped.
  for (const m of moves) {
    const s = slots.get(m.id)
    if (!s) continue
    const p = s.player
    switch (m.type) {
      case 'remove':
        if (s.onRoster) Object.assign(s, { onRoster: false, owed: 0, offReason: 'removed' })
        break
      case 'decline':
        if (s.onRoster && p.status === 'option') Object.assign(s, { onRoster: false, owed: p.buyout ?? 0, offReason: 'declined' })
        break
      case 'exercise': {
        const salary = m.salary ?? p.salary
        if (!s.onRoster && p.status === 'option' && salary != null) {
          Object.assign(s, { onRoster: true, owed: 0, offReason: undefined, salary, taxValue: salary, userSalary: m.salary != null })
        }
        break
      }
      case 'optOut':
        if (s.onRoster && p.playerOption) Object.assign(s, { onRoster: false, owed: p.playerOption.buyout ?? 0, offReason: 'opted-out' })
        break
      case 'resign':
        if (!s.onRoster && s.offReason === 'free-agent') {
          Object.assign(s, { onRoster: true, offReason: undefined, salary: m.salary, taxValue: m.salary, userSalary: true })
        }
        break
      case 'salary':
        if (salaryEditable(s)) Object.assign(s, { salary: m.salary, taxValue: m.salary, userSalary: true })
        break
    }
  }

  const all = [...slots.values()]
  const on = all.filter((s) => s.onRoster)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  return {
    slots: all,
    deadMoney: base.deadMoney,
    payroll: sum(on.map((s) => s.salary ?? 0)) + sum(all.map((s) => s.owed)) + sum(base.deadMoney.map((d) => d.salary)),
    taxPayroll: sum(on.map((s) => s.taxValue ?? 0)) + sum(base.deadMoney.map((d) => d.taxValue)) + (team.benefits ?? 0) + (team.bonusPool ?? 0),
    rosterCount: on.length,
    unknownSalaries: on.filter((s) => s.salary == null).map((s) => s.player),
  }
}

// Adds a move, cancelling out the one it undoes (removing then restoring leaves no trace)
// and keeping only the latest salary edit per player.
export function addMove(moves: Move[], m: Move): Move[] {
  const undoes: Record<Move['type'], Move['type'][]> = {
    remove: ['resign', 'exercise'],
    decline: ['exercise'],
    exercise: ['decline'],
    optOut: [],
    resign: ['remove'],
    salary: ['salary'],
  }
  const cancelled = moves.find((x) => x.id === m.id && undoes[m.type].includes(x.type) && m.type !== 'salary')
  if (cancelled) return moves.filter((x) => x !== cancelled && !(x.id === m.id && x.type === 'salary'))
  return [...moves.filter((x) => !(m.type === 'salary' && x.type === 'salary' && x.id === m.id)), m]
}

// Puts a player back where the default roster had him by dropping every move about him.
export const undoPlayer = (moves: Move[], id: number) => moves.filter((m) => m.id !== id)
