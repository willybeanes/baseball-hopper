import { DepthKey, Player } from "@/lib/hitting-plus/types";
import { fmtSigned } from "@/lib/hitting-plus/metrics";

type SoftKey = "depth_BR" | "depth_OS";

const SOFT_FAMILIES: { key: SoftKey; label: string; color: string }[] = [
  { key: "depth_BR", label: "Breaking", color: "#7fa0cb" },
  { key: "depth_OS", label: "Offspeed", color: "#c9922f" },
];

export default function ContactDiagram({
  player,
  leagueDepth,
  eliteGap,
}: {
  player: Player;
  leagueDepth: Record<DepthKey, number>;
  eliteGap: Record<"depth_BR" | "depth_OS", number>;
}) {
  if (player.depth_FB == null) {
    return <p className="text-xs text-[var(--dim)]">No timing data for this season.</p>;
  }
  const fbDepth = player.depth_FB;
  const have = SOFT_FAMILIES.filter((f) => player[f.key] != null);

  if (have.length === 0) {
    return <p className="text-xs text-[var(--dim)]">No timing data for this season.</p>;
  }

  // Gap = how many inches later this hitter meets that pitch type than he meets fastballs.
  // This is what "fooled" and Timing+ actually grade, unlike comparing each pitch type to
  // the league average for that pitch type, which erases the cross-pitch-type gap entirely.
  const gaps = have.map((f) => (player[f.key] as number) - fbDepth);
  const leagueGaps = have.map((f) => leagueDepth[f.key] - leagueDepth.depth_FB);
  const eliteGaps = have.map((f) => eliteGap[f.key]);

  const allX = [0, ...gaps, ...leagueGaps, ...eliteGaps];
  const lo = Math.min(...allX) - 1;
  const hi = Math.max(...allX) + 1;

  const W = 640;
  const H = 168;
  const PAD_LEFT = 92;
  const PAD_RIGHT = 44;
  const ROW_H = 38;
  const AXIS_Y = 26 + (have.length + 1) * ROW_H;
  const x = (v: number) => PAD_LEFT + ((v - lo) / (hi - lo)) * (W - PAD_LEFT - PAD_RIGHT);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Contact timing on breaking and offspeed pitches relative to this hitter's own fastball timing"
    >
      <line x1={PAD_LEFT} y1={AXIS_Y} x2={W - PAD_RIGHT} y2={AXIS_Y} stroke="var(--rule)" />
      <line x1={x(0)} y1={16} x2={x(0)} y2={AXIS_Y + 6} stroke="var(--dimmer)" strokeDasharray="2 3" />
      <text x={x(0)} y={AXIS_Y + 20} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="middle">
        same as his fastball
      </text>
      <text x={PAD_LEFT} y={12} fill="var(--dimmer)" fontFamily="var(--font-dm-sans)" fontSize="10">
        on time
      </text>
      <text x={W - PAD_RIGHT} y={12} fill="var(--dimmer)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="end">
        off time
      </text>

      <g>
        <text
          x={PAD_LEFT - 12}
          y={38}
          fill="#1a1a1a"
          fontFamily="var(--font-dm-sans)"
          fontWeight={700}
          fontSize="12"
          textAnchor="end"
        >
          Fastball
        </text>
        <circle cx={x(0)} cy={34} r={5.5} fill="#1a1a1a" stroke="white" strokeWidth={1.5} />
        <text x={x(0)} y={22} fill="#1a1a1a" fontFamily="var(--font-dm-sans)" fontWeight={700} fontSize="11" textAnchor="middle">
          baseline
        </text>
      </g>

      {have.map((f, i) => {
        const gap = (player[f.key] as number) - fbDepth;
        const leagueGap = leagueDepth[f.key] - leagueDepth.depth_FB;
        const elite = eliteGap[f.key];
        const px = x(gap);
        const lx = x(leagueGap);
        const ex = x(elite);
        const y = 34 + (i + 1) * ROW_H;
        return (
          <g key={f.key}>
            <text
              x={PAD_LEFT - 12}
              y={y + 4}
              fill={f.color}
              fontFamily="var(--font-dm-sans)"
              fontWeight={700}
              fontSize="12"
              textAnchor="end"
            >
              {f.label}
            </text>
            <line x1={x(0)} y1={y} x2={px} y2={y} stroke={f.color} strokeOpacity={0.35} strokeWidth={1.5} />
            <circle cx={lx} cy={y} r={3} fill="none" stroke="var(--dimmer)" strokeWidth={1.5} />
            <rect
              x={px < lx ? lx + 5 : lx - 5 - 44}
              y={y - 6}
              width={44}
              height={13}
              fill="var(--track)"
              opacity={0.88}
            />
            <text
              x={lx + (px < lx ? 8 : -8)}
              y={y + 3}
              fill="var(--dimmer)"
              fontFamily="var(--font-dm-sans)"
              fontWeight={600}
              fontSize="10"
              textAnchor={px < lx ? "start" : "end"}
            >
              typical
            </text>
            <line x1={ex} y1={y - 11} x2={ex} y2={y + 11} stroke="var(--accent)" strokeWidth={1.5} opacity={0.8} />
            <rect
              x={px < ex ? ex + 5 : ex - 5 - 32}
              y={y - 6}
              width={32}
              height={13}
              fill="var(--track)"
              opacity={0.88}
            />
            <text
              x={ex + (px < ex ? 8 : -8)}
              y={y + 3}
              fill="var(--accent)"
              fontFamily="var(--font-dm-sans)"
              fontWeight={600}
              fontSize="10"
              textAnchor={px < ex ? "start" : "end"}
            >
              elite
            </text>
            <circle cx={px} cy={y} r={5.5} fill={f.color} stroke="white" strokeWidth={1.5} />
            <text x={px} y={y - 12} fill={f.color} fontFamily="var(--font-dm-sans)" fontWeight={700} fontSize="12" textAnchor="middle">
              {fmtSigned(gap, 1)}&quot;
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export { SOFT_FAMILIES };
