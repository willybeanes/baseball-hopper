import { Player } from "@/lib/hitting-plus/types";

const X_BINS = 5;
const Z_BINS = 5;
const CHASE_MARGIN = 0.5;
const LO = -1 - CHASE_MARGIN;
const HI = 1 + CHASE_MARGIN;
const EDGES = Array.from({ length: X_BINS + 1 }, (_, i) => LO + (i * (HI - LO)) / X_BINS);

// Regret is always <= 0 by construction (chosen minus the better of swing/take).
// Calibrated against the real distribution: p1 is about -0.077, p50 about -0.023,
// so a floor a bit past the median catches nearly all real variation without
// letting a handful of tiny-sample outlier cells wash out the color scale.
const REGRET_FLOOR = -0.06;
const LIGHT: [number, number, number] = [240, 237, 232]; // matches --track
const BAD: [number, number, number] = [192, 57, 44]; // matches --accent

function regretColor(regret: number): string {
  const t = Math.max(0, Math.min(1, regret / REGRET_FLOOR));
  const r = Math.round(LIGHT[0] + (BAD[0] - LIGHT[0]) * t);
  const g = Math.round(LIGHT[1] + (BAD[1] - LIGHT[1]) * t);
  const b = Math.round(LIGHT[2] + (BAD[2] - LIGHT[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function DecisionDiagram({ player }: { player: Player }) {
  const zone = player.decision_zone;
  if (!zone || Object.keys(zone).length === 0) {
    return <p className="text-xs text-[var(--dim)]">No zone-level decision data for this season.</p>;
  }

  const W = 320;
  const H = 320;
  const PAD = 24;
  const uToX = (u: number) => PAD + ((u - LO) / (HI - LO)) * (W - 2 * PAD);
  const uToY = (u: number) => H - PAD - ((u - LO) / (HI - LO)) * (H - 2 * PAD);

  const cells: { cx: number; cz: number; regret: number; swingRate: number; n: number }[] = [];
  for (let cx = 0; cx < X_BINS; cx++) {
    for (let cz = 0; cz < Z_BINS; cz++) {
      const v = zone[`${cx}_${cz}`];
      if (v) cells.push({ cx, cz, regret: v.regret, swingRate: v.swing_rate, n: v.n });
    }
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Swing rate and decision quality by strike-zone location, color shows how costly the swing-or-take pattern was in that location"
      >
        {cells.map(({ cx, cz, regret, swingRate, n }) => {
          const x1 = uToX(EDGES[cx]);
          const x2 = uToX(EDGES[cx + 1]);
          const y1 = uToY(EDGES[cz + 1]);
          const y2 = uToY(EDGES[cz]);
          const big = x2 - x1 > 30;
          return (
            <g key={`${cx}_${cz}`}>
              <rect
                x={x1}
                y={y1}
                width={x2 - x1}
                height={y2 - y1}
                fill={regretColor(regret)}
                stroke="var(--panel)"
                strokeWidth={1.5}
              />
              {big && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 + 4}
                  fill={regret < REGRET_FLOOR * 0.55 ? "white" : "#1a1a1a"}
                  fontFamily="var(--font-dm-sans)"
                  fontWeight={600}
                  fontSize="11"
                  textAnchor="middle"
                  opacity={0.9}
                >
                  {`${Math.round(swingRate * 100)}%`}
                </text>
              )}
              {n < 15 && (
                <title>{`${n} pitches, small sample`}</title>
              )}
            </g>
          );
        })}

        <rect
          x={uToX(-1)}
          y={uToY(1)}
          width={uToX(1) - uToX(-1)}
          height={uToY(0) - uToY(1)}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={2}
        />
        <text x={W / 2} y={H - 6} fill="var(--dim)" fontFamily="var(--font-dm-sans)" fontSize="10" textAnchor="middle">
          catcher&apos;s view · box is the strike zone
        </text>
      </svg>

      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-[var(--dimmer)]">
        <span>good swing/take decisions</span>
        <span
          className="h-2 w-24 rounded-full"
          style={{ background: `linear-gradient(to right, ${regretColor(0)}, ${regretColor(REGRET_FLOOR)})` }}
        />
        <span>costly swing/take decisions</span>
      </div>
    </div>
  );
}
