'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { headshotUrl } from '@/lib/player'
import { TEAM_NAMES } from '@/lib/team-builder/teams'
import { defaultRoster, isEstimate, money, type Meta, type Player, type TeamFile } from '@/lib/team-builder/roster'

const DATA = '/data/team-builder'
const DEFAULT_TEAM = 'NYM'

const GROUPS: { key: string; title: string; test: (p: Player) => boolean }[] = [
  { key: 'signed', title: 'Signed', test: (p) => p.status === 'signed' },
  { key: 'option', title: 'Options, exercised', test: (p) => p.status === 'option' },
  { key: 'arb', title: 'Arbitration', test: (p) => p.status === 'arb' },
  { key: 'prearb', title: 'Pre-arbitration', test: (p) => p.status === 'prearb' },
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

function Salary({ p }: { p: Player }) {
  if (p.salary == null) {
    return <span className="text-xs font-medium text-[var(--accent)]" title="No source gives this option's salary, so it's left out of the totals">unknown</span>
  }
  if (isEstimate(p)) {
    return (
      <span className="font-mono text-xs italic text-[var(--text)]" title={SOURCE_LABEL[p.salarySource ?? ''] ?? 'Estimate'}>
        {money(p.salary, 2)} <span className="not-italic text-[10px] text-[var(--dimmer)]">est.</span>
      </span>
    )
  }
  return <span className="font-mono text-xs text-[var(--text)]" title={SOURCE_LABEL[p.salarySource ?? '']}>{money(p.salary, 2)}</span>
}

const ageText = (p: Player) => (p.age != null ? `age ${p.age + 1}` : '')

function PlayerRow({ p, right, noTax }: { p: Player; right?: React.ReactNode; noTax?: boolean }) {
  return (
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
        </div>
      </div>
      <div className="hidden truncate text-[11px] text-[var(--dim)] sm:block" title={p.contract}>
        {p.contract}
        <span className="block text-[var(--dimmer)]">{ageText(p)}</span>
      </div>
      <div className="text-right">{right ?? <Salary p={p} />}</div>
      <div className="hidden text-right font-mono text-xs text-[var(--dim)] sm:block">
        {p.taxValue != null && !noTax ? money(p.taxValue, 2) : '—'}
      </div>
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
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: pct(taxPayroll) }} />
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dimmer)]">{label}</div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-[var(--dim)]">{sub}</div>}
    </div>
  )
}

export default function TeamBuilderApp() {
  const router = useRouter()
  const params = useSearchParams()
  const teamParam = params.get('team')?.toUpperCase()
  const team = teamParam && TEAM_NAMES[teamParam] ? teamParam : DEFAULT_TEAM

  const [meta, setMeta] = useState<Meta | null>(null)
  const [data, setData] = useState<TeamFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${DATA}/meta.json`).then((r) => r.json()).then(setMeta).catch(() => setError('Could not load the roster data.'))
  }, [])

  useEffect(() => {
    setData(null)
    fetch(`${DATA}/teams/${team}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load the roster data.'))
  }, [team])

  const roster = useMemo(() => (data ? defaultRoster(data) : null), [data])

  const pickTeam = (t: string) => {
    const q = new URLSearchParams(params.toString())
    q.set('team', t)
    router.replace(`/team-builder?${q.toString()}`, { scroll: false })
  }

  const updated = meta ? new Date(meta.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const bySalary = (a: Player, b: Player) => (b.salary ?? -1) - (a.salary ?? -1)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-5">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Team Builder</h1>
        <p className="max-w-2xl text-sm text-[var(--dim)]">
          Every team&apos;s 2027 roster as it stands today: who&apos;s signed, who has an option, who&apos;s headed to arbitration, and what it costs.{' '}
          <span className="text-[var(--dimmer)]">Moving players on and off the roster is coming next.</span>
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

      {!error && (!roster || !meta) && <p className="py-10 text-center text-sm text-[var(--dimmer)]">Loading…</p>}

      {roster && meta && (
        <div className="space-y-4">
          {/* Totals */}
          <section className="rounded-xl border border-[var(--rule)] bg-[var(--panel)] p-4 shadow-[var(--panel-shadow)]">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="2027 payroll" value={money(roster.payroll)} sub="Actual salaries, dead money and buyouts" />
              <Stat label="2027 luxury-tax payroll" value={money(roster.taxPayroll)} sub="Average annual values plus benefits" />
              <Stat
                label="40-man roster"
                value={`${roster.onRoster.length} / 40`}
                sub={roster.onRoster.length > 40 ? <span className="text-[var(--accent)]">Over 40: someone has to go</span> : 'Players counted below'}
              />
            </div>
            {meta.taxThreshold && (
              <div className="mt-4">
                <TaxBar taxPayroll={roster.taxPayroll} threshold={meta.taxThreshold} />
              </div>
            )}
            {roster.unknownSalaries.length > 0 && (
              <p className="mt-3 rounded-lg bg-[var(--accent-dim)] px-3 py-2 text-[11px] text-[var(--accent)]">
                Left out of both totals because no source gives the salary: {roster.unknownSalaries.map((p) => p.name).join(', ')}.
              </p>
            )}
          </section>

          {/* Roster, by status */}
          {GROUPS.map((g) => {
            const players = roster.onRoster.filter(g.test).sort(bySalary)
            if (!players.length) return null
            return (
              <Section
                key={g.key}
                title={g.title}
                count={players.length}
                note={
                  g.key === 'option'
                    ? 'Club and player options are shown as exercised. Salaries come from MLB Trade Rumors.'
                    : g.key === 'arb'
                      ? <>Salaries are MLB Trade Rumors&apos; projections (Matt Swartz&apos;s model) unless marked as a rough estimate.</>
                      : g.key === 'prearb'
                        ? `At the league minimum. ${money(meta.assumptions.leagueMinimum.value, 2)} is the 2026 figure; 2027's depends on the next labor deal.`
                        : undefined
                }
              >
                <ColumnHeads />
                {players.map((p) => <PlayerRow key={`${p.sheetName}-${p.pos}`} p={p} />)}
              </Section>
            )
          })}

          {roster.deadMoney.length > 0 && (
            <Section title="Dead money" count={roster.deadMoney.length} note="Players no longer on the team who are still owed 2027 money. Counts toward payroll; can't be removed.">
              {roster.deadMoney.map((d) => (
                <div key={d.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2 sm:grid-cols-[1fr_190px_90px_90px]">
                  <span className="text-sm">{d.name}</span>
                  <span className="hidden truncate text-[11px] text-[var(--dim)] sm:block">{d.note}</span>
                  <span className="text-right font-mono text-xs">{money(d.salary, 2)}</span>
                  <span className="hidden text-right font-mono text-xs text-[var(--dim)] sm:block">{money(d.taxValue, 2)}</span>
                </div>
              ))}
            </Section>
          )}

          {(roster.declinedOptions.length > 0 || roster.freeAgents.length > 0) && (
            <Section
              title="Not on the 2027 roster"
              count={roster.declinedOptions.length + roster.freeAgents.length}
              note="Mutual options start declined because both sides almost never pick one up; the buyout counts toward payroll. Free agents can be re-signed once moves are added."
            >
              <ColumnHeads salary="Counts" />
              {[...roster.declinedOptions].sort(bySalary).map((p) => (
                <PlayerRow
                  key={p.sheetName}
                  p={p}
                  noTax
                  right={
                    <span className="text-[11px] text-[var(--dim)]">
                      {p.buyout ? <>Buyout <span className="font-mono text-[var(--text)]">{money(p.buyout, 2)}</span></> : 'No buyout'}
                      <span className="block text-[var(--dimmer)]">{p.salary != null ? `Option ${money(p.salary)}` : 'Option salary unknown'}</span>
                    </span>
                  }
                />
              ))}
              {roster.freeAgents.map((p) => (
                <PlayerRow key={p.sheetName} p={p} right={<span className="text-[11px] text-[var(--dimmer)]">—</span>} />
              ))}
            </Section>
          )}

          <footer className="space-y-1 pt-2 text-[11px] text-[var(--dimmer)]">
            <p>
              Contracts from Cot&apos;s Baseball Contracts{updated ? `, last changed ${updated}` : ''}. Checked daily through March.
              Arbitration projections from{' '}
              <a href={meta.sources.arbitration.url} className="underline hover:text-[var(--dim)]">MLB Trade Rumors</a>
              {' '}({meta.sources.arbitration.author}); option salaries from MLB Trade Rumors&apos;{' '}
              <a href={meta.sources.options.clubOptions} className="underline hover:text-[var(--dim)]">club</a> and{' '}
              <a href={meta.sources.options.playerOptions} className="underline hover:text-[var(--dim)]">player option</a> previews.
            </p>
            <p>
              Estimates are in italics with &quot;est.&quot; Hover one to see where it comes from. Ages are for the 2027 season.
            </p>
          </footer>
        </div>
      )}
    </div>
  )
}
