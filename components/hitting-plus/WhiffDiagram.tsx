import { Player } from "@/lib/hitting-plus/types";

export default function WhiffDiagram({
  player,
  leagueGap,
  eliteGap,
}: {
  player: Player;
  leagueGap: number;
  eliteGap: number;
}) {
  if (player.whiff_rate == null || player.exp_whiff == null) {
    return <p className="text-xs text-[var(--dim)]">No contact data for this season.</p>;
  }
  const gap = player.whiff_rate - player.exp_whiff;

  const allX = [0, gap, leagueGap, eliteGap];
  const lo = Math.min(...allX) - 0.02;
  const hi = Math.max(...allX) + 0.02;

  const W = 640;
  const H = 92;
  const PAD_LEFT = 16;
  const PAD_RIGHT = 16;
  const AXIS_Y = 58;
  const x = (v: number) => PAD_LEFT + ((v - lo) / (hi - lo)) * (W - PAD_LEFT - PAD_RIGHT);

  const px = x(gap);
  const lx = x(leagueGap);
  const ex = x(eliteGap);
  const zx = x(0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Whiff rate versus his own expected whiff rate, compared to a typical hitter and the least-fooled hitters"
    >
      <line x1={PAD_LEFT} y1={AXIS_Y} x2={W - PAD_RIGHT} y2={AXIS_Y} stroke="var(--rule)" />
      <line x1={zx} y1={AXIS_Y - 16} x2={zx} y2={AXIS_Y + 6} stroke="var(--dimmer)" strokeDasharray="2 3" />
      <text x={zx} y={AXIS_Y + 20} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="middle">
        matched expectation
      </text>
      <text x={PAD_LEFT} y={AXIS_Y - 30} fill="var(--dimmer)" fontFamily="var(--font-dm-sans)" fontSize="10">
        fewer whiffs than expected
      </text>
      <text
        x={W - PAD_RIGHT}
        y={AXIS_Y - 30}
        fill="var(--dimmer)"
        fontFamily="var(--font-dm-sans)"
        fontSize="10"
        textAnchor="end"
      >
        more whiffs than expected
      </text>

      <circle cx={lx} cy={AXIS_Y} r={3} fill="none" stroke="var(--dimmer)" strokeWidth={1.5} />
      <rect
        x={px < lx ? lx + 5 : lx - 5 - 44}
        y={AXIS_Y - 6}
        width={44}
        height={13}
        fill="var(--track)"
        opacity={0.88}
      />
      <text
        x={lx + (px < lx ? 8 : -8)}
        y={AXIS_Y + 3}
        fill="var(--dimmer)"
        fontFamily="var(--font-dm-sans)"
        fontSize="10"
        textAnchor={px < lx ? "start" : "end"}
      >
        typical
      </text>

      <line x1={ex} y1={AXIS_Y - 11} x2={ex} y2={AXIS_Y + 11} stroke="var(--accent)" strokeWidth={1.5} opacity={0.8} />
      <rect
        x={px < ex ? ex + 5 : ex - 5 - 32}
        y={AXIS_Y - 6}
        width={32}
        height={13}
        fill="var(--track)"
        opacity={0.88}
      />
      <text
        x={ex + (px < ex ? 8 : -8)}
        y={AXIS_Y + 3}
        fill="var(--accent)"
        fontFamily="var(--font-dm-sans)"
        fontWeight={600}
        fontSize="10"
        textAnchor={px < ex ? "start" : "end"}
      >
        elite
      </text>

      <circle cx={px} cy={AXIS_Y} r={6} fill="var(--cool)" stroke="white" strokeWidth={1.5} />
      <text
        x={px}
        y={AXIS_Y - 18}
        fill="#1a1a1a"
        fontFamily="var(--font-dm-sans)"
        fontWeight={700}
        fontSize="13"
        textAnchor="middle"
      >
        {`${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(1)} pts`}
      </text>
    </svg>
  );
}
