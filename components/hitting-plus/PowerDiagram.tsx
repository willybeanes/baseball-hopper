import { Player } from "@/lib/hitting-plus/types";
import { fmtSigned } from "@/lib/hitting-plus/metrics";

export default function PowerDiagram({
  player,
  leagueBS,
  leagueAA,
  eliteBS,
  eliteAA,
}: {
  player: Player;
  leagueBS: number;
  leagueAA: number;
  eliteBS: number;
  eliteAA: number;
}) {
  if (player.paBS == null || player.paAA == null) {
    return <p className="text-xs text-[var(--dim)]">No power data for this season.</p>;
  }
  const bs = player.paBS;
  const aa = player.paAA;

  const allX = [0, bs, leagueBS, eliteBS];
  const allY = [0, aa, leagueAA, eliteAA];
  const xPad = Math.max(1, (Math.max(...allX) - Math.min(...allX)) * 0.25);
  const yPad = Math.max(1, (Math.max(...allY) - Math.min(...allY)) * 0.25);
  const xLo = Math.min(...allX) - xPad;
  const xHi = Math.max(...allX) + xPad;
  const yLo = Math.min(...allY) - yPad;
  const yHi = Math.max(...allY) + yPad;

  const W = 640;
  const H = 260;
  const PAD = 56;
  const x = (v: number) => PAD + ((v - xLo) / (xHi - xLo)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - yLo) / (yHi - yLo)) * (H - 2 * PAD);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Location-adjusted bat speed and lift versus expected, compared to a typical hitter and the elite range"
    >
      <rect x={PAD} y={PAD - 20} width={W - 2 * PAD} height={H - 2 * PAD + 20} fill="none" stroke="var(--rule)" />

      {/* league-average crosshair */}
      <line x1={x(leagueBS)} y1={PAD - 20} x2={x(leagueBS)} y2={H - PAD} stroke="var(--dimmer)" strokeDasharray="2 3" />
      <line x1={PAD} y1={y(leagueAA)} x2={W - PAD} y2={y(leagueAA)} stroke="var(--dimmer)" strokeDasharray="2 3" />
      <text x={x(leagueBS)} y={PAD - 26} fill="var(--dimmer)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="middle">
        typical
      </text>
      <text x={PAD - 8} y={y(leagueAA) + 3} fill="var(--dimmer)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="end">
        typical
      </text>

      {/* elite reference lines */}
      <line x1={x(eliteBS)} y1={PAD - 20} x2={x(eliteBS)} y2={H - PAD} stroke="var(--accent)" strokeDasharray="2 3" opacity={0.8} />
      <line x1={PAD} y1={y(eliteAA)} x2={W - PAD} y2={y(eliteAA)} stroke="var(--accent)" strokeDasharray="2 3" opacity={0.8} />
      <text x={x(eliteBS)} y={H - PAD + 16} fill="var(--accent)" fontFamily="var(--font-dm-sans)" fontWeight={600} fontSize="10" textAnchor="middle">
        elite speed
      </text>
      <text x={W - PAD + 4} y={y(eliteAA) + 3} fill="var(--accent)" fontFamily="var(--font-dm-sans)" fontWeight={600} fontSize="10">
        elite lift
      </text>

      {/* axis labels */}
      <text x={PAD} y={H - PAD + 30} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10">
        slower
      </text>
      <text x={W - PAD} y={H - PAD + 30} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="end">
        faster
      </text>
      <text x={PAD - 8} y={PAD - 8} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="end">
        more lift
      </text>
      <text x={PAD - 8} y={H - PAD} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="end">
        less lift
      </text>

      <circle cx={x(bs)} cy={y(aa)} r={7} fill="var(--cool)" stroke="white" strokeWidth={1.5} />
      <text
        x={x(bs)}
        y={y(aa) - 14}
        fill="#1a1a1a"
        fontFamily="var(--font-dm-sans)"
        fontWeight={700}
        fontSize="12"
        textAnchor="middle"
      >
        {`${fmtSigned(bs, 1)} mph, ${fmtSigned(aa, 1)}°`}
      </text>
    </svg>
  );
}
