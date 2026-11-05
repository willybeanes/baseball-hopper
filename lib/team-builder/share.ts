// A share link carries the team and the list of changes, not the roster: opening it replays
// the changes on today's data. Each move is a letter, the player's MLBAM id in base 36, and,
// where the user set one, a salary in $10K units: "a14fk9-1cx.r6l2z" = signed one player at a
// typed salary, removed another. About ten characters a move, so dozens fit in a URL.

import type { Move } from './moves'
import { TEAM_NAMES } from './teams'

const CODE: Record<Move['type'], string> = {
  remove: 'r', decline: 'd', exercise: 'x', optOut: 'o', resign: 's', salary: 'e', add: 'a', promote: 'p',
}
const TYPE = Object.fromEntries(Object.entries(CODE).map(([t, c]) => [c, t])) as Record<string, Move['type']>
const NEEDS_SALARY: Move['type'][] = ['resign', 'salary']
const TAKES_SALARY: Move['type'][] = ['resign', 'salary', 'exercise', 'add']
const MAX_MOVES = 80
const UNIT = 10_000

export function encodeMoves(moves: Move[]): string {
  return moves
    .map((m) => {
      const salary = 'salary' in m && m.salary != null ? `-${Math.round(m.salary / UNIT).toString(36)}` : ''
      return `${CODE[m.type]}${m.id.toString(36)}${salary}`
    })
    .join('.')
}

// Anything malformed is dropped rather than guessed at; a mangled link still opens.
export function decodeMoves(text: string | null | undefined): Move[] {
  if (!text) return []
  const moves: Move[] = []
  for (const token of text.split('.').slice(0, MAX_MOVES)) {
    const m = token.match(/^([a-z])([0-9a-z]{1,8})(?:-([0-9a-z]{1,6}))?$/)
    if (!m) continue
    const type = TYPE[m[1]]
    const id = parseInt(m[2], 36)
    const salary = m[3] != null ? parseInt(m[3], 36) * UNIT : undefined
    if (!type || !Number.isFinite(id) || id <= 0) continue
    if (NEEDS_SALARY.includes(type) && salary == null) continue
    if (salary != null && (!TAKES_SALARY.includes(type) || salary > 100_000_000)) continue
    moves.push((salary != null ? { type, id, salary } : { type, id }) as Move)
  }
  return moves
}

// The day a link was made, as YYYYMMDD in the URL.
export const encodeDate = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

export function decodeDate(text: string | null | undefined): Date | null {
  const m = text?.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

// The offseason simulation's link: one letter per team for its attitude (teams in TEAM_NAMES
// order), the seed in base 36, and the user's moves per team as "NYM~<moves>_SEA~<moves>".
const ATTITUDE_CODES: Record<string, string> = { allin: 'a', contend: 'c', buysell: 'b', rebuild: 'r', tank: 't' }
const ATTITUDE_BY_CODE = Object.fromEntries(Object.entries(ATTITUDE_CODES).map(([a, c]) => [c, a]))
const TEAM_ORDER = Object.keys(TEAM_NAMES)

export function encodeAttitudes(attitudes: Record<string, string>): string {
  return TEAM_ORDER.map((t) => ATTITUDE_CODES[attitudes[t]] ?? 'b').join('')
}

// Anything unreadable is left out, so those teams fall back to their default attitude.
export function decodeAttitudes(text: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!text || text.length !== TEAM_ORDER.length) return out
  TEAM_ORDER.forEach((t, i) => { const a = ATTITUDE_BY_CODE[text[i]]; if (a) out[t] = a })
  return out
}

export function encodeTeamMoves(byTeam: Record<string, Move[]>): string {
  return Object.entries(byTeam).filter(([, ms]) => ms.length).map(([t, ms]) => `${t}~${encodeMoves(ms)}`).join('_')
}

export function decodeTeamMoves(text: string | null | undefined): Record<string, Move[]> {
  const out: Record<string, Move[]> = {}
  if (!text) return out
  for (const part of text.split('_')) {
    const [team, moves] = part.split('~')
    if (!team || !(team in TEAM_NAMES) || moves == null) continue
    const decoded = decodeMoves(moves)
    if (decoded.length) out[team] = decoded
  }
  return out
}

export const encodeSeed = (seed: number) => (seed >>> 0).toString(36)
export function decodeSeed(text: string | null | undefined): number | null {
  if (!text || !/^[0-9a-z]{1,7}$/.test(text)) return null
  const n = parseInt(text, 36)
  return Number.isFinite(n) && n <= 0xffffffff ? n : null
}
