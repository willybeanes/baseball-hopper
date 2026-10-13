// A share link carries the team and the list of changes, not the roster: opening it replays
// the changes on today's data. Each move is a letter, the player's MLBAM id in base 36, and,
// where the user set one, a salary in $10K units: "a14fk9-1cx.r6l2z" = signed one player at a
// typed salary, removed another. About ten characters a move, so dozens fit in a URL.

import type { Move } from './moves'

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
