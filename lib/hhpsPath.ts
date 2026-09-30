/**
 * Pitch path for the 3D Swing Explorer: the real flight of a pitch, from the game feed's physics, placed in the explorer's
 * canonical body frame (inches; x toward the plate, y toward the pitcher, z up; mirror x for LHH when drawing).
 *
 * Statcast flight is constant-acceleration: position(t) = p0 + v0 t + 0.5 a t^2 (feet, seconds). The feed's numbers reproduce
 * the pitch's plate location exactly (checked on a real play to 3 decimals).
 *
 * Placement in the body frame (same conventions as the figure's feet and the zone plane):
 *  - y: the front of the plate sits `stanceDepth` out front of the hitter, so y_body = stanceDepth + (y_stat_in - 17).
 *  - x: the engine defines ix = plate_off_body - sgE * plate_x * 12 (sgE = +1 LHH, -1 RHH), so
 *       x_body = plateOffBody - sgE * x_stat_in, then shifted by a constant so the path passes through the event's own
 *       measured contact x. That shift absorbs per-pitch differences in where he stood.
 *  - z: height in inches as is. (Circles are plotted at the height where the pitch crossed the plate, so the path can pass a
 *       couple of inches above or below a circle at contact; the path itself is the physical one.)
 * The path ends at the contact / miss point (the event's measured out-front depth) and continues as a dashed line a short way on.
 */
import type { EventPoint } from "@/lib/hhps";
import type { Trajectory } from "@/lib/hhpsVideo";

export interface PathMark { x: number; y: number; z: number; label: string }
export interface PitchPath {
  solid: { x: number[]; y: number[]; z: number[] };
  dashed: { x: number[]; y: number[]; z: number[] } | null;
  marks: PathMark[];
  contact: { x: number; y: number; z: number };
  start: { x: number; y: number; z: number; mph: number };
  yStart: number;       // farthest-out point of the path, inches out front
  secondsShown: number;
}

const MPH = 0.681818; // ft/s to mph
const pos = (p0: number, v0: number, a: number, t: number) => p0 + v0 * t + 0.5 * a * t * t;

/** Smallest t >= 0 with y_stat(t) = yFt (y decreases as the pitch approaches), or null if it never gets there. */
function timeAtY(tr: Trajectory, yFt: number): number | null {
  // 0.5 ay t^2 + vy0 t + (y0 - yFt) = 0
  const a = 0.5 * tr.ay, b = tr.vy0, c = tr.y0 - yFt;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || Math.abs(a) < 1e-9) return null;
  const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
  const ts = [r1, r2].filter((t) => t >= 0).sort((p, q) => p - q);
  return ts.length ? ts[0] : null;
}

export function buildPitchPath(
  tr: Trajectory, ev: EventPoint,
  ctx: { plateOffBody: number; stanceDepth: number; sgE: 1 | -1; windowIn?: number },
): PitchPath | null {
  const { plateOffBody, stanceDepth, sgE } = ctx;
  const windowIn = ctx.windowIn ?? 108;              // how much of the approach to show: 9 ft
  const yBodyToStat = (yBody: number) => (yBody - stanceDepth + 17) / 12;   // body inches -> Statcast feet
  const yEv = ev[1];
  const tStar = timeAtY(tr, yBodyToStat(yEv));
  if (tStar == null) return null;
  const tStart = timeAtY(tr, yBodyToStat(yEv + windowIn)) ?? 0;

  const xStatIn = (t: number) => pos(tr.x0, tr.vx0, tr.ax, t) * 12;
  const shift = ev[0] - (plateOffBody - sgE * xStatIn(tStar));
  const at = (t: number) => ({
    x: plateOffBody - sgE * xStatIn(t) + shift,
    y: stanceDepth + pos(tr.y0, tr.vy0, tr.ay, t) * 12 - 17,
    z: pos(tr.z0, tr.vz0, tr.az, t) * 12,
  });
  const speed = (t: number) => Math.hypot(tr.vx0 + tr.ax * t, tr.vy0 + tr.ay * t, tr.vz0 + tr.az * t) * MPH;

  const dt = 0.002;
  const solid = { x: [] as number[], y: [] as number[], z: [] as number[] };
  for (let t = tStart; t < tStar; t += dt) { const p = at(t); solid.x.push(p.x); solid.y.push(p.y); solid.z.push(p.z); }
  const pc = at(tStar);
  solid.x.push(pc.x); solid.y.push(pc.y); solid.z.push(pc.z);

  // Short dashed continuation past contact (toward the catcher), so a miss reads as a miss.
  const tEnd = Math.min(tStar + 0.06, timeAtY(tr, yBodyToStat(stanceDepth - 17 - 8)) ?? tStar + 0.03);
  let dashed: PitchPath["dashed"] = null;
  if (tEnd > tStar + 0.004) {
    dashed = { x: [pc.x], y: [pc.y], z: [pc.z] };
    for (let t = tStar + dt; t <= tEnd; t += dt) { const p = at(t); dashed.x.push(p.x); dashed.y.push(p.y); dashed.z.push(p.z); }
  }

  // A marker every 10 ms counting back from contact, so spacing shows the pitch's speed (and drop).
  const marks: PathMark[] = [];
  for (let k = 0; tStar - k * 0.01 >= tStart; k++) {
    const t = tStar - k * 0.01, p = at(t);
    marks.push({ ...p, label: `${k === 0 ? "at contact / miss" : `${(k * 10)} ms before`} · ${speed(t).toFixed(1)} mph` });
  }
  const ps = at(tStart);
  return {
    solid, dashed, marks, contact: pc,
    start: { ...ps, mph: speed(tStart) },
    yStart: ps.y,
    secondsShown: tStar - tStart,
  };
}
