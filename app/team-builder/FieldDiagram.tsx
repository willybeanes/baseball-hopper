import { FIELD_SPOTS, SPOT_NAMES, type FieldSpot, type SpotWar } from '@/lib/team-builder/field'

// Where each number sits on the field (viewBox units). Home plate is at the bottom.
const AT: Partial<Record<FieldSpot, [number, number]>> = {
  CF: [150, 54], LF: [70, 98], RF: [230, 98],
  SS: [116, 140], '2B': [184, 140], '3B': [100, 181], '1B': [200, 181],
  SP: [150, 178], C: [150, 242],
}
// A full tint means a star-level spot; starters as a group get a higher bar.
const FULL_TINT: Partial<Record<FieldSpot, number>> = { SP: 14 }

const fmt = (war: number) => (Math.abs(war) < 0.05 ? '0.0' : war.toFixed(1))

function tip(spot: FieldSpot, s: SpotWar): string {
  const top = s.players.filter((p) => Math.abs(p.war) >= 0.05).slice(0, 4).map((p) => `${p.name} ${p.war.toFixed(1)}`)
  return `${SPOT_NAMES[spot]}: ${fmt(s.war)} projected WAR${top.length ? ` (${top.join(', ')}${s.players.length > top.length ? ', …' : ''})` : ''}`
}

// Projected WAR by position, drawn on a field: the eight fielders where they stand, the
// rotation on the mound, bullpen and DH off to the side. The red tint deepens with WAR.
export default function FieldDiagram({ spots, record, className = '' }: { spots: Record<FieldSpot, SpotWar>; record?: string; className?: string }) {
  const label = `Projected WAR by position: ${FIELD_SPOTS.map((s) => `${SPOT_NAMES[s]} ${fmt(spots[s].war)}`).join(', ')}${record ? `. Projected record ${record}` : ''}`
  return (
    <svg viewBox="0 0 300 262" role="img" aria-label={label} className={className}>
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
        return (
          <g key={spot}>
            <title>{tip(spot, s)}</title>
            <circle cx={x} cy={y} r="16.5" fill="var(--panel)" />
            <circle cx={x} cy={y} r="16.5" fill="var(--accent)" fillOpacity={tint * 0.32} stroke="var(--rule)" strokeWidth="0.75" />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="14.5" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(s.war)}
            </text>
          </g>
        )
      })}

      {/* Off the field: bullpen and DH */}
      {([['RP', 'Bullpen', 16], ['DH', 'DH', 214]] as const).map(([spot, name, y]) => (
        <g key={spot}>
          <title>{tip(spot, spots[spot])}</title>
          <text x="2" y={y} fontSize="14" fontWeight="500" fill="var(--dimmer)">{name}</text>
          <text x="2" y={y + 20} fontSize="17" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(spots[spot].war)}</text>
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
  )
}
