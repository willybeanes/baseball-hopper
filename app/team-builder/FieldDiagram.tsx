'use client'

import { useState } from 'react'
import { FIELD_SPOTS, SPOT_NAMES, type FieldSpot, type SpotWar } from '@/lib/team-builder/field'

const W = 300
const H = 262

// Where each number sits on the field (viewBox units). Home plate is at the bottom.
const AT: Partial<Record<FieldSpot, [number, number]>> = {
  CF: [150, 54], LF: [70, 98], RF: [230, 98],
  SS: [116, 140], '2B': [184, 140], '3B': [100, 181], '1B': [200, 181],
  SP: [150, 178], C: [150, 242],
}
// Bullpen and DH sit off the field, as labels; their cards open from these points.
const OFF_FIELD: { spot: FieldSpot; name: string; y: number; anchor: [number, number] }[] = [
  { spot: 'RP', name: 'Bullpen', y: 16, anchor: [24, 40] },
  { spot: 'DH', name: 'DH', y: 214, anchor: [24, 200] },
]
// A full tint means a star-level spot; starters as a group get a higher bar.
const FULL_TINT: Partial<Record<FieldSpot, number>> = { SP: 14 }
const LIST_MAX = 8

const fmt = (war: number) => (Math.abs(war) < 0.05 ? '0.0' : war.toFixed(1))

function spokenTip(spot: FieldSpot, s: SpotWar): string {
  const who = s.players.filter((p) => Math.abs(p.war) >= 0.05).map((p) => `${p.name} ${p.war.toFixed(1)}`)
  return `${SPOT_NAMES[spot]}: ${fmt(s.war)} projected WAR${who.length ? `, from ${who.join(', ')}` : ''}`
}

// Projected WAR by position, drawn on a field: the eight fielders where they stand, the
// rotation on the mound, bullpen and DH off to the side. The red tint deepens with WAR.
// Hovering, focusing or tapping a spot opens a card with the players behind its number.
export default function FieldDiagram({ spots, record, className = '' }: { spots: Record<FieldSpot, SpotWar>; record?: string; className?: string }) {
  const [open, setOpen] = useState<FieldSpot | null>(null)
  const label = `Projected WAR by position: ${FIELD_SPOTS.map((s) => `${SPOT_NAMES[s]} ${fmt(spots[s].war)}`).join(', ')}${record ? `. Projected record ${record}` : ''}`

  // Mouse, keyboard and touch all open the same card; tapping an open spot closes it.
  const handlers = (spot: FieldSpot) => ({
    tabIndex: 0,
    role: 'button',
    'aria-label': spokenTip(spot, spots[spot]),
    onMouseEnter: () => setOpen(spot),
    onMouseLeave: () => setOpen((o) => (o === spot ? null : o)),
    onFocus: () => setOpen(spot),
    onBlur: () => setOpen((o) => (o === spot ? null : o)),
    onClick: () => setOpen((o) => (o === spot ? null : spot)),
    style: { cursor: 'default', outline: 'none' },
  })

  const card = (() => {
    if (!open) return null
    const s = spots[open]
    const [x, y] = AT[open] ?? OFF_FIELD.find((o) => o.spot === open)!.anchor
    const below = y < 110 // near the top, open downward so the card stays inside the panel
    const who = s.players.filter((p) => Math.abs(p.war) >= 0.05)
    return (
      <div
        role="tooltip"
        className="pointer-events-none absolute z-30 w-52 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-left shadow-[var(--elevated-shadow)]"
        style={{
          left: `${(x / W) * 100}%`,
          top: `${(y / H) * 100}%`,
          transform: `translate(${x < 60 ? '-12%' : x > 240 ? '-88%' : '-50%'}, ${below ? '22px' : 'calc(-100% - 22px)'})`,
        }}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text)]">{SPOT_NAMES[open]}</span>
          <span className="font-mono text-xs font-semibold text-[var(--text)]">{fmt(s.war)} WAR</span>
        </div>
        {who.length === 0 ? (
          <p className="text-[11px] text-[var(--dim)]">No one on the roster is projected here.</p>
        ) : (
          <ul className="space-y-0.5">
            {who.slice(0, LIST_MAX).map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-2 text-[11px] text-[var(--dim)]">
                <span className="truncate text-[var(--text)]">{p.name}</span>
                <span className="font-mono">{p.war.toFixed(1)}</span>
              </li>
            ))}
            {who.length > LIST_MAX && <li className="text-[11px] text-[var(--dimmer)]">+{who.length - LIST_MAX} more</li>}
          </ul>
        )}
        <p className="mt-1.5 border-t border-[var(--rule)] pt-1 text-[11px] leading-snug text-[var(--dimmer)]">WAR counted at this spot, from the playing time each player gets here.</p>
      </div>
    )
  })()

  return (
    <div className="relative inline-block">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={className}>
        {/* Outfield, infield dirt, infield grass */}
        <path d="M150,222 L22,94 Q150,-52 278,94 Z" fill="var(--bg)" stroke="var(--rule)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M150,222 L84,156 Q150,82 216,156 Z" fill="var(--panel)" stroke="var(--rule)" strokeWidth="1" strokeLinejoin="round" />
        <path d="M150,222 L104,176 L150,130 L196,176 Z" fill="var(--bg)" stroke="var(--rule)" strokeWidth="1" strokeLinejoin="round" />
        {[[150, 222], [196, 176], [150, 130], [104, 176]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" transform={`rotate(45 ${x} ${y})`} fill="var(--panel)" stroke="var(--dim)" strokeWidth="0.75" />
        ))}

        {(Object.keys(AT) as FieldSpot[]).map((spot) => {
          const [x, y] = AT[spot]!
          const s = spots[spot]
          const tint = Math.max(0, Math.min(1, s.war / (FULL_TINT[spot] ?? 6)))
          const active = open === spot
          return (
            <g key={spot} {...handlers(spot)}>
              <circle cx={x} cy={y} r="16.5" fill="var(--panel)" />
              <circle cx={x} cy={y} r="16.5" fill="var(--accent)" fillOpacity={tint * 0.32} stroke={active ? 'var(--text)' : 'var(--rule)'} strokeWidth={active ? 1.5 : 0.75} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="14.5" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(s.war)}
              </text>
            </g>
          )
        })}

        {/* Off the field: bullpen and DH */}
        {OFF_FIELD.map(({ spot, name, y }) => (
          <g key={spot} {...handlers(spot)}>
            {/* An invisible hit area, so the whole label is easy to hover or tap */}
            <rect x="0" y={y - 14} width="62" height="40" fill="transparent" />
            <text x="2" y={y} fontSize="14" fontWeight="500" fill="var(--dimmer)">{name}</text>
            <text x="2" y={y + 20} fontSize="17" fontWeight="700" fill="var(--text)" textDecoration={open === spot ? 'underline' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(spots[spot].war)}</text>
          </g>
        ))}

        {/* Bottom right, as on a depth-chart graphic: the projected record */}
        {record && (
          <g>
            <text x="298" y="228" textAnchor="end" fontSize="14" fontWeight="500" fill="var(--dimmer)">Projected record</text>
            <text x="298" y="252" textAnchor="end" fontSize="21" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>{record}</text>
          </g>
        )}
      </svg>
      {card}
    </div>
  )
}
