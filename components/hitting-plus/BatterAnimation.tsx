"use client";

type Stage = 0 | 1 | 2 | 3;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut3 = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const sub = (t: number, lo: number, hi: number) => easeOut3((t - lo) / (hi - lo));

// [gripX, gripY, barrelX, barrelY, frontFootX]
// Batter faces RIGHT (pitcher on right). Loaded bat is behind them → LEFT side.
type Pose = [number, number, number, number, number];

const LOADED: Pose  = [88, 65, 72, 28, 121];   // bat up-left behind back shoulder
const CONTACT: Pose = [119, 76, 186, 78, 130];  // bat horizontal, extended toward pitcher
const THROUGH: Pose = [100, 65, 76, 44, 130];   // bat wrapped back left after contact

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return a.map((v, i) => lerp(v, b[i], t)) as Pose;
}

function Batter({ pose }: { pose: Pose }) {
  const [gx, gy, bx, by, ffx] = pose;
  return (
    <g>
      {/* Legs */}
      <line x1={108} y1={94} x2={92}  y2={148} stroke="var(--dim)" strokeWidth={3}   strokeLinecap="round" />
      <line x1={108} y1={94} x2={ffx} y2={148} stroke="var(--dim)" strokeWidth={3}   strokeLinecap="round" />
      {/* Torso */}
      <line x1={108} y1={52} x2={108} y2={94}  stroke="var(--dim)" strokeWidth={3.5} strokeLinecap="round" />
      {/* Arm to grip */}
      <line x1={108} y1={64} x2={gx}  y2={gy}  stroke="var(--dim)" strokeWidth={2.5} strokeLinecap="round" />
      {/* Bat */}
      <line x1={gx}  y1={gy} x2={bx}  y2={by}  stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" />
      {/* Grip knob */}
      <circle cx={gx} cy={gy} r={3.5} fill="var(--dim)" />
      {/* Head (face visible through helmet) */}
      <circle cx={108} cy={38} r={9} fill="var(--track)" stroke="var(--dim)" strokeWidth={2} />
      {/* Helmet dome (covers top of head) */}
      <path d="M99,38 Q99,26 108,25 Q117,26 117,38 Z" fill="var(--dim)" />
      {/* Helmet bill — extends right toward pitcher */}
      <line x1={117} y1={35} x2={128} y2={39} stroke="var(--dim)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function Ball({ cx, cy, r = 5.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="var(--text)" />
      <path
        d={`M${cx - 1.5},${cy - r * 0.75} C${cx + r * 0.6},${cy - r * 0.2} ${cx + r * 0.6},${cy + r * 0.2} ${cx - 1.5},${cy + r * 0.75}`}
        fill="none" stroke="var(--track)" strokeWidth={1.2}
      />
    </>
  );
}

/** Decision+: batter holds; pitch travels from pitcher → strike zone */
function StageDecision({ p }: { p: number }) {
  const bx = lerp(275, 157, p);
  const by = lerp(68, 80, p);
  return (
    <>
      {/* Strike zone */}
      <rect x={141} y={74} width={26} height={50} fill="none"
        stroke="var(--dimmer)" strokeWidth={1} strokeDasharray="4 3" rx={2} />
      {/* Pitch trail */}
      <line x1={275} y1={68} x2={bx} y2={by}
        stroke="var(--dimmer)" strokeWidth={1} strokeDasharray="3 4"
        opacity={clamp01(p * 6)} />
      <Ball cx={bx} cy={by} />
      <Batter pose={LOADED} />
    </>
  );
}

/** Timing+: pitch trajectory from right; ideal vs late contact depth markers */
function StageTiming({ p }: { p: number }) {
  const pose = lerpPose(LOADED, CONTACT, p);
  const alpha = clamp01(p * 2);

  // Contact depth markers along the pitch path
  const IDEAL_X = 191, CONTACT_Y = 78;
  const LATE_X  = 155, LATE_Y    = 78;

  return (
    <>
      {/* Pitch trajectory — dotted line extending right toward pitcher */}
      <line x1={140} y1={CONTACT_Y} x2={275} y2={68}
        stroke="var(--dimmer)" strokeWidth={1.2} strokeDasharray="4 4"
        opacity={alpha} />

      {/* "Late" contact marker */}
      <circle cx={LATE_X} cy={LATE_Y} r={4.5} fill="none"
        stroke="var(--dimmer)" strokeWidth={1.5} opacity={alpha} />
      <text x={LATE_X} y={LATE_Y - 9} textAnchor="middle"
        fontSize={8} fontWeight="600" fill="var(--dimmer)" opacity={alpha}
        style={{ fontFamily: "inherit" }}>Late</text>

      {/* "Ideal" contact marker */}
      <circle cx={IDEAL_X} cy={CONTACT_Y} r={5.5} fill="none"
        stroke="var(--accent)" strokeWidth={1.5} opacity={alpha} />
      <text x={IDEAL_X} y={CONTACT_Y - 10} textAnchor="middle"
        fontSize={8} fontWeight="600" fill="var(--accent)" opacity={alpha}
        style={{ fontFamily: "inherit" }}>Ideal</text>

      {/* Span bracket between the two markers */}
      <line x1={LATE_X + 4} y1={LATE_Y + 14} x2={IDEAL_X - 5} y2={CONTACT_Y + 14}
        stroke="var(--dimmer)" strokeWidth={1} opacity={alpha * 0.5} />

      <Batter pose={pose} />
    </>
  );
}

/** Contact+: bat is at contact, impact burst radiates out */
function StageContact({ p }: { p: number }) {
  const [bx, by] = [CONTACT[2], CONTACT[3]]; // 186, 78
  const impactP = easeOut3(p);
  const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <>
      <Ball cx={bx} cy={by} />
      {RAYS.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const r1 = 8, r2 = lerp(8, 22, impactP);
        return (
          <line key={deg}
            x1={bx + Math.cos(rad) * r1} y1={by + Math.sin(rad) * r1}
            x2={bx + Math.cos(rad) * r2} y2={by + Math.sin(rad) * r2}
            stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round"
            opacity={impactP * 0.65} />
        );
      })}
      <Batter pose={CONTACT} />
    </>
  );
}

/** Power+: follow-through, ball launches on parabolic arc */
function StagePower({ p }: { p: number }) {
  const pose = lerpPose(CONTACT, THROUGH, p);
  const sx = 186, sy = 78, ex = 272, ey = 22;
  const ballX = lerp(sx, ex, p);
  const ballY = lerp(sy, ey, p) - Math.sin(clamp01(p) * Math.PI) * 20;
  const tp = Math.max(0, p - 0.15);
  const trailX = lerp(sx, ex, tp);
  const trailY = lerp(sy, ey, tp) - Math.sin(clamp01(tp) * Math.PI) * 20;
  return (
    <>
      {/* Launch arc (dashed) up to current ball position */}
      <path
        d={`M${sx},${sy} Q${(sx + ex) / 2},${Math.min(sy, ey) - 30} ${ballX},${ballY}`}
        fill="none" stroke="var(--dimmer)" strokeWidth={1.5}
        strokeDasharray="3 4" opacity={0.5} />
      {/* Motion trail */}
      {p > 0.12 && (
        <line x1={trailX} y1={trailY} x2={ballX} y2={ballY}
          stroke="var(--dimmer)" strokeWidth={2.5} strokeLinecap="round" opacity={0.3} />
      )}
      <Ball cx={ballX} cy={ballY} />
      <Batter pose={pose} />
    </>
  );
}

export default function BatterAnimation({
  stage,
  progress,
  label,
}: {
  stage: Stage;
  progress: number;
  label: string;
}) {
  const p = easeOut3(progress);
  return (
    <div className="mt-5 overflow-hidden rounded-[10px] border border-[var(--rule)] bg-[var(--track)]">
      <svg viewBox="0 0 300 165" width="100%" style={{ display: "block" }}
        role="img" aria-label={label}>
        <line x1={15}  y1={148} x2={285} y2={148} stroke="var(--rule)"   strokeWidth={1.5} />
        <path d="M143,148 L167,148 L167,156 L155,163 L143,156 Z"
          fill="none" stroke="var(--dimmer)" strokeWidth={1.5} />
        {stage === 0 && <StageDecision p={p} />}
        {stage === 1 && <StageTiming   p={p} />}
        {stage === 2 && <StageContact  p={p} />}
        {stage === 3 && <StagePower    p={p} />}
      </svg>
    </div>
  );
}
