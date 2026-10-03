// Reads one Cot's Baseball Contracts team sheet (CSV export) into clean rows.
// Pure functions only — fetching and file writing live in scripts/team-builder.
// Sheet layout notes are in the Notion card "Team Builder", section 4.

export type Status = 'signed' | 'arb' | 'prearb' | 'option' | 'fa' | 'unknown'
export type OptionType = 'club' | 'mutual' | 'player' | 'vesting' | 'conditional' | 'unknown'

export interface CotsPlayer {
  name: string // "Francisco Lindor"
  sheetName: string // "Lindor, Francisco" (asterisk stripped)
  pos: string // raw Cot's position, e.g. "rhp-s", "1b-3b"
  age: number | null // age on 7/1 of the sheet's first year
  mls: number | null // service time as years.days, e.g. 2.164
  contract: string // "5 y/$155M (26-30)"
  status: Status
  arbYear?: number // 1-4, when status is 'arb'
  optionType?: OptionType
  buyout?: number // dollars, when status is 'option' and the sheet shows one
  walkYear?: boolean // signed for the target year, free agent after it
  salary: number | null // target-year actual salary in dollars; null when the sheet has none
  taxValue: number | null // target-year luxury-tax value in dollars; null when the sheet has none
  salaryPrevYear: number | null // first-year actual salary in dollars
}

export interface DeadMoney {
  name: string
  salary: number // dollars still owed in the target year
  taxValue: number
  note: string // e.g. "to Pittsburgh, 8/3/26 trade"
}

export interface TeamSheet {
  team: string
  players: CotsPlayer[]
  deadMoney: DeadMoney[]
  benefits: number | null // "Estimated Player Benefits", counts toward tax payroll
  bonusPool: number | null // "Pre-arbitration bonus pool", counts toward tax payroll
  threshold: number | null // base luxury-tax line for the target year, if the sheet has the row
  sheetPayroll: number | null // sheet's own "Projected 40-man Year-End Payroll"
  sheetTaxPayroll: number | null // sheet's own "Projected 40-man CB(T) Tax Payroll"
  rowsPayroll: number // sum of every salary cell in the target year (players, buyouts, dead money)
  rowsTaxPayroll: number // sum of every tax cell plus benefits and bonus pool
}

// Column positions (0-based). Salary block starts at M, tax block at S.
const COL = { name: 0, pos: 1, age: 5, mls: 6, contract: 10, salary: 12, tax: 18 }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// "$61,875,000" (first year, whole dollars) or "$57.500" (later years, millions).
// Brackets mean negative: "($100,000)". Returns whole dollars, or null for non-money cells.
export function parseMoney(cell: string | undefined, millions: boolean): number | null {
  const m = (cell ?? '').trim().match(/^\(?\$([\d,]+(?:\.\d+)?)\)?$/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  const dollars = Math.round(millions ? n * 1e6 : n)
  return cell!.trim().startsWith('(') ? -dollars : dollars
}

function displayName(sheetName: string): string {
  const [last, first] = sheetName.split(',').map((s) => s.trim())
  return first ? `${first} ${last}` : last
}

function optionTypeFrom(text: string): OptionType {
  if (/cond opt/i.test(text)) return 'conditional'
  if (/\bcl opts?\b/i.test(text)) return 'club'
  if (/\bm opts?\b/i.test(text)) return 'mutual'
  if (/\bv opts?\b/i.test(text)) return 'vesting'
  if (/\b(p|player) opts?\b/i.test(text)) return 'player'
  return 'unknown'
}

export function parseTeamSheet(team: string, csv: string, firstYear: number, targetYear: number): TeamSheet {
  const rows = parseCsv(csv).map((r) => r.map((c) => c ?? ''))
  const header = rows.findIndex((r) => r[0]?.trim() === 'Player')
  if (header < 0) throw new Error(`${team}: no "Player" header row — sheet layout changed`)
  const years = rows[header + 1] ?? []
  if (years[COL.salary]?.trim() !== String(firstYear) || years[COL.tax]?.trim() !== String(firstYear)) {
    throw new Error(`${team}: expected ${firstYear} at the top of the salary and tax columns — sheet layout changed`)
  }

  const offset = targetYear - firstYear
  const salCol = COL.salary + offset
  const taxCol = COL.tax + offset
  const millions = targetYear !== firstYear
  const cell = (r: string[], i: number) => (r[i] ?? '').trim()
  const label = (r: string[]) => (r[0] ?? '').trim()
  const optionInLine = (line: string) => line.split('+').slice(1).some((seg) => new RegExp(`\\b${targetYear % 100}\\b`).test(seg) && /opt/i.test(seg))

  const players: CotsPlayer[] = []
  const dead = new Map<string, DeadMoney>()
  let rowsPayroll = 0
  let rowsTax = 0
  let end = -1

  for (let i = header + 2; i < rows.length; i++) {
    const r = rows[i]
    if (label(r).startsWith('Pre-arbitration bonus pool')) { end = i; break }
    if (!label(r)) continue

    const salCell = cell(r, salCol)
    const taxCell = cell(r, taxCol)
    const sal = parseMoney(salCell, millions)
    const tax = parseMoney(taxCell, millions)
    rowsPayroll += sal ?? 0
    rowsTax += tax ?? 0

    const sheetName = label(r).replace(/\*+$/, '').trim()
    const contract = cell(r, COL.contract)

    if (!cell(r, COL.pos)) {
      // Departed-players block: only rows still owed money in the target year matter.
      if (!sal && !tax) continue
      const prev = dead.get(sheetName)
      if (prev) { prev.salary += sal ?? 0; prev.taxValue += tax ?? 0 }
      else dead.set(sheetName, { name: displayName(sheetName), salary: sal ?? 0, taxValue: tax ?? 0, note: contract })
      continue
    }

    const mlsRaw = parseFloat(cell(r, COL.mls))
    const ageRaw = parseInt(cell(r, COL.age), 10)
    const next = cell(r, salCol + 1)
    const p: CotsPlayer = {
      name: displayName(sheetName),
      sheetName,
      pos: cell(r, COL.pos),
      age: Number.isFinite(ageRaw) ? ageRaw : null,
      mls: Number.isFinite(mlsRaw) ? mlsRaw : null,
      contract,
      status: 'unknown',
      salary: null,
      taxValue: null,
      salaryPrevYear: parseMoney(cell(r, COL.salary), false),
    }

    const arb = salCell.match(/^A([1-4])$/)
    if (/opt/i.test(salCell) || /opt/i.test(taxCell)) {
      // Pending option. The salary block holds the buyout (if any), not the option salary.
      p.status = 'option'
      p.optionType = optionTypeFrom(`${salCell} ${taxCell} ${contract}`)
      if (sal != null) p.buyout = sal
    } else if (sal != null) {
      if (tax == null && optionInLine(contract)) {
        p.status = 'option'
        p.optionType = optionTypeFrom(contract)
        p.buyout = sal
      } else {
        p.status = 'signed'
        p.salary = sal
        p.taxValue = tax ?? sal
        p.walkYear = parseMoney(next, true) == null && !/^A[1-4]$/.test(next) && !/opt/i.test(next)
      }
    } else if (arb) {
      p.status = 'arb'
      p.arbYear = Number(arb[1])
    } else if (salCell === 'FA') {
      p.status = 'fa'
    } else if (optionInLine(contract)) {
      p.status = 'option'
      p.optionType = optionTypeFrom(contract)
    } else if (!salCell && p.mls != null) {
      // Blank target year: pre-arb under 3 years of service; past 6 years the deal has
      // simply run out (Cot's leaves the cell blank rather than writing FA). In between
      // the player is arbitration-eligible even though the sheet doesn't say which year.
      p.status = p.mls < 3 ? 'prearb' : p.mls >= 6 ? 'fa' : 'arb'
    }
    players.push(p)
  }
  if (end < 0) throw new Error(`${team}: no "Pre-arbitration bonus pool" row — sheet layout changed`)

  const footer = (prefix: RegExp, col: number) => {
    const r = rows.slice(end).find((row) => prefix.test(label(row)))
    return r ? parseMoney(cell(r, col), millions) : null
  }
  const bonusPool = footer(/^Pre-arbitration bonus pool/, taxCol)
  const benefits = footer(/^Estimated Player Benefits/, taxCol)

  return {
    team,
    players,
    deadMoney: [...dead.values()],
    benefits,
    bonusPool,
    threshold: footer(/^Competitive Balance Tax Threshold/, taxCol),
    sheetPayroll: footer(/^Projected 40-man Year-End Payroll/, salCol),
    sheetTaxPayroll: footer(/^Projected 40-man CBT? Tax Payroll|^Projected 40-man CBT Payroll/, taxCol),
    rowsPayroll,
    rowsTaxPayroll: rowsTax + (benefits ?? 0) + (bonusPool ?? 0),
  }
}

export interface KnownMismatch { rows: number; sheet: number }

// Problems that should stop a refresh and keep yesterday's data.
export function checkTeamSheet(s: TeamSheet, known?: { payroll?: KnownMismatch; tax?: KnownMismatch }): string[] {
  const errors: string[] = []
  const M = (n: number) => `$${(n / 1e6).toFixed(3)}M`
  const close = (a: number, b: number) => Math.abs(a - b) < 1000

  if (s.players.length < 30) errors.push(`${s.team}: only ${s.players.length} players on the sheet`)
  if (s.benefits == null) errors.push(`${s.team}: no "Estimated Player Benefits" figure`)
  if (s.bonusPool == null) errors.push(`${s.team}: no "Pre-arbitration bonus pool" figure`)

  const compare = (what: string, rows: number, sheet: number | null, k?: KnownMismatch) => {
    if (sheet == null) { errors.push(`${s.team}: no sheet ${what} total to check against`); return }
    if (close(rows, sheet)) return
    if (k && close(rows, k.rows * 1e6) && close(sheet, k.sheet * 1e6)) return
    errors.push(`${s.team}: ${what} rows add up to ${M(rows)} but the sheet says ${M(sheet)}`)
  }
  compare('payroll', s.rowsPayroll, s.sheetPayroll, known?.payroll)
  compare('tax payroll', s.rowsTaxPayroll, s.sheetTaxPayroll, known?.tax)
  return errors
}
