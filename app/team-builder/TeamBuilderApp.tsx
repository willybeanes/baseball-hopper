'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { headshotUrl } from '@/lib/player'
import { MLB_TEAM_IDS } from '@/lib/team-builder/ids'
import { TEAM_NAMES } from '@/lib/team-builder/teams'
import { warBySpot } from '@/lib/team-builder/field'
import { fmtRecord, projectedRecord, warScale } from '@/lib/team-builder/record'
import assumptions from '@/lib/team-builder/assumptions.json'
import FieldDiagram from './FieldDiagram'
import { fmtWar, isEstimate, money, warPrice, warTier, warTint, type Meta, type Player, type TeamFile } from '@/lib/team-builder/roster'
import { addMove, buildRoster, payrollEffects, poolToPlayer, salaryEditable, undoPlayer, type Move, type Slot } from '@/lib/team-builder/moves'
import type { PoolPlayer } from '@/lib/team-builder/pool'
import { decodeDate, decodeMoves, encodeDate, encodeMoves } from '@/lib/team-builder/share'

const DATA = '/data/team-builder'
const DEFAULT_TEAM = 'NYM'

// Roster groups, by primary position.
const POSITION_GROUPS: { key: string; title: string }[] = [
  { key: 'C', title: 'Catchers' },
  { key: '1B', title: 'First base' },
  { key: '2B', title: 'Second base' },
  { key: 'SS', title: 'Shortstop' },
  { key: '3B', title: 'Third base' },
  { key: 'IF', title: 'Infield' },
  { key: 'OF', title: 'Outfield' },
  { key: 'DH', title: 'Designated hitter' },
  { key: 'SP', title: 'Starting pitchers' },
  { key: 'RP', title: 'Relief pitchers' },
]

// Primary position bucket from Cot's position text ("lhp-s", "1b-3b", "cf-inf") or MLB's ("ss", "sp").
function posBucket(pos: string): string {
  const p = pos.toLowerCase()
  if (p.includes('hp') || p === 'sp' || p === 'rp' || p === 'p') return /-s\b/.test(p) || p === 'sp' ? 'SP' : 'RP'
  const first = p.split('-')[0]
  if (['lf', 'cf', 'rf', 'of'].includes(first)) return 'OF'
  if (first === 'inf' || first === 'if' || first === 'ut') return 'IF'
  return POSITION_GROUPS.some((g) => g.key === first.toUpperCase()) ? first.toUpperCase() : 'IF'
}

const POSITIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All positions' },
  ...POSITION_GROUPS.filter((g) => g.key !== 'IF').map((g) => ({ key: g.key, label: g.key })),
]
// Room kept under the pinned strip for the one-line totals summary.
const SUMMARY_LINE = 40
// How the roster card can be arranged; the choice is remembered in the viewer's browser.
const GROUP_BY = { position: 'Position', role: 'Hitters / pitchers', none: 'No grouping' } as const
const SORT_BY = { war: 'Projected WAR', salary: '2027 salary', name: 'Name' } as const
type GroupBy = keyof typeof GROUP_BY
type SortBy = keyof typeof SORT_BY
const VIEW_KEY = 'team-builder:roster-view'
const POOL_PAGE = 12
const MINORS_PAGE = 12

// A team's own free agent who has already dropped off its sheet (Cot's rolled it over) but is
// still in the pool, shown in "Not on the 2027 roster" so he can be re-signed.
type PoolSlot = Slot & { fromPool?: boolean }

// Roughly what one team uses in a season, for the playing-time note.
const SEASON_PA = 6200
const SEASON_IP = 1450

const SOURCE_LABEL: Record<string, string> = {
  option: 'Option salary from the contract, via MLB Trade Rumors',
  'mlbtr-arb': 'Arbitration projection (MLB Trade Rumors)',
  'cots-arb': "Arbitration estimate from Cot's (MLBTR has no projection for this player)",
  'rough-arb': 'Rough estimate: MLBTR has no projection for this player',
  minimum: 'League minimum (2026 figure)',
}

const OPTION_LABEL: Record<string, string> = {
  club: 'Club option', mutual: 'Mutual option', player: 'Player option', vesting: 'Vesting option',
  conditional: 'Conditional option', 'opt-out': 'Opt-out', unknown: 'Option',
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'solid' }) {
  const cls = tone === 'solid' ? 'bg-[var(--text)] text-[var(--panel)] border-[var(--text)]' : 'bg-transparent text-[var(--dim)] border-[var(--rule)]'
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-px text-[11px] font-medium leading-4 ${cls}`}>{children}</span>
}

function statusChips(s: Slot) {
  const p = s.player
  if (s.added) return [<Chip key="ad" tone="solid">{s.added.kind === 'fa' ? 'Free-agent signing' : s.added.kind === 'resign' ? 'Re-signed' : `Trade from ${s.added.from}`}</Chip>]
  if (s.promoted) return [<Chip key="pr" tone="solid">Called up</Chip>]
  if (s.offReason === 'minors') return [<Chip key="mi">Minor leaguer</Chip>]
  const chips: React.ReactNode[] = []
  if (p.status === 'signed') {
    chips.push(<Chip key="s" tone="solid">Signed</Chip>)
    if (p.walkYear) chips.push(<Chip key="w">Free agent after 2027</Chip>)
    if (p.playerOption) chips.push(<Chip key="po">{p.playerOption.type === 'opt-out' ? 'Player can opt out' : 'Player option'}</Chip>)
  } else if (p.status === 'option') {
    chips.push(<Chip key="o">{OPTION_LABEL[p.optionType ?? 'unknown'] ?? 'Option'}</Chip>)
    if (p.decidedBy === 'player') chips.push(<Chip key="d">Player decides</Chip>)
  } else if (p.status === 'arb') chips.push(<Chip key="a">{p.arbYear ? `Arbitration, year ${p.arbYear}` : 'Arbitration'}</Chip>)
  else if (p.status === 'prearb') chips.push(<Chip key="p">Pre-arb</Chip>)
  else if (p.status === 'fa') chips.push(<Chip key="f">Free agent</Chip>)
  return chips
}

function Salary({ s }: { s: Slot }) {
  const p = s.player
  if (s.salary == null) {
    return <span className="text-xs font-medium text-[var(--accent)]" title="No source gives this salary, so it's left out of the totals. Use Edit salary to add one.">unknown</span>
  }
  if (s.userSalary) {
    return (
      <span className="font-mono text-xs text-[var(--text)]" title="Salary you entered">
        {money(s.salary, 2)} <span className="font-sans text-[11px] text-[var(--accent)]">yours</span>
      </span>
    )
  }
  if (isEstimate(p)) {
    return (
      <span className="font-mono text-xs italic text-[var(--text)]" title={SOURCE_LABEL[p.salarySource ?? ''] ?? 'Estimate'}>
        {money(s.salary, 2)} <span className="not-italic text-[11px] text-[var(--dimmer)]">est.</span>
      </span>
    )
  }
  return <span className="font-mono text-xs text-[var(--text)]" title={SOURCE_LABEL[p.salarySource ?? '']}>{money(s.salary, 2)}</span>
}

// A projected WAR figure on a tint that deepens with value: the brand red from about 1 WAR up,
// the site's cool blue below zero, nothing in between. The number stays dark, so contrast holds.
function WarValue({ war }: { war: number | null | undefined }) {
  const { share, tone } = warTint(war)
  const bg = tone === 'good' ? `color-mix(in srgb, var(--accent) ${Math.round(8 + share * 37)}%, transparent)`
    : tone === 'bad' ? `color-mix(in srgb, var(--cool) ${Math.round(15 + share * 50)}%, transparent)`
      : undefined
  return (
    <span className="text-[11px] text-[var(--dim)]" title={`${fmtWar(war)} projected WAR: ${warTier(war)}`}>
      <span className="rounded px-1 py-px font-mono text-[var(--text)]" style={{ backgroundColor: bg }}>{fmtWar(war)}</span> WAR
    </span>
  )
}

function ActionButton({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded border border-[var(--rule)] bg-[var(--panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--text)] hover:border-[var(--dim)] hover:bg-[var(--bg)]"
    >
      {children}
    </button>
  )
}

// Inline salary entry, in millions. Used for signings, re-signings, unpriced options and edits.
function SalaryForm({ initial, hint, onSave, onCancel }: { initial: number | null; hint: string; onSave: (dollars: number) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial != null ? (initial / 1e6).toFixed(2).replace(/\.?0+$/, '') : '')
  const value = parseFloat(text)
  const valid = Number.isFinite(value) && value >= 0 && value < 100
  return (
    <form
      className="flex flex-wrap items-center gap-2 bg-[var(--bg)] px-4 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSave(Math.round(value * 1e6))
      }}
    >
      <label className="flex items-center gap-1 text-xs">
        <span className="text-[var(--dim)]">2027 salary $</span>
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-20 rounded border border-[var(--rule)] bg-[var(--panel)] px-2 py-1 text-right font-mono text-xs"
          aria-label="2027 salary in millions"
        />
        <span className="text-[var(--dim)]">M</span>
      </label>
      <button type="submit" disabled={!valid} className="rounded bg-[var(--text)] px-2.5 py-1 text-[11px] font-medium text-[var(--panel)] disabled:opacity-40">Save</button>
      <button type="button" onClick={onCancel} className="text-[11px] text-[var(--dim)] hover:underline">Cancel</button>
      <span className="w-full text-[11px] text-[var(--dimmer)]">{hint}</span>
    </form>
  )
}

function Headshot({ id }: { id: number | undefined }) {
  // eslint-disable-next-line @next/next/no-img-element
  return id ? <img src={headshotUrl(id)} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full bg-[var(--track)] object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--track)]" />
}

// One player, compact enough for half the page: who he is and what you can do on the left,
// what he costs and his projected WAR on the right.
function PlayerRow({ s, actions, right, editor }: { s: Slot; actions?: React.ReactNode; right?: React.ReactNode; editor?: React.ReactNode }) {
  const p = s.player
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Headshot id={p.mlbamId} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              {p.mlbamId ? (
                <a href={`/player/${p.mlbamId}`} className="text-sm font-medium text-[var(--text)] hover:underline">{p.name}</a>
              ) : (
                <span className="text-sm font-medium">{p.name}</span>
              )}
              <span className="text-[11px] uppercase text-[var(--dimmer)]">{p.pos}</span>
              {p.age != null && <span className="text-[11px] text-[var(--dimmer)]">age {p.age}</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {statusChips(s)}
              {p.contract && s.offReason !== 'minors' && !/^A[1-4]$/.test(p.contract) && <span className="truncate text-[11px] text-[var(--dimmer)]" title={p.contract}>{p.contract}</span>}
            </div>
            {actions && <div className="mt-1.5 flex flex-wrap gap-1.5">{actions}</div>}
          </div>
        </div>
        <div className="pt-0.5 text-right">
          {right ?? <Salary s={s} />}
          <span className="mt-0.5 block"><WarValue war={p.war} /></span>
        </div>
      </div>
      {editor}
    </div>
  )
}

function Card({ title, aside, note, controls, children, id }: { title: string; aside?: React.ReactNode; note?: React.ReactNode; controls?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--panel-shadow)]">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">{title}</h2>
        {aside && <span className="text-xs text-[var(--dimmer)]">{aside}</span>}
      </div>
      {controls && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2.5 pt-1">{controls}</div>}
      {note && <p className="max-w-[58ch] px-4 pb-2.5 text-[11px] text-[var(--dim)]">{note}</p>}
      <div className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">{children}</div>
    </section>
  )
}

// Every team, ranked left to right by projected 2027 WAR. The selected team's WAR is live, so
// it slides along the row as moves are made. Positions animate with transform. Lives inside the
// pinned totals bar so it stays in view while players are added.
function TeamStrip({ wars, team, onPick, winsFor }: { wars: Record<string, number>; team: string; onPick: (t: string) => void; winsFor: (war: number) => number }) {
  const ranked = Object.entries(wars).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  const slot = 100 / Math.max(ranked.length, 1)
  const myIndex = ranked.findIndex(([code]) => code === team)
  // Where the strip has to scroll (phones), keep the selected team in view as it moves.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const x = ((myIndex + 0.5) / ranked.length) * el.scrollWidth - el.clientWidth / 2
    el.scrollTo({ left: Math.max(0, x), behavior: 'smooth' })
  }, [myIndex, ranked.length])
  return (
    <div aria-label="Teams ranked by projected 2027 WAR">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px] text-[var(--dimmer)]">
        <span>All 30 teams by projected 2027 WAR, fewest to most</span>
        <span className="hidden sm:inline">Yours moves as you build · click a team to switch</span>
      </div>
      <div ref={scroller} className="overflow-x-auto">
        <ol className="relative h-[3.25rem] min-w-[1080px]">
          {ranked.map(([code, war], i) => {
            const mine = code === team
            return (
              <li
                key={code}
                className="absolute inset-y-0 left-0 px-px transition-transform duration-500 ease-out"
                style={{ width: `${slot}%`, transform: `translateX(${i * 100}%)` }}
              >
                <button
                  type="button"
                  onClick={() => onPick(code)}
                  aria-label={`${TEAM_NAMES[code]}: ${war.toFixed(1)} projected WAR, about ${Math.round(winsFor(war))} wins, ${ordinal(ranked.length - i)} of ${ranked.length}`}
                  aria-current={mine ? 'true' : undefined}
                  title={`${TEAM_NAMES[code]}: about ${Math.round(winsFor(war))} wins`}
                  className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md text-center leading-tight ${
                    mine ? 'bg-[var(--accent-dim)] ring-2 ring-inset ring-[var(--accent)]' : 'hover:bg-[var(--bg)]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://www.mlbstatic.com/team-logos/${MLB_TEAM_IDS[code]}.svg`} alt="" className="h-6 w-6 object-contain" />
                  <span className={`font-mono text-[11px] ${mine ? 'font-semibold text-[var(--text)]' : 'text-[var(--dim)]'}`}>{war.toFixed(1)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

// The luxury-tax payroll as a vertical gauge: filled from the bottom, with the tax line and the
// three tiers above it marked on the left. The tiers sit only a few pixels apart, so their
// labels are staggered in two columns. The right side is kept for the current figure, which
// rides at the top of the fill. Fill and marker animate with a transform.
function TaxGauge({ taxPayroll, threshold }: { taxPayroll: number; threshold: NonNullable<Meta['taxThreshold']> }) {
  const lines = [threshold.base, ...threshold.tiers]
  const max = Math.max(taxPayroll, lines[lines.length - 1]) * 1.06
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  // Slides a full-height layer down so that its top edge sits at the payroll level.
  const level = { transform: `translateY(${100 - Math.min(100, (taxPayroll / max) * 100)}%)` }
  return (
    <div
      className="flex min-h-[8.5rem] shrink-0 items-stretch self-stretch text-[11px] text-[var(--dim)]"
      role="img"
      aria-label={`Luxury-tax payroll ${money(taxPayroll)} against a ${money(threshold.base, 0)} tax line, with tiers 20, 40 and 60 million above it`}
      title={`Luxury-tax payroll ${money(taxPayroll)}. Tax line ${money(threshold.base, 0)}; tiers at ${threshold.tiers.map((t) => money(t, 0)).join(', ')}.`}
    >
      {/* Tier labels: the tax line and +40 in the outer column, +20 and +60 next to the bar */}
      <div className="relative w-[4.25rem]">
        {lines.map((v, i) => (
          <span
            key={v}
            className={`absolute translate-y-1/2 whitespace-nowrap leading-none ${i % 2 === 0 ? 'right-9' : 'right-2'} ${i === 0 ? 'font-semibold text-[var(--text)]' : ''}`}
            style={{ bottom: at(v) }}
          >
            {i === 0 ? money(v, 0) : `+${(v - threshold.base) / 1e6}`}
          </span>
        ))}
      </div>
      <div className="relative w-5 rounded-full bg-[var(--rule)]">
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="h-full w-full bg-[var(--accent)] transition-transform duration-300" style={level} />
        </div>
        {lines.map((v, i) => (
          // Outer-column labels get a longer tick that reaches across the inner column.
          <div key={v} className={`absolute -right-1 h-px ${i % 2 === 0 ? '-left-8' : '-left-1'} ${i === 0 ? 'bg-[var(--text)]' : 'bg-[var(--dim)]'}`} style={{ bottom: at(v) }} />
        ))}
        <div className="pointer-events-none absolute inset-0 transition-transform duration-300" style={level}>
          <div className="absolute -left-0.5 -right-2 top-0 h-0.5 -translate-y-1/2 bg-[var(--text)]" />
        </div>
      </div>
      {/* Where this roster's luxury-tax payroll sits */}
      <div className="relative w-12">
        <div className="pointer-events-none absolute inset-0 transition-transform duration-300" style={level}>
          <span className="absolute left-2.5 top-0 -translate-y-1/2 whitespace-nowrap font-mono font-medium leading-none text-[var(--text)]">{money(taxPayroll, 0)}</span>
        </div>
      </div>
    </div>
  )
}

// "$60.9M under the tax line" / "$12.0M over the tax line" / "$45.1M over, past the +40 tier"
function taxStanding(taxPayroll: number, threshold: NonNullable<Meta['taxThreshold']>): React.ReactNode {
  const over = taxPayroll - threshold.base
  if (over <= 0) return `${money(-over)} under the tax line`
  const passed = threshold.tiers.filter((t) => taxPayroll > t).length
  return <span className="text-[var(--accent)]">{money(over)} over{passed ? `, past the +${(threshold.tiers[passed - 1] - threshold.base) / 1e6} tier` : ' the tax line'}</span>
}

function Delta({ now, then }: { now: number; then: number }) {
  const d = now - then
  if (Math.abs(d) < 500) return null
  return <span className={`ml-1.5 text-sm font-semibold ${d > 0 ? 'text-[var(--accent)]' : 'text-[#1a7a3a]'}`}>{d > 0 ? '+' : ''}{money(d)}</span>
}

function WarDelta({ now, then }: { now: number; then: number }) {
  const d = Math.round((now - then) * 10) / 10
  if (!d) return null
  return <span className={`ml-1.5 text-sm font-semibold ${d > 0 ? 'text-[#1a7a3a]' : 'text-[var(--accent)]'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>
}

// In whole games, to match the rounded record it sits beside.
function WinsDelta({ now, then }: { now: number; then: number }) {
  const d = Math.round(now) - Math.round(then)
  if (!d) return null
  return <span className={`ml-1.5 text-sm font-semibold ${d > 0 ? 'text-[#1a7a3a]' : 'text-[var(--accent)]'}`}>{d > 0 ? '+' : ''}{d} W</span>
}

// A payroll change: red when it adds money, green when it saves it, a dash when it's a wash.
function PayrollEffect({ dollars, className = '', suffix = '' }: { dollars: number; className?: string; suffix?: string }) {
  if (Math.abs(dollars) < 500) return <span className={`font-mono text-[var(--dimmer)] ${className}`}>—</span>
  return (
    <span className={`font-mono font-semibold ${dollars > 0 ? 'text-[var(--accent)]' : 'text-[#1a7a3a]'} ${className}`}>
      {dollars > 0 ? '+' : ''}{money(dollars)}{suffix && <span className="font-sans font-normal">{suffix}</span>}
    </span>
  )
}

function Stat({ label, value, delta, sub }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--dimmer)]">{label}</div>
      {/* The note shares the number's line, so the four totals stack compactly */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xl font-bold leading-tight tracking-tight sm:text-2xl" aria-live="polite">{value}{delta}</span>
        {sub && <span className="text-[11px] text-[var(--dim)]">{sub}</span>}
      </div>
    </div>
  )
}

function describeMove(m: Move, name: string, ownPlayer = false): string {
  switch (m.type) {
    case 'remove': return `Removed ${name}`
    case 'decline': return `Declined ${name}'s option`
    case 'exercise': return `Exercised ${name}'s option${m.salary != null ? ` at ${money(m.salary)}` : ''}`
    case 'optOut': return `${name} opted out`
    case 'resign': return `Re-signed ${name} at ${money(m.salary)}`
    case 'salary': return `Set ${name}'s salary to ${money(m.salary)}`
    case 'add': return m.salary != null ? `${ownPlayer ? 'Re-signed' : 'Signed'} ${name} at ${money(m.salary)}` : `Traded for ${name}`
    case 'promote': return `Added ${name} to the 40-man`
  }
}

export default function TeamBuilderApp() {
  const router = useRouter()
  const params = useSearchParams()
  const teamParam = params.get('team')?.toUpperCase()
  const team = teamParam && TEAM_NAMES[teamParam] ? teamParam : DEFAULT_TEAM

  const [meta, setMeta] = useState<Meta | null>(null)
  const [data, setData] = useState<TeamFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [movesByTeam, setMovesByTeam] = useState<Record<string, Move[]>>({})
  const [editing, setEditing] = useState<{ id: number; kind: 'resign' | 'exercise' | 'salary' | 'add' } | null>(null)
  const [pool, setPool] = useState<PoolPlayer[]>([])
  const [poolKind, setPoolKind] = useState<'fa' | 'roster'>('fa')
  const [poolPos, setPoolPos] = useState('all')
  const [poolQuery, setPoolQuery] = useState('')
  const [poolShown, setPoolShown] = useState(POOL_PAGE)
  const [minorsShown, setMinorsShown] = useState(MINORS_PAGE)
  const [phonePanel, setPhonePanel] = useState<'roster' | 'market'>('roster')
  const [groupBy, setGroupBy] = useState<GroupBy>('position')
  const [sortBy, setSortBy] = useState<SortBy>('war')
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as { groupBy?: string; sortBy?: string } | null
      if (saved?.groupBy && saved.groupBy in GROUP_BY) setGroupBy(saved.groupBy as GroupBy)
      if (saved?.sortBy && saved.sortBy in SORT_BY) setSortBy(saved.sortBy as SortBy)
    } catch { /* private mode or blocked storage: just use the defaults */ }
  }, [])
  const setView = (next: { groupBy?: GroupBy; sortBy?: SortBy }) => {
    if (next.groupBy) setGroupBy(next.groupBy)
    if (next.sortBy) setSortBy(next.sortBy)
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ groupBy: next.groupBy ?? groupBy, sortBy: next.sortBy ?? sortBy })) } catch { /* not essential */ }
  }

  const moves = movesByTeam[team] ?? []
  const setMoves = (next: Move[]) => setMovesByTeam((all) => ({ ...all, [team]: next }))

  // Share links. The address always holds the team and the list of changes ("m"), so it can
  // be copied at any point. A link also carries the day it was made ("d"), shown until the
  // roster is changed again.
  const [hydrated, setHydrated] = useState(false)
  const [shared, setShared] = useState<{ team: string; m: string; date: Date | null } | null>(null)
  const [copied, setCopied] = useState<'copied' | 'manual' | null>(null)
  useEffect(() => {
    const m = params.get('m')
    const fromLink = decodeMoves(m)
    if (fromLink.length) {
      setMovesByTeam({ [team]: fromLink })
      setShared({ team, m: encodeMoves(fromLink), date: decodeDate(params.get('d')) })
    }
    setHydrated(true)
    // Only on first load: after that the page writes the address, it doesn't read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const encoded = encodeMoves(moves)
  const stillShared = shared != null && shared.team === team && shared.m === encoded
  const shareQuery = (withDate: boolean) => {
    const q = new URLSearchParams({ team })
    if (encoded) q.set('m', encoded)
    if (encoded && withDate) q.set('d', encodeDate(new Date()))
    return q.toString()
  }
  useEffect(() => {
    if (!hydrated) return
    const q = new URLSearchParams({ team })
    if (encoded) q.set('m', encoded)
    if (stillShared && shared?.date) q.set('d', encodeDate(shared.date))
    const next = `/team-builder?${q.toString()}`
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, '', next)
  }, [hydrated, team, encoded, stillShared, shared])
  const copyLink = async () => {
    const url = `${window.location.origin}/team-builder?${shareQuery(true)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied('copied')
      setTimeout(() => setCopied(null), 2500)
    } catch {
      setCopied('manual') // no clipboard access: show the link to copy by hand
    }
  }
  const act = (m: Move) => { setMoves(addMove(moves, m)); setEditing(null) }
  const undo = (id: number) => { setMoves(undoPlayer(moves, id)); setEditing(null) }

  useEffect(() => {
    fetch(`${DATA}/meta.json`).then((r) => r.json()).then(setMeta).catch(() => setError('Could not load the roster data.'))
    // The market isn't needed to draw the roster, so a failure here is not fatal.
    fetch(`${DATA}/pool.json`).then((r) => r.json()).then(setPool).catch(() => setPool([]))
  }, [])

  // The server sets the title for the team a link opens on; keep it right when switching teams.
  useEffect(() => {
    document.title = `${TEAM_NAMES[team]}: 2027 Team Builder — Baseball Hopper`
  }, [team])

  useEffect(() => {
    setData(null)
    setEditing(null)
    setMinorsShown(MINORS_PAGE)
    fetch(`${DATA}/teams/${team}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load the roster data.'))
  }, [team])

  const start = useMemo(() => (data ? buildRoster(data, []) : null), [data])
  const built = useMemo(() => (data ? buildRoster(data, moves, pool) : null), [data, moves, pool])

  // The totals bar is pinned; the market column pins just below it, so measure the bar.
  // A callback ref, so measuring starts whenever the bar actually mounts (it waits on the data).
  const [totalsEl, setTotalsEl] = useState<HTMLElement | null>(null)
  const [totalsHeight, setTotalsHeight] = useState(0)
  // The totals panel scrolls with the page; a one-line summary takes over under the pinned
  // strip once the panel is out of view (the margin discounts what the header and strip cover).
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null)
  const [panelInView, setPanelInView] = useState(true)
  useEffect(() => {
    if (!panelEl) return
    const io = new IntersectionObserver(([e]) => setPanelInView(e.isIntersecting), { rootMargin: `-${56 + totalsHeight + 8}px 0px 0px 0px` })
    io.observe(panelEl)
    return () => io.disconnect()
  }, [panelEl, totalsHeight])
  useLayoutEffect(() => {
    if (!totalsEl) return
    const ro = new ResizeObserver(() => setTotalsHeight(totalsEl.offsetHeight))
    ro.observe(totalsEl)
    return () => ro.disconnect()
  }, [totalsEl])

  // Each team keeps its own list of changes; the address is rewritten for the team picked.
  const pickTeam = (t: string) => {
    setCopied(null)
    router.replace(`/team-builder?team=${t}`, { scroll: false })
  }

  const minimum = meta?.assumptions.leagueMinimum.value ?? 780_000
  // Read straight from the assumptions file, so changing it doesn't wait for a data refresh.
  const perWin = assumptions.dollarsPerWar.value
  const priceOf = (war: number | null | undefined) => warPrice(war, perWin, minimum)
  // The opening figure for signing a free agent: WAR × $/win, else his 2026 pay, else the minimum.
  const signingStart = (war: number | null | undefined, prev: number | null) => priceOf(war) ?? Math.max(prev ?? minimum, minimum)
  const signingHint = (war: number | null | undefined) =>
    war != null
      ? `${war.toFixed(1)} projected WAR × ${money(perWin)} per win: an estimated 2027 salary for one year, not a contract total. Change it freely.`
      : 'No projection for him, so this starts at his 2026 salary (or the league minimum). Change it freely.'

  const sumWar = (slots: Slot[]) => slots.filter((s) => s.onRoster).reduce((n, s) => n + (s.player.war ?? 0), 0)
  const teamWar = built ? sumWar(built.slots) : 0
  const startWar = start ? sumWar(start.slots) : 0

  // Every team's projected WAR from the pool (default rosters); the selected team's is live.
  const teamWars = useMemo(() => {
    const w: Record<string, number> = Object.fromEntries(Object.keys(TEAM_NAMES).map((t) => [t, 0]))
    for (const e of pool) if (e.kind === 'roster' && !e.minors && e.from && e.from in w) w[e.from] += e.war ?? 0
    return w
  }, [pool])
  const liveWars = { ...teamWars, ...(built ? { [team]: teamWar } : {}) }
  // One scale for everyone, from today's default rosters (see lib/team-builder/record.ts).
  const scale = warScale(Object.values(teamWars))
  const record = projectedRecord(teamWar, scale)
  const startRecord = projectedRecord(startWar, scale)
  // What each change did to payroll, in order (they add up to the total change).
  const effects = useMemo(() => (data ? payrollEffects(data, moves, pool) : []), [data, moves, pool])
  const rank = Object.values(liveWars).filter((w) => w > teamWar).length + 1

  const playingTime = (slots: Slot[]) => slots.filter((s) => s.onRoster).reduce((t, s) => ({ pa: t.pa + (s.player.pa ?? 0), ip: t.ip + (s.player.ip ?? 0) }), { pa: 0, ip: 0 })
  const { pa: hitterPa, ip: pitcherIp } = playingTime(built?.slots ?? [])
  const startTime = playingTime(start?.slots ?? [])
  // Every 40-man is projected for more playing time than a season has (ZiPS projects each player
  // on his own), so only warn when the user's moves push well past today's roster.
  const addedPa = hitterPa - startTime.pa
  const addedIp = pitcherIp - startTime.ip
  const overPlaying = addedPa > startTime.pa * 0.15 || addedIp > startTime.ip * 0.15

  const touched = new Set(moves.map((m) => m.id))
  const nameOf = (id: number) => built?.slots.find((s) => s.player.mlbamId === id)?.player.name ?? pool.find((e) => e.mlbamId === id)?.name ?? 'a player no longer listed'
  // Until the market has loaded, signings and trades can't be checked, so nothing is flagged yet.
  const skipped = built && pool.length ? built.skipped : []
  const stale = meta?.staleTeams?.[team]
  const fieldWar = warBySpot((built?.slots ?? []).filter((s) => s.onRoster).map((s) => s.player))
  const updated = meta ? new Date(meta.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

  const ownPoolFreeAgents: PoolSlot[] = built
    ? pool
        .filter((e) => e.kind === 'fa' && e.from === team && !built.slots.some((s) => s.player.mlbamId === e.mlbamId))
        .map((e) => ({ player: poolToPlayer(e), onRoster: false, salary: null, taxValue: null, owed: 0, offReason: 'free-agent' as const, fromPool: true }))
    : []

  const poolResults = useMemo(() => {
    if (!built) return []
    const here = new Set(built.slots.filter((s) => s.onRoster).map((s) => s.player.mlbamId))
    const q = poolQuery.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return pool
      .filter((e) => e.kind === poolKind && e.from !== team && !here.has(e.mlbamId) && (poolPos === 'all' || posBucket(e.pos) === poolPos))
      .filter((e) => !q || e.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
      .sort((a, b) => (b.war ?? -99) - (a.war ?? -99) || a.name.localeCompare(b.name))
  }, [built, pool, poolKind, poolPos, poolQuery, team])

  const addEditor = (e: PoolPlayer) => {
    if (editing?.id !== e.mlbamId || editing.kind !== 'add') return undefined
    return (
      <SalaryForm
        initial={e.kind === 'fa' ? signingStart(e.war, e.salaryPrevYear) : null}
        hint={e.kind === 'fa' ? signingHint(e.war) : "No source gives this player's 2027 salary. Enter a figure to trade for him."}
        onSave={(salary) => act({ type: 'add', id: e.mlbamId, salary })}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const editorFor = (s: PoolSlot) => {
    const id = s.player.mlbamId!
    if (editing?.id !== id || editing.kind === 'add') return undefined
    if (editing.kind === 'resign') {
      return (
        <SalaryForm
          initial={signingStart(s.player.war, s.player.salaryPrevYear)}
          hint={signingHint(s.player.war)}
          // A free agent who has already dropped off the team's sheet comes back from the pool.
          onSave={(salary) => act({ type: s.fromPool ? 'add' : 'resign', id, salary })}
          onCancel={() => setEditing(null)}
        />
      )
    }
    if (editing.kind === 'exercise') {
      return (
        <SalaryForm
          initial={null}
          hint="No source gives this option's salary. Enter the figure to exercise it."
          onSave={(salary) => act({ type: 'exercise', id, salary })}
          onCancel={() => setEditing(null)}
        />
      )
    }
    return (
      <SalaryForm
        initial={s.salary}
        hint="Your figure replaces the estimate for both payroll totals."
        onSave={(salary) => act({ type: 'salary', id, salary })}
        onCancel={() => setEditing(null)}
      />
    )
  }

  // Buttons for a player on the 2027 roster.
  const rosterActions = (s: Slot) => {
    const p = s.player
    const id = p.mlbamId
    if (!id) return null
    const b: React.ReactNode[] = []
    const edit = salaryEditable(s) && <ActionButton key="e" label={`Edit ${p.name}'s salary`} onClick={() => setEditing({ id, kind: 'salary' })}>Edit salary</ActionButton>
    if (s.added || s.promoted) {
      if (edit) b.push(edit)
      b.push(<ActionButton key="u" label={`Remove ${p.name}`} onClick={() => undo(id)}>{s.promoted ? 'Send down' : 'Remove'}</ActionButton>)
      return b
    }
    if (p.status === 'option') {
      b.push(<ActionButton key="d" label={`Decline ${p.name}'s option`} onClick={() => act({ type: 'decline', id })}>{p.decidedBy === 'player' ? 'Player declines' : 'Decline'}</ActionButton>)
    } else if (p.playerOption) {
      b.push(<ActionButton key="o" label={`${p.name} opts out`} onClick={() => act({ type: 'optOut', id })}>Player opts out</ActionButton>)
    }
    if (p.status === 'fa') b.push(<ActionButton key="u" label={`Undo re-signing ${p.name}`} onClick={() => undo(id)}>Undo</ActionButton>)
    else if (p.status !== 'option') {
      b.push(
        <ActionButton key="r" label={`Remove ${p.name}`} onClick={() => act({ type: 'remove', id })}>
          {p.status === 'arb' ? 'Non-tender' : p.status === 'signed' ? 'Trade away' : 'Remove'}
        </ActionButton>,
      )
    }
    if (edit) b.push(edit)
    if (touched.has(id) && p.status !== 'fa') b.push(<ActionButton key="x" label={`Undo changes to ${p.name}`} onClick={() => undo(id)}>Undo</ActionButton>)
    return b
  }

  // Buttons and the "what it costs" column for a player off the roster.
  const offRoster = (s: PoolSlot) => {
    const p = s.player
    const id = p.mlbamId!
    const userMade = touched.has(id)
    const actions: React.ReactNode[] = []
    if (userMade) actions.push(<ActionButton key="u" label={`Undo changes to ${p.name}`} onClick={() => undo(id)}>Undo</ActionButton>)
    else if (s.offReason === 'declined') {
      actions.push(
        <ActionButton key="x" label={`Exercise ${p.name}'s option`} onClick={() => (p.salary == null ? setEditing({ id, kind: 'exercise' }) : act({ type: 'exercise', id }))}>
          Exercise
        </ActionButton>,
      )
    } else if (s.offReason === 'free-agent') {
      actions.push(<ActionButton key="r" label={`Re-sign ${p.name}`} onClick={() => setEditing({ id, kind: 'resign' })}>Re-sign</ActionButton>)
    }
    const reason =
      s.offReason === 'declined' ? (userMade ? 'Option declined' : 'Declined by default')
        : s.offReason === 'opted-out' ? 'Opted out'
          : s.offReason === 'removed' ? 'Removed'
            : 'Free agent'
    const right = (
      <span className="text-[11px] text-[var(--dim)]">
        {s.owed ? <>Buyout <span className="font-mono text-[var(--text)]">{money(s.owed, 2)}</span></> : reason}
        {s.offReason === 'declined' && <span className="block text-[var(--dimmer)]">{p.salary != null ? `Option ${money(p.salary)}` : 'Option salary unknown'}</span>}
      </span>
    )
    return { actions, right }
  }

  const onRosterSlots = built ? built.slots.filter((s) => s.onRoster) : []
  const offRosterSlots: PoolSlot[] = built ? [...built.slots.filter((s) => !s.onRoster && s.offReason !== 'minors'), ...ownPoolFreeAgents] : []
  const minorSlots = built ? built.slots.filter((s) => !s.onRoster && s.offReason === 'minors').sort((a, b) => (b.player.war ?? 0) - (a.player.war ?? 0)) : []
  const byWar = (a: Slot, b: Slot) => (b.player.war ?? -99) - (a.player.war ?? -99)
  // Last name first for sorting: Cot's names are stored "Last, First"; others are "First Last".
  const sortName = (p: Player) => (p.sheetName.includes(',') ? p.sheetName : `${p.name.split(' ').slice(1).join(' ')}, ${p.name.split(' ')[0]}`).toLowerCase()
  const rosterSort = (a: Slot, b: Slot) =>
    sortBy === 'salary' ? (b.salary ?? -1) - (a.salary ?? -1) || byWar(a, b)
      : sortBy === 'name' ? sortName(a.player).localeCompare(sortName(b.player))
        : byWar(a, b)
  const isPitcher = (s: Slot) => ['SP', 'RP'].includes(posBucket(s.player.pos))
  const rosterGroups: { key: string; title: string; test: (s: Slot) => boolean }[] =
    groupBy === 'position' ? POSITION_GROUPS.map((g) => ({ ...g, test: (s: Slot) => posBucket(s.player.pos) === g.key }))
      : groupBy === 'role' ? [{ key: 'hitters', title: 'Hitters', test: (s: Slot) => !isPitcher(s) }, { key: 'pitchers', title: 'Pitchers', test: isPitcher }]
        : [{ key: 'all', title: 'All players', test: () => true }]

  return (
    // w-full: the layout centres pages in a flex column, where the wide team strip would
    // otherwise stretch the page instead of scrolling inside its own box.
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">2027 Team Builder</h1>
          <p className="max-w-[55ch] text-sm text-[var(--dim)]">
            Every team&apos;s 2027 roster as it stands today. Decline options, non-tender, trade, sign free agents or call up prospects, and watch payroll, the luxury tax and projected WAR move.
          </p>
        </div>
        <div>
          <label htmlFor="team" className="sr-only">Team</label>
          <select
            id="team"
            value={team}
            onChange={(e) => pickTeam(e.target.value)}
            className="w-full rounded-lg border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 text-sm font-medium sm:w-64"
          >
            {Object.entries(TEAM_NAMES)
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
      </header>

      {error && <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]">{error}</p>}
      {!error && (!built || !start || !meta) && <p className="py-10 text-center text-sm text-[var(--dimmer)]">Loading…</p>}

      {built && start && meta && (
        <div className="space-y-4">
          {stale && (
            <p className="max-w-[58ch] text-xs text-[var(--accent)]">
              {`Cot's sheet for the ${TEAM_NAMES[team]} didn't pass today's checks (it's probably mid-update), so this shows the last version that did.`}
            </p>
          )}

          {/* Pinned on wider screens: the team strip, and, once the totals panel below has
              scrolled away, a one-line summary of it (overlaid, so nothing jumps). */}
          <div ref={setTotalsEl} className="relative z-20 sm:sticky sm:top-14">
            {pool.length > 0 && (
              <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 shadow-[var(--panel-shadow)]">
                <TeamStrip wars={liveWars} team={team} onPick={pickTeam} winsFor={(w) => projectedRecord(w, scale).wins} />
              </section>
            )}
            <div
              aria-hidden={panelInView}
              className={`absolute inset-x-0 top-full mt-1 hidden flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-1.5 text-sm shadow-[var(--elevated-shadow)] transition-opacity duration-200 sm:flex ${panelInView ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            >
              <span><span className="text-[11px] text-[var(--dimmer)]">Payroll </span><span className="font-semibold">{money(built.payroll)}</span><Delta now={built.payroll} then={start.payroll} /></span>
              <span><span className="text-[11px] text-[var(--dimmer)]">Tax payroll </span><span className="font-semibold">{money(built.taxPayroll)}</span><Delta now={built.taxPayroll} then={start.taxPayroll} /></span>
              <span><span className="text-[11px] text-[var(--dimmer)]">WAR </span><span className="font-semibold">{teamWar.toFixed(1)}</span><WarDelta now={teamWar} then={startWar} />{pool.length > 0 && <span className="ml-1.5 text-[11px] text-[var(--dim)]">{ordinal(rank)} of 30</span>}</span>
              {pool.length > 0 && <span><span className="text-[11px] text-[var(--dimmer)]">Record </span><span className="font-semibold">{fmtRecord(record)}</span><WinsDelta now={record.wins} then={startRecord.wins} /></span>}
              <span><span className="text-[11px] text-[var(--dimmer)]">40-man </span><span className={`font-semibold ${built.rosterCount > 40 ? 'text-[var(--accent)]' : ''}`}>{built.rosterCount} / 40</span></span>
            </div>
          </div>

          {/* Totals: the tax gauge, the four numbers, and projected WAR by position */}
          <section ref={setPanelEl} className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 shadow-[var(--panel-shadow)]">
            <div className="flex flex-wrap items-stretch justify-around gap-x-8 gap-y-4">
              <div className="flex items-stretch gap-3 sm:gap-5">
              {meta.taxThreshold && <TaxGauge taxPayroll={built.taxPayroll} threshold={meta.taxThreshold} />}
              <div className="grid grid-cols-1 content-center gap-y-2">
                <Stat label="2027 payroll" value={money(built.payroll)} delta={<Delta now={built.payroll} then={start.payroll} />} sub="Salaries, dead money, buyouts" />
                <Stat
                  label="Luxury-tax payroll"
                  value={money(built.taxPayroll)}
                  delta={<Delta now={built.taxPayroll} then={start.taxPayroll} />}
                  sub={meta.taxThreshold ? taxStanding(built.taxPayroll, meta.taxThreshold) : undefined}
                />
                <Stat label="Projected WAR" value={teamWar.toFixed(1)} delta={<WarDelta now={teamWar} then={startWar} />} sub={pool.length ? `${ordinal(rank)} of 30` : undefined} />
                <Stat
                  label="40-man roster"
                  value={`${built.rosterCount} / 40`}
                  sub={built.rosterCount > 40 ? <span className="text-[var(--accent)]">Over 40: someone has to go</span> : `${40 - built.rosterCount} open ${40 - built.rosterCount === 1 ? 'spot' : 'spots'}`}
                />
              </div>
              </div>
              <figure className="flex flex-col items-center">
                <figcaption className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--dimmer)]">Projected WAR by position</figcaption>
                <FieldDiagram spots={fieldWar} record={pool.length ? fmtRecord(record) : undefined} className="h-52 w-auto" />
              </figure>
            </div>
            {overPlaying && (
              <p className="mt-1 max-w-[58ch] text-[11px] text-[var(--accent)]">
                Your moves add {Math.max(0, addedPa).toLocaleString()} PA and {Math.max(0, Math.round(addedIp)).toLocaleString()} IP of projected playing time beyond today&apos;s roster. Not all of the extra WAR would fit.
              </p>
            )}
            {built.unknownSalaries.length > 0 && (
              <p className="mt-1 text-[11px] text-[var(--accent)]">Left out of both totals (no salary known): {built.unknownSalaries.map((p) => p.name).join(', ')}.</p>
            )}
          </section>

          {/* Phones: one column at a time */}
          <div className="flex gap-1 lg:hidden" role="tablist" aria-label="Panel">
            {(['roster', 'market'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={phonePanel === k}
                onClick={() => setPhonePanel(k)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${phonePanel === k ? 'bg-[var(--text)] text-[var(--panel)]' : 'bg-[var(--panel)] text-[var(--dim)]'}`}
              >
                {k === 'roster' ? 'Your roster' : 'Add players'}
              </button>
            ))}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* Left: the roster by position, then everything off it, then the minors */}
            <div className={`space-y-4 ${phonePanel === 'roster' ? '' : 'hidden lg:block'}`}>
              {moves.length > 0 && (
                <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 shadow-[var(--panel-shadow)]">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">
                      Your changes <span className="font-normal text-[var(--dimmer)]">({moves.length})</span>
                      <PayrollEffect dollars={built.payroll - start.payroll} className="ml-2 text-xs" suffix=" payroll" />
                    </h2>
                    <span className="flex items-center gap-3">
                      <button type="button" onClick={copyLink} className="rounded bg-[var(--text)] px-2.5 py-1 text-[11px] font-medium text-[var(--panel)]">
                        {copied === 'copied' ? 'Link copied' : 'Copy share link'}
                      </button>
                      <button type="button" onClick={() => { setMoves([]); setEditing(null); setCopied(null) }} className="text-xs font-medium text-[var(--accent)] hover:underline">
                        Reset
                      </button>
                    </span>
                  </div>
                  {copied === 'manual' && (
                    <input
                      readOnly
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      value={`${window.location.origin}/team-builder?${shareQuery(true)}`}
                      aria-label="Share link"
                      className="mb-2 w-full rounded border border-[var(--rule)] bg-transparent px-2 py-1 font-mono text-[11px]"
                    />
                  )}
                  {stillShared && (
                    <p className="mb-1.5 max-w-[58ch] text-[11px] text-[var(--dim)]">
                      Opened from a shared link{shared?.date ? `, built ${shared.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}. It&apos;s replayed on today&apos;s rosters, so numbers may differ a little from that day.
                    </p>
                  )}
                  {skipped.length > 0 && (
                    <p className="mb-1.5 max-w-[58ch] text-[11px] text-[var(--accent)]">
                      {skipped.length === 1 ? 'One change no longer applies' : `${skipped.length} changes no longer apply`} to today&apos;s rosters (the player has since moved) and {skipped.length === 1 ? "isn't" : "aren't"} counted.{' '}
                      <button type="button" onClick={() => setMoves(moves.filter((m) => !skipped.includes(m)))} className="font-medium underline">Drop {skipped.length === 1 ? 'it' : 'them'}</button>
                    </p>
                  )}
                  <ul className="space-y-1">
                    {moves.map((m, i) => {
                      const text = describeMove(m, nameOf(m.id), pool.some((e) => e.mlbamId === m.id && e.from === team))
                      const gone = skipped.includes(m)
                      return (
                        <li key={`${m.type}-${m.id}`} className="flex items-center justify-between gap-2 text-xs text-[var(--dim)]">
                          <span className="min-w-0 flex-1">
                            <span className={gone ? 'line-through' : undefined}>{text}{gone && <span className="sr-only"> (no longer applies)</span>}</span>
                          </span>
                          {!gone && <PayrollEffect dollars={effects[i] ?? 0} className="shrink-0 text-[11px]" />}
                          <button type="button" onClick={() => setMoves(moves.filter((x) => x !== m))} className="shrink-0 text-[11px] text-[var(--dimmer)] hover:text-[var(--text)] hover:underline" aria-label={`Undo: ${text}`}>
                            Undo
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              <Card
                title="2027 roster"
                aside={`${built.rosterCount} players`}
                controls={
                  <>
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--dim)]">
                      Group by
                      <select value={groupBy} onChange={(e) => setView({ groupBy: e.target.value as GroupBy })} className="rounded border border-[var(--rule)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--text)]">
                        {Object.entries(GROUP_BY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--dim)]">
                      Sort by
                      <select value={sortBy} onChange={(e) => setView({ sortBy: e.target.value as SortBy })} className="rounded border border-[var(--rule)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--text)]">
                        {Object.entries(SORT_BY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                  </>
                }
              >
                {rosterGroups.map((g) => {
                  const slots = onRosterSlots.filter(g.test).sort(rosterSort)
                  if (!slots.length) return null
                  const war = slots.reduce((n, s) => n + (s.player.war ?? 0), 0)
                  const pay = slots.reduce((n, s) => n + (s.salary ?? 0), 0)
                  return (
                    <div key={g.key}>
                      <h3 className="flex items-baseline justify-between px-4 pb-1 pt-3 text-[13px] font-semibold text-[var(--text)]">
                        {g.title}
                        <span className="text-[11px] font-normal text-[var(--dimmer)]">{slots.length} · {war.toFixed(1)} WAR · {money(pay)}</span>
                      </h3>
                      <div className="divide-y divide-[var(--rule)]">
                        {slots.map((s) => <PlayerRow key={s.player.mlbamId ?? s.player.sheetName} s={s} actions={rosterActions(s)} editor={editorFor(s)} />)}
                      </div>
                    </div>
                  )
                })}
              </Card>

              {built.deadMoney.length > 0 && (
                <Card title="Dead money" aside={money(built.deadMoney.reduce((n, d) => n + d.salary, 0))} note="Players no longer on the team who are still owed 2027 money. Counts toward payroll; can't be removed.">
                  {built.deadMoney.map((d) => (
                    <div key={d.name} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="text-sm">{d.name}</span>
                        <span className="block truncate text-[11px] text-[var(--dimmer)]">{d.note}</span>
                      </span>
                      <span className="font-mono text-xs">{money(d.salary, 2)}</span>
                    </div>
                  ))}
                </Card>
              )}

              {offRosterSlots.length > 0 && (
                <Card
                  title="Not on the 2027 roster"
                  aside={offRosterSlots.length}
                  note="Declined options (mutual options start declined; the buyout counts toward payroll), players you removed, and the team's own free agents, who can be re-signed."
                >
                  {offRosterSlots
                    .sort((a, b) => ({ removed: 0, 'opted-out': 1, declined: 2, 'free-agent': 3, minors: 4 })[a.offReason!] - ({ removed: 0, 'opted-out': 1, declined: 2, 'free-agent': 3, minors: 4 })[b.offReason!] || byWar(a, b))
                    .map((s) => {
                      const { actions, right } = offRoster(s)
                      return <PlayerRow key={s.player.mlbamId ?? s.player.sheetName} s={s} actions={actions} right={right} editor={editorFor(s)} />
                    })}
                </Card>
              )}

              {minorSlots.length > 0 && (
                <Card
                  title="Minor leaguers"
                  aside={`${minorSlots.length} projected`}
                  note="Prospects and depth players outside the 40-man that ZiPS projects, best first. Adding one uses a 40-man spot at the league minimum."
                >
                  {minorSlots.slice(0, minorsShown).map((s) => (
                    <PlayerRow
                      key={s.player.mlbamId}
                      s={s}
                      right={<span className="font-mono text-xs italic text-[var(--dim)]">{money(s.salary ?? minimum, 2)}</span>}
                      actions={[<ActionButton key="p" label={`Add ${s.player.name} to the 40-man`} onClick={() => act({ type: 'promote', id: s.player.mlbamId! })}>Add to 40-man</ActionButton>]}
                    />
                  ))}
                  {minorSlots.length > minorsShown && (
                    <button type="button" onClick={() => setMinorsShown((n) => n + 25)} className="w-full py-2 text-xs font-medium text-[var(--dim)] hover:bg-[var(--bg)] hover:text-[var(--text)]">
                      Show more ({minorSlots.length - minorsShown} more)
                    </button>
                  )}
                </Card>
              )}
            </div>

            {/* Right: the market, pinned beside the roster on wide screens */}
            <div
              className={`lg:sticky lg:overflow-y-auto ${phonePanel === 'market' ? '' : 'hidden lg:block'}`}
              style={{ top: 56 + totalsHeight + SUMMARY_LINE + 16, maxHeight: `calc(100vh - ${56 + totalsHeight + SUMMARY_LINE + 32}px)` }}
            >
              <section id="add-players" className="overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--panel-shadow)]">
                <div className="grid grid-cols-2 gap-1 p-2" role="tablist" aria-label="Market">
                  {(['fa', 'roster'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={poolKind === k}
                      onClick={() => { setPoolKind(k); setPoolShown(POOL_PAGE); setEditing(null) }}
                      className={`rounded-lg py-2.5 text-sm font-semibold ${poolKind === k ? 'bg-[var(--text)] text-[var(--panel)]' : 'text-[var(--dim)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
                    >
                      {k === 'fa' ? 'Sign free agents' : 'Trade for players'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 px-4 pb-2">
                  <input
                    type="search"
                    value={poolQuery}
                    onChange={(e) => { setPoolQuery(e.target.value); setPoolShown(POOL_PAGE) }}
                    placeholder={poolKind === 'fa' ? 'Search free agents' : 'Search every other team, prospects included'}
                    aria-label="Search players"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm placeholder:text-[var(--dimmer)]"
                  />
                  <select
                    value={poolPos}
                    onChange={(e) => { setPoolPos(e.target.value); setPoolShown(POOL_PAGE) }}
                    aria-label="Position"
                    className="rounded-lg border border-[var(--rule)] bg-transparent px-2 py-1.5 text-sm"
                  >
                    {POSITIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </div>
                <p className="max-w-[58ch] px-4 pb-2.5 text-[11px] text-[var(--dim)]">
                  {poolKind === 'fa'
                    ? <>Pending free agents, best projected WAR first. Prices are an estimated 2027 salary (one year, not a contract total): projected WAR × {money(perWin)} per win. You can change it when signing.</>
                    : <>Everyone on the other 29 teams, minor leaguers included, best projected WAR first. Trading for one brings his 2027 salary; who goes back isn&apos;t modelled, so remove players yourself.</>}
                </p>
                <div className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                  {poolResults.slice(0, poolShown).map((e) => (
                    <div key={e.mlbamId}>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Headshot id={e.mlbamId} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              <a href={`/player/${e.mlbamId}`} className="text-sm font-medium hover:underline">{e.name}</a>
                              <span className="text-[11px] uppercase text-[var(--dimmer)]">{e.pos}</span>
                            </div>
                            <div className="text-[11px] text-[var(--dimmer)]">
                              {[
                                e.from ? (e.kind === 'fa' ? `last with ${e.from}` : e.minors ? `${e.from} minor leaguer` : e.from) : null,
                                e.age != null ? `age ${e.age}` : null,
                                e.note && !e.minors ? e.note : null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="whitespace-nowrap text-right text-[11px] text-[var(--dim)]">
                            <span className="font-mono">
                              {e.kind === 'fa'
                                ? priceOf(e.war) != null ? <span className="italic text-[var(--text)]">{money(priceOf(e.war)!)}<span className="not-italic text-[var(--dimmer)]">/yr est.</span></span> : '—'
                                : e.salary != null ? <span className="text-[var(--text)]">{money(e.salary)}</span> : 'unknown'}
                            </span>
                            <span className="mt-0.5 block"><WarValue war={e.war} /></span>
                          </span>
                          <ActionButton
                            label={`${e.kind === 'fa' ? 'Sign' : 'Trade for'} ${e.name}`}
                            onClick={() => (e.kind === 'roster' && e.salary != null ? act({ type: 'add', id: e.mlbamId }) : setEditing({ id: e.mlbamId, kind: 'add' }))}
                          >
                            {e.kind === 'fa' ? 'Sign' : 'Trade for'}
                          </ActionButton>
                        </div>
                      </div>
                      {addEditor(e)}
                    </div>
                  ))}
                  {poolResults.length === 0 && <p className="px-4 py-4 text-center text-xs text-[var(--dimmer)]">{pool.length ? 'No players match.' : 'Loading players…'}</p>}
                </div>
                {poolResults.length > poolShown && (
                  <button type="button" onClick={() => setPoolShown((n) => n + 25)} className="w-full border-t border-[var(--rule)] py-2 text-xs font-medium text-[var(--dim)] hover:bg-[var(--bg)] hover:text-[var(--text)]">
                    Show more ({poolResults.length - poolShown} more)
                  </button>
                )}
              </section>
            </div>
          </div>

          {/* Phones: the totals card scrolls away, so keep a slim bar in view instead */}
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[var(--rule)] bg-[var(--panel)] px-4 py-2 text-xs shadow-[var(--elevated-shadow)] sm:hidden">
            <span><span className="text-[var(--dimmer)]">Payroll </span><span className="font-semibold">{money(built.payroll)}</span><Delta now={built.payroll} then={start.payroll} /></span>
            {pool.length > 0
              ? <span><span className="text-[var(--dimmer)]">Record </span><span className="font-semibold">{fmtRecord(record)}</span><WinsDelta now={record.wins} then={startRecord.wins} /></span>
              : <span><span className="text-[var(--dimmer)]">WAR </span><span className="font-semibold">{teamWar.toFixed(1)}</span><WarDelta now={teamWar} then={startWar} /></span>}
          </div>

          <footer className="max-w-[52ch] space-y-1 pb-12 pt-2 text-[11px] text-[var(--dimmer)] sm:pb-0">
            <p>
              Contracts from Cot&apos;s Baseball Contracts{updated ? `, last changed ${updated}` : ''}. Checked daily through March.
              Arbitration projections from <a href={meta.sources.arbitration.url} className="underline hover:text-[var(--dim)]">MLB Trade Rumors</a> ({meta.sources.arbitration.author}); option salaries from MLB Trade Rumors&apos;{' '}
              <a href={meta.sources.options.clubOptions} className="underline hover:text-[var(--dim)]">club</a> and <a href={meta.sources.options.playerOptions} className="underline hover:text-[var(--dim)]">player option</a> previews.
            </p>
            {meta.projections && (
              <p>
                Projected WAR from FanGraphs&apos; <a href={meta.projections.url} className="underline hover:text-[var(--dim)]">{meta.projections.label}</a>. {meta.projections.note} Players with no projection show a dash and count as 0. WAR figures are tinted red from about 1 WAR (deepest at 5+) and blue below zero; hover one for a plain-words reading.
                Free-agent prices use {money(perWin)} per projected WAR for one season, set against what this year&apos;s free agents are paid (FanGraphs&apos; <a href={assumptions.dollarsPerWar.url} className="underline hover:text-[var(--dim)]">$11.2M figure</a> is for multi-year deals, over which WAR declines).
              </p>
            )}
            <p>
              The projected record starts from a replacement-level team (about 48 wins) and adds WAR. Because summed 40-man WAR runs high, every team&apos;s is scaled down by the same factor so the league as a whole plays .500.
              Team WAR is a straight sum of every player&apos;s projection, and each assumes his usual playing time; this roster is projected for {hitterPa.toLocaleString()} PA and {Math.round(pitcherIp).toLocaleString()} IP against about {SEASON_PA.toLocaleString()} and {SEASON_IP.toLocaleString()} in a season, so treat it as a rough guide.
              The tax line and tiers are placeholders until a new labor agreement. Estimates are in italics with &quot;est.&quot;; hover one to see where it comes from. Your roster lives in the page address: use Copy share link to save or post it.
            </p>
          </footer>
        </div>
      )}
    </div>
  )
}
