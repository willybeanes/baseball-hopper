'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { headshotUrl } from '@/lib/player'
import { TEAM_NAMES } from '@/lib/team-builder/teams'
import { isEstimate, money, type Meta, type Player, type TeamFile } from '@/lib/team-builder/roster'
import { addMove, buildRoster, salaryEditable, undoPlayer, type Move, type Slot } from '@/lib/team-builder/moves'

const DATA = '/data/team-builder'
const DEFAULT_TEAM = 'NYM'

const GROUPS: { key: string; title: string; test: (s: Slot) => boolean }[] = [
  { key: 'signed', title: 'Signed', test: (s) => s.player.status === 'signed' },
  { key: 'option', title: 'Options, exercised', test: (s) => s.player.status === 'option' },
  { key: 'arb', title: 'Arbitration', test: (s) => s.player.status === 'arb' },
  { key: 'prearb', title: 'Pre-arbitration', test: (s) => s.player.status === 'prearb' },
  { key: 'resigned', title: 'Re-signed free agents', test: (s) => s.player.status === 'fa' },
]

const SOURCE_LABEL: Record<string, string> = {
  option: 'Option salary from the contract, via MLB Trade Rumors',
  'mlbtr-arb': 'Arbitration projection (MLB Trade Rumors)',
  'rough-arb': 'Rough estimate: MLBTR has no projection for this player',
  minimum: 'League minimum (2026 figure)',
}

const OPTION_LABEL: Record<string, string> = {
  club: 'Club option', mutual: 'Mutual option', player: 'Player option', vesting: 'Vesting option',
  conditional: 'Conditional option', 'opt-out': 'Opt-out', unknown: 'Option',
}

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'solid' | 'warn' }) {
  const cls =
    tone === 'solid'
      ? 'bg-[var(--text)] text-[var(--panel)] border-[var(--text)]'
      : tone === 'warn'
        ? 'bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent)]/30'
        : 'bg-transparent text-[var(--dim)] border-[var(--rule)]'
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-medium leading-4 ${cls}`}>{children}</span>
}

function statusChips(p: Player) {
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
        {money(s.salary, 2)} <span className="font-sans text-[10px] text-[var(--accent)]">yours</span>
      </span>
    )
  }
  if (isEstimate(p)) {
    return (
      <span className="font-mono text-xs italic text-[var(--text)]" title={SOURCE_LABEL[p.salarySource ?? ''] ?? 'Estimate'}>
        {money(s.salary, 2)} <span className="not-italic text-[10px] text-[var(--dimmer)]">est.</span>
      </span>
    )
  }
  return <span className="font-mono text-xs text-[var(--text)]" title={SOURCE_LABEL[p.salarySource ?? '']}>{money(s.salary, 2)}</span>
}

const ageText = (p: Player) => (p.age != null ? `age ${p.age + 1}` : '')

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

// Inline salary entry, in millions. Used for re-signing, exercising an unpriced option and edits.
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
      <span className="w-full text-[11px] text-[var(--dimmer)] sm:w-auto">{hint}</span>
    </form>
  )
}

function PlayerRow({ s, actions, right, editor }: { s: Slot; actions?: React.ReactNode; right?: React.ReactNode; editor?: React.ReactNode }) {
  const p = s.player
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2 sm:grid-cols-[1fr_190px_90px_90px]">
        <div className="flex min-w-0 items-center gap-2.5">
          {p.mlbamId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headshotUrl(p.mlbamId)} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full bg-[var(--track)] object-cover" />
          ) : (
            <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--track)]" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {p.mlbamId ? (
                <a href={`/player/${p.mlbamId}`} className="truncate text-sm font-medium text-[var(--text)] hover:underline">{p.name}</a>
              ) : (
                <span className="truncate text-sm font-medium">{p.name}</span>
              )}
              <span className="text-[11px] uppercase text-[var(--dimmer)]">{p.pos}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {statusChips(p)}
              <span className="text-[11px] text-[var(--dimmer)] sm:hidden">{ageText(p)}</span>
            </div>
            {actions && <div className="mt-1.5 flex flex-wrap gap-1.5">{actions}</div>}
          </div>
        </div>
        <div className="hidden truncate text-[11px] text-[var(--dim)] sm:block" title={p.contract}>
          {p.contract}
          <span className="block text-[var(--dimmer)]">{ageText(p)}</span>
        </div>
        <div className="text-right">{right ?? <Salary s={s} />}</div>
        <div className="hidden text-right font-mono text-xs text-[var(--dim)] sm:block">
          {s.onRoster && s.taxValue != null ? money(s.taxValue, 2) : '—'}
        </div>
      </div>
      {editor}
    </div>
  )
}

function Section({ title, note, count, children }: { title: string; note?: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--panel)] shadow-[var(--panel-shadow)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule)] px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && <span className="text-xs text-[var(--dimmer)]">{count}</span>}
      </div>
      {note && <p className="border-b border-[var(--rule)] bg-[var(--bg)]/40 px-4 py-2 text-[11px] text-[var(--dim)]">{note}</p>}
      <div className="divide-y divide-[var(--rule)]">{children}</div>
    </section>
  )
}

function ColumnHeads({ salary = '2027 salary' }: { salary?: string }) {
  return (
    <div className="hidden grid-cols-[1fr_190px_90px_90px] gap-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dimmer)] sm:grid">
      <span>Player</span>
      <span>Contract</span>
      <span className="text-right">{salary}</span>
      <span className="text-right">Tax value</span>
    </div>
  )
}

function TaxBar({ taxPayroll, threshold }: { taxPayroll: number; threshold: NonNullable<Meta['taxThreshold']> }) {
  const lines = [threshold.base, ...threshold.tiers]
  const max = Math.max(taxPayroll, lines[lines.length - 1]) * 1.08
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const over = taxPayroll - threshold.base
  return (
    <div>
      <div className="relative h-3 rounded-full bg-[var(--track)]" role="img" aria-label={`Luxury-tax payroll ${money(taxPayroll)} against a ${money(threshold.base, 0)} base line`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: pct(taxPayroll) }} />
        {lines.map((v, i) => (
          <div key={v} className={`absolute -top-1 -bottom-1 w-px ${i === 0 ? 'bg-[var(--text)]' : 'bg-[var(--dim)]'}`} style={{ left: pct(v) }} />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-[var(--dim)]">
        {lines.map((v, i) => (
          // The base label sits left of its line so the closely spaced tier labels have room.
          <span key={v} className={`absolute whitespace-nowrap ${i === 0 ? '-translate-x-full pr-1 font-medium text-[var(--text)]' : '-translate-x-1/2'}`} style={{ left: pct(v) }}>
            {i === 0 ? <>{money(v, 0)}<span className="hidden sm:inline"> base</span></> : `+${(v - threshold.base) / 1e6}`}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-[var(--dim)]">
        {over > 0 ? `${money(over)} over the base line.` : `${money(-over)} under the base line.`}{' '}
        <span className="text-[var(--dimmer)]">
          The labor agreement expired after 2026, so the 2027 line ({money(threshold.base, 0)}, from Cot&apos;s) and the tiers 20, 40 and 60 million above it are placeholders until a new deal is signed.
        </span>
      </p>
    </div>
  )
}

function Delta({ now, then }: { now: number; then: number }) {
  const d = now - then
  if (Math.abs(d) < 500) return null
  return <span className={`ml-1.5 text-sm font-semibold ${d > 0 ? 'text-[var(--accent)]' : 'text-[#1a7a3a]'}`}>{d > 0 ? '+' : ''}{money(d)}</span>
}

function Stat({ label, value, delta, sub }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dimmer)]">{label}</div>
      <div className="text-2xl font-bold tracking-tight" aria-live="polite">{value}{delta}</div>
      {sub && <div className="text-[11px] text-[var(--dim)]">{sub}</div>}
    </div>
  )
}

function describeMove(m: Move, name: string): string {
  switch (m.type) {
    case 'remove': return `Removed ${name}`
    case 'decline': return `Declined ${name}'s option`
    case 'exercise': return `Exercised ${name}'s option${m.salary != null ? ` at ${money(m.salary)}` : ''}`
    case 'optOut': return `${name} opted out`
    case 'resign': return `Re-signed ${name} at ${money(m.salary)}`
    case 'salary': return `Set ${name}'s salary to ${money(m.salary)}`
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
  const [editing, setEditing] = useState<{ id: number; kind: 'resign' | 'exercise' | 'salary' } | null>(null)

  const moves = movesByTeam[team] ?? []
  const setMoves = (next: Move[]) => setMovesByTeam((all) => ({ ...all, [team]: next }))
  const act = (m: Move) => { setMoves(addMove(moves, m)); setEditing(null) }
  const undo = (id: number) => { setMoves(undoPlayer(moves, id)); setEditing(null) }

  useEffect(() => {
    fetch(`${DATA}/meta.json`).then((r) => r.json()).then(setMeta).catch(() => setError('Could not load the roster data.'))
  }, [])

  useEffect(() => {
    setData(null)
    setEditing(null)
    fetch(`${DATA}/teams/${team}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load the roster data.'))
  }, [team])

  const start = useMemo(() => (data ? buildRoster(data, []) : null), [data])
  const built = useMemo(() => (data ? buildRoster(data, moves) : null), [data, moves])

  const pickTeam = (t: string) => {
    const q = new URLSearchParams(params.toString())
    q.set('team', t)
    router.replace(`/team-builder?${q.toString()}`, { scroll: false })
  }

  const updated = meta ? new Date(meta.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const bySalary = (a: Slot, b: Slot) => (b.salary ?? -1) - (a.salary ?? -1)
  const minimum = meta?.assumptions.leagueMinimum.value ?? 780_000
  const nameOf = (id: number) => built?.slots.find((s) => s.player.mlbamId === id)?.player.name ?? 'Player'
  const touched = new Set(moves.map((m) => m.id))

  const editorFor = (s: Slot) => {
    const id = s.player.mlbamId!
    if (editing?.id !== id) return undefined
    if (editing.kind === 'resign') {
      const prev = s.player.salaryPrevYear
      return (
        <SalaryForm
          initial={Math.max(prev ?? minimum, minimum)}
          hint="Pre-filled with his 2026 salary as a placeholder. A projection-based price comes once WAR is added."
          onSave={(salary) => act({ type: 'resign', id, salary })}
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
    if (p.status === 'option') {
      b.push(
        <ActionButton key="d" label={`Decline ${p.name}'s option`} onClick={() => act({ type: 'decline', id })}>
          {p.decidedBy === 'player' ? 'Player declines' : 'Decline'}
        </ActionButton>,
      )
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
    if (salaryEditable(s)) {
      b.push(<ActionButton key="e" label={`Edit ${p.name}'s salary`} onClick={() => setEditing({ id, kind: 'salary' })}>Edit salary</ActionButton>)
    }
    if (touched.has(id) && p.status !== 'fa') b.push(<ActionButton key="x" label={`Undo changes to ${p.name}`} onClick={() => undo(id)}>Undo</ActionButton>)
    return b
  }

  // Buttons and the "what it costs" column for a player off the roster.
  const offRoster = (s: Slot) => {
    const p = s.player
    const id = p.mlbamId!
    const userMade = touched.has(id)
    const actions: React.ReactNode[] = []
    if (userMade) actions.push(<ActionButton key="u" label={`Undo changes to ${p.name}`} onClick={() => undo(id)}>Undo</ActionButton>)
    else if (s.offReason === 'declined') {
      actions.push(
        <ActionButton
          key="x"
          label={`Exercise ${p.name}'s option`}
          onClick={() => (p.salary == null ? setEditing({ id, kind: 'exercise' }) : act({ type: 'exercise', id }))}
        >
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
        <span className="block text-[var(--dimmer)]">
          {s.offReason === 'declined' ? (p.salary != null ? `Option ${money(p.salary)}` : 'Option salary unknown') : s.owed ? reason : ''}
        </span>
      </span>
    )
    return { actions, right }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-5">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Team Builder</h1>
        <p className="max-w-2xl text-sm text-[var(--dim)]">
          Every team&apos;s 2027 roster as it stands today. Decline options, non-tender, trade players away or re-sign your free agents, and watch payroll and the luxury tax move.
        </p>
      </header>

      <div className="mb-4">
        <label htmlFor="team" className="sr-only">Team</label>
        <select
          id="team"
          value={team}
          onChange={(e) => pickTeam(e.target.value)}
          className="w-full rounded-lg border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 text-sm font-medium sm:w-72"
        >
          {Object.entries(TEAM_NAMES)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
        </select>
      </div>

      {error && <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]">{error}</p>}

      {!error && (!built || !start || !meta) && <p className="py-10 text-center text-sm text-[var(--dimmer)]">Loading…</p>}

      {built && start && meta && (
        <div className="space-y-4">
          {/* Totals: sticky so they stay in view while making moves */}
          <section className="z-10 rounded-xl sm:sticky sm:top-14 border border-[var(--rule)] bg-[var(--panel)] p-4 shadow-[var(--panel-shadow)]">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="2027 payroll" value={money(built.payroll)} delta={<Delta now={built.payroll} then={start.payroll} />} sub="Salaries, dead money and buyouts" />
              <Stat label="2027 luxury-tax payroll" value={money(built.taxPayroll)} delta={<Delta now={built.taxPayroll} then={start.taxPayroll} />} sub="Average annual values plus benefits" />
              <Stat
                label="40-man roster"
                value={`${built.rosterCount} / 40`}
                sub={built.rosterCount > 40 ? <span className="text-[var(--accent)]">Over 40: someone has to go</span> : 'Players counted below'}
              />
            </div>
            {meta.taxThreshold && (
              <div className="mt-4">
                <TaxBar taxPayroll={built.taxPayroll} threshold={meta.taxThreshold} />
              </div>
            )}
            {built.unknownSalaries.length > 0 && (
              <p className="mt-3 rounded-lg bg-[var(--accent-dim)] px-3 py-2 text-[11px] text-[var(--accent)]">
                Left out of both totals because no source gives the salary: {built.unknownSalaries.map((p) => p.name).join(', ')}.
              </p>
            )}
          </section>

          {/* The change list */}
          {moves.length > 0 && (
            <section className="rounded-xl border border-[var(--rule)] bg-[var(--panel)] px-4 py-3 shadow-[var(--panel-shadow)]">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Your changes <span className="font-normal text-[var(--dimmer)]">({moves.length})</span></h2>
                <button type="button" onClick={() => { setMoves([]); setEditing(null) }} className="text-xs font-medium text-[var(--accent)] hover:underline">
                  Reset to today&apos;s roster
                </button>
              </div>
              <ul className="space-y-1">
                {moves.map((m) => (
                  <li key={`${m.type}-${m.id}`} className="flex items-center justify-between gap-2 text-xs text-[var(--dim)]">
                    <span>{describeMove(m, nameOf(m.id))}</span>
                    <button type="button" onClick={() => setMoves(moves.filter((x) => x !== m))} className="shrink-0 text-[11px] text-[var(--dimmer)] hover:text-[var(--text)] hover:underline" aria-label={`Undo: ${describeMove(m, nameOf(m.id))}`}>
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Roster, by status */}
          {GROUPS.map((g) => {
            const slots = built.slots.filter((s) => s.onRoster && g.test(s)).sort(bySalary)
            if (!slots.length) return null
            return (
              <Section
                key={g.key}
                title={g.title}
                count={slots.length}
                note={
                  g.key === 'option'
                    ? 'Club and player options are shown as exercised. Salaries come from MLB Trade Rumors.'
                    : g.key === 'arb'
                      ? <>Salaries are MLB Trade Rumors&apos; projections (Matt Swartz&apos;s model) unless marked as a rough estimate.</>
                      : g.key === 'prearb'
                        ? `At the league minimum. ${money(minimum, 2)} is the 2026 figure; 2027's depends on the next labor deal.`
                        : g.key === 'resigned'
                          ? 'One-year figures you entered.'
                          : undefined
                }
              >
                <ColumnHeads />
                {slots.map((s) => <PlayerRow key={s.player.mlbamId ?? s.player.sheetName} s={s} actions={rosterActions(s)} editor={editorFor(s)} />)}
              </Section>
            )
          })}

          {built.deadMoney.length > 0 && (
            <Section title="Dead money" count={built.deadMoney.length} note="Players no longer on the team who are still owed 2027 money. Counts toward payroll; can't be removed.">
              {built.deadMoney.map((d) => (
                <div key={d.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2 sm:grid-cols-[1fr_190px_90px_90px]">
                  <span className="text-sm">{d.name}</span>
                  <span className="hidden truncate text-[11px] text-[var(--dim)] sm:block">{d.note}</span>
                  <span className="text-right font-mono text-xs">{money(d.salary, 2)}</span>
                  <span className="hidden text-right font-mono text-xs text-[var(--dim)] sm:block">{money(d.taxValue, 2)}</span>
                </div>
              ))}
            </Section>
          )}

          {(() => {
            const off = built.slots.filter((s) => !s.onRoster)
            if (!off.length) return null
            const order = { removed: 0, 'opted-out': 1, declined: 2, 'free-agent': 3 } as const
            off.sort((a, b) => order[a.offReason!] - order[b.offReason!] || (b.player.salary ?? b.player.salaryPrevYear ?? 0) - (a.player.salary ?? a.player.salaryPrevYear ?? 0))
            return (
              <Section
                title="Not on the 2027 roster"
                count={off.length}
                note="Mutual options start declined because both sides almost never pick one up; the buyout counts toward payroll. Re-sign a free agent to bring him back for one year."
              >
                <ColumnHeads salary="Counts" />
                {off.map((s) => {
                  const { actions, right } = offRoster(s)
                  return <PlayerRow key={s.player.mlbamId ?? s.player.sheetName} s={s} actions={actions} right={right} editor={editorFor(s)} />
                })}
              </Section>
            )
          })()}

          {/* Phones: the totals card is too tall to pin, so keep a slim bar in view instead */}
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-[var(--rule)] bg-[var(--panel)] px-4 py-2 text-xs shadow-[var(--elevated-shadow)] sm:hidden">
            <span>
              <span className="text-[var(--dimmer)]">Payroll </span>
              <span className="font-semibold">{money(built.payroll)}</span>
              <Delta now={built.payroll} then={start.payroll} />
            </span>
            <span>
              <span className="text-[var(--dimmer)]">Tax </span>
              <span className="font-semibold">{money(built.taxPayroll)}</span>
              <Delta now={built.taxPayroll} then={start.taxPayroll} />
            </span>
          </div>

          <footer className="space-y-1 pb-12 pt-2 text-[11px] text-[var(--dimmer)] sm:pb-0">
            <p>
              Contracts from Cot&apos;s Baseball Contracts{updated ? `, last changed ${updated}` : ''}. Checked daily through March.
              Arbitration projections from{' '}
              <a href={meta.sources.arbitration.url} className="underline hover:text-[var(--dim)]">MLB Trade Rumors</a>
              {' '}({meta.sources.arbitration.author}); option salaries from MLB Trade Rumors&apos;{' '}
              <a href={meta.sources.options.clubOptions} className="underline hover:text-[var(--dim)]">club</a> and{' '}
              <a href={meta.sources.options.playerOptions} className="underline hover:text-[var(--dim)]">player option</a> previews.
            </p>
            <p>
              Estimates are in italics with &quot;est.&quot; Hover one to see where it comes from. &quot;Trade away&quot; drops the player&apos;s salary; who comes back in a trade isn&apos;t modelled.
              Ages are for the 2027 season. Your changes aren&apos;t saved yet; share links are coming.
            </p>
          </footer>
        </div>
      )}
    </div>
  )
}
