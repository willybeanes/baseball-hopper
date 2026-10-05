// Everyone a user could add: free agents (from Cot's, plus MLBTR's list for players Cot's no
// longer carries) and every rostered player on every team, for pretend trades.

import { defaultRoster, type Player, type TeamFile } from './roster'

export interface PoolPlayer {
  mlbamId: number
  name: string
  pos: string
  age: number | null // 2027 season age
  from: string | null // current team; null for a free agent no sheet lists
  kind: 'fa' | 'roster'
  status: Player['status']
  salary: number | null // 2027 salary for rostered players
  taxValue: number | null
  salarySource?: Player['salarySource']
  salaryPrevYear: number | null // 2026 pay, the placeholder price for a free agent
  contract: string
  note?: string
  war?: number | null // projected target-year WAR
  pa?: number
  ip?: number
}

export interface MlbtrFreeAgent { name: string; age: number; positions: string[]; note?: string; mlbamId: number | null }

const fromPlayer = (p: Player, team: string, kind: PoolPlayer['kind'], note?: string): PoolPlayer => ({
  mlbamId: p.mlbamId!,
  name: p.name,
  pos: p.pos,
  age: p.age,
  from: team,
  kind,
  status: p.status,
  salary: kind === 'roster' ? p.salary : null,
  taxValue: kind === 'roster' ? p.taxValue : null,
  salarySource: p.salarySource,
  salaryPrevYear: p.salaryPrevYear,
  contract: p.contract,
  ...(note ? { note } : {}),
})

export function buildPool(teams: TeamFile[], mlbtr: MlbtrFreeAgent[]): PoolPlayer[] {
  const pool = new Map<number, PoolPlayer>()
  for (const t of teams) {
    const r = defaultRoster(t)
    for (const p of r.onRoster) if (p.mlbamId) pool.set(p.mlbamId, fromPlayer(p, t.team, 'roster'))
    for (const p of r.freeAgents) if (p.mlbamId) pool.set(p.mlbamId, fromPlayer(p, t.team, 'fa'))
    for (const p of r.declinedOptions) {
      if (p.mlbamId) pool.set(p.mlbamId, fromPlayer(p, t.team, 'fa', `${t.team} declined his mutual option`))
    }
  }
  // MLBTR fills in free agents no sheet carries. Where a sheet does list the player, the sheet
  // and the default option rules win (a club option counts as exercised, so he isn't free).
  for (const f of mlbtr) {
    if (f.mlbamId == null || pool.has(f.mlbamId)) continue
    pool.set(f.mlbamId, {
      mlbamId: f.mlbamId,
      name: f.name,
      pos: f.positions.join('-'),
      age: f.age,
      from: null,
      kind: 'fa',
      status: 'fa',
      salary: null,
      taxValue: null,
      salaryPrevYear: null,
      contract: '',
      ...(f.note ? { note: f.note } : {}),
    })
  }
  return [...pool.values()]
}
