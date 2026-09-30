/**
 * Stance-driven figure legs, home plate + batter's box, and ground data labels for the 3D Swing Explorer.
 *
 * Frame: the explorer's canonical RHH frame, inches. x toward the plate, y toward the pitcher, z up (ground = 0).
 * The caller multiplies x by the side sign (-1 for LHH) when drawing, exactly like the other traces.
 *
 * How Savant's foot coordinates map into this frame (checked against the data, 2026-09-30):
 *  - x: Savant foot x is the distance from the plate's near edge (|x|), so x_ours = plate_off_body - 8.5 - |x|.
 *  - y: Savant feet are plate-referenced. We anchor the toe midpoint at contact so it sits exactly `contact_depth`
 *       behind the front of the plate (front of plate = stance_depth in this frame), and keep Savant's foot-to-foot
 *       spacing around that anchor. That keeps the drawn depth equal to the number shown in the Stance panel.
 */
import type { PlotlyMesh, StanceRow } from "@/lib/hhps";

type V3 = [number, number, number];

// ── mesh primitives (ported from figure_mesh.py so the legs can be rebuilt per hitter) ─────────────────
function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function addv(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a: V3, s: number): V3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function lerp(a: V3, b: V3, t: number): V3 { return addv(a, scale(sub(b, a), t)); }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(a: V3): V3 { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }

interface Part { v: V3[]; f: [number, number, number][] }

function capsule(p0: V3, p1: V3, r0: number, r1: number, nseg = 14): Part {
  const u = unit(sub(p1, p0));
  const a: V3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const v = unit(cross(u, a));
  const w = cross(u, v);
  const V: V3[] = [];
  const F: [number, number, number][] = [];
  for (const [c, r] of [[p0, r0], [p1, r1]] as [V3, number][]) {
    for (let n = 0; n < nseg; n++) {
      const t = (2 * Math.PI * n) / nseg;
      V.push([
        c[0] + r * (Math.cos(t) * v[0] + Math.sin(t) * w[0]),
        c[1] + r * (Math.cos(t) * v[1] + Math.sin(t) * w[1]),
        c[2] + r * (Math.cos(t) * v[2] + Math.sin(t) * w[2]),
      ]);
    }
  }
  for (let i = 0; i < nseg; i++) {
    const j = (i + 1) % nseg;
    F.push([i, j, nseg + i], [j, nseg + j, nseg + i]);
  }
  V.push(p0, p1);
  const c0 = V.length - 2, c1 = V.length - 1;
  for (let i = 0; i < nseg; i++) {
    const j = (i + 1) % nseg;
    F.push([c0, j, i], [c1, nseg + i, nseg + j]);
  }
  return { v: V, f: F };
}

function ellipsoid(c: V3, rx: number, ry: number, rz: number, n = 12): Part {
  const V: V3[] = [];
  const F: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const ph = (Math.PI * i) / n;
    for (let j = 0; j < n; j++) {
      const t = (2 * Math.PI * j) / n;
      V.push([c[0] + rx * Math.sin(ph) * Math.cos(t), c[1] + ry * Math.sin(ph) * Math.sin(t), c[2] + rz * Math.cos(ph)]);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n), c2 = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
      F.push([a, b, c2], [b, d, c2]);
    }
  }
  return { v: V, f: F };
}

function merge(parts: Part[]): PlotlyMesh {
  const x: number[] = [], y: number[] = [], z: number[] = [];
  const i: number[] = [], j: number[] = [], k: number[] = [];
  let off = 0;
  for (const p of parts) {
    for (const v of p.v) { x.push(v[0]); y.push(v[1]); z.push(v[2]); }
    for (const [a, b, c] of p.f) { i.push(a + off); j.push(b + off); k.push(c + off); }
    off += p.v.length;
  }
  return { x, y, z, i, j, k };
}

// ── the generic RHH-at-contact pose (same numbers as figure_mesh.py) ────────────────────────────────────
const BASE = {
  bfoot: [-1, -17, 2] as V3, ffoot: [1, 21, 2] as V3,
  bknee: [5, -9, 19] as V3, fknee: [3, 15, 21] as V3,
  bhip: [-1, -5, 37] as V3, fhip: [1, 6, 37] as V3,
  bsh: [6, -3, 55] as V3, fsh: [-1, 10, 56] as V3, head: [3, 4, 66] as V3,
  belb: [10, 1, 44] as V3, felb: [7, 15, 47] as V3, hands: [14, 11, 39] as V3,
};

/** One foot in the canonical frame: ankle (where the leg attaches), heel and toe centers, all at foot height. */
export interface FootPose { ankle: V3; heel: V3; toe: V3; bigToe: V3 }
export interface StanceFeet { back: FootPose; front: FootPose; midBigToe: V3; plateOffBody: number; stanceDepth: number; contactDepth: number }

const FOOT_Z = 2;

/** Where the feet are at contact, from Savant's averaged coordinates (`raw`, feet) plus the stance row's depths. */
export function stanceFeet(row: StanceRow | undefined, plateOffBody: number): StanceFeet | null {
  const raw = row?.raw;
  if (!row || !raw || row.stance_depth == null || row.contact_depth == null) return null;
  const g = (name: string) => raw[`avg_${name}`];
  const need = ["rbigtoe_x2", "rbigtoe_y2", "lbigtoe_x2", "lbigtoe_y2", "rheel_x2", "rheel_y2", "lheel_x2", "lheel_y2",
    "rsmalltoe_x2", "rsmalltoe_y2", "lsmalltoe_x2", "lsmalltoe_y2"];
  if (need.some((n) => typeof g(n) !== "number")) return null;

  const midBigY = ((g("rbigtoe_y2") + g("lbigtoe_y2")) / 2) * 12;
  const anchorY = row.stance_depth - row.contact_depth;      // toe midpoint sits this far out front of the body reference
  const pt = (part: string): V3 => [
    plateOffBody - 8.5 - Math.abs(g(`${part}_x2`)) * 12,
    anchorY + (g(`${part}_y2`) * 12 - midBigY),
    FOOT_Z,
  ];
  const mk = (s: "r" | "l"): FootPose => {
    const big = pt(`${s}bigtoe`), small = pt(`${s}smalltoe`), heel = pt(`${s}heel`);
    const toe: V3 = [(big[0] + small[0]) / 2, (big[1] + small[1]) / 2, FOOT_Z];
    return { ankle: lerp(heel, toe, 0.3), heel, toe, bigToe: big };
  };
  const r = mk("r"), l = mk("l");
  const [front, back] = r.bigToe[1] >= l.bigToe[1] ? [r, l] : [l, r];
  const midBigToe = lerp(back.bigToe, front.bigToe, 0.5);
  return { back, front, midBigToe, plateOffBody, stanceDepth: row.stance_depth, contactDepth: row.contact_depth };
}

function kneeFor(foot: V3, hip: V3, oFoot: V3, oHip: V3, oKnee: V3): V3 {
  // Same fraction up the leg and same sideways/forward bend as the generic figure, applied to the new foot.
  const t = (oKnee[2] - oFoot[2]) / (oHip[2] - oFoot[2]);
  return addv(lerp(foot, hip, t), sub(oKnee, lerp(oFoot, oHip, t)));
}

/**
 * How far the whole upper body moves so it sits above the center of his stance: the midpoint of his two ankles
 * versus the generic pose's ankle midpoint (x and y only). Zero with no stance data.
 */
function upperBodyOffset(feet?: StanceFeet | null): V3 {
  if (!feet) return [0, 0, 0];
  return [
    (feet.back.ankle[0] + feet.front.ankle[0]) / 2 - (BASE.bfoot[0] + BASE.ffoot[0]) / 2,
    (feet.back.ankle[1] + feet.front.ankle[1]) / 2 - (BASE.bfoot[1] + BASE.ffoot[1]) / 2,
    0,
  ];
}

/** Where his hands are (the bat starts here); moves with the upper body. */
export function figureHands(feet?: StanceFeet | null): V3 {
  return addv(BASE.hands, upperBodyOffset(feet));
}

/** Hitter mesh (RHH frame). With `feet` the legs and feet follow his contact stance and the upper body is centered over them; without, the generic pose. */
export function buildFigure(feet?: StanceFeet | null): PlotlyMesh {
  const P = BASE;
  const off = upperBodyOffset(feet);
  const up = (v: V3): V3 => addv(v, off);
  const bhip = up(P.bhip), fhip = up(P.fhip);
  const bAnk: V3 = feet ? feet.back.ankle : P.bfoot;
  const fAnk: V3 = feet ? feet.front.ankle : P.ffoot;
  const bKnee = feet ? kneeFor(bAnk, bhip, P.bfoot, P.bhip, P.bknee) : P.bknee;
  const fKnee = feet ? kneeFor(fAnk, fhip, P.ffoot, P.fhip, P.fknee) : P.fknee;
  const bToe: V3 = feet ? feet.back.toe : [P.bfoot[0] + 2, P.bfoot[1] + 6, 2];
  const fToe: V3 = feet ? feet.front.toe : [P.ffoot[0] + 6, P.ffoot[1] + 3, 2];
  const bHeel: V3 = feet ? feet.back.heel : P.bfoot;
  const fHeel: V3 = feet ? feet.front.heel : P.ffoot;
  const bsh = up(P.bsh), fsh = up(P.fsh), belb = up(P.belb), felb = up(P.felb), hands = up(P.hands), head = up(P.head);
  return merge([
    capsule(bAnk, bKnee, 3, 3.8), capsule(bKnee, bhip, 3.8, 5.5),
    capsule(fAnk, fKnee, 3, 3.8), capsule(fKnee, fhip, 3.8, 5.5),
    capsule(up([0, 0, 37]), up([2.5, 3.5, 55]), 8, 9.5),
    capsule(bsh, belb, 2.6, 2.3), capsule(belb, hands, 2.3, 1.9),
    capsule(fsh, felb, 2.6, 2.3), capsule(felb, hands, 2.3, 1.9),
    capsule(bsh, fsh, 3, 3), capsule(up([2.5, 3.5, 58]), head, 2.4, 2.4),
    ellipsoid(head, 4.3, 4.3, 5),
    capsule(bHeel, bToe, 2, 2), capsule(fHeel, fToe, 2, 2),
  ]);
}

// ── home plate and the batter's box (ground, z ~ 0) ─────────────────────────────────────────────────────
const GROUND_Z = 0.2;

/**
 * Plate: 17" wide, front edge (toward the pitcher) at y = stanceDepth, apex 17" behind it, centered plateOffBody.
 * Box: MLB batter's box is 4 ft wide x 6 ft long, inside line 6" off the plate, centered on the plate front-to-back.
 */
export function plateAndBoxTraces(plateOffBody: number, stanceDepth: number, sg: 1 | -1, showBox: boolean, colors: { line: string; fill: string }): object[] {
  const traces: object[] = [];
  const yf = stanceDepth, yb = stanceDepth - 17;
  const X = (x: number) => x * sg;
  const plate: [number, number][] = [
    [plateOffBody - 8.5, yf], [plateOffBody + 8.5, yf], [plateOffBody + 8.5, yf - 8.5], [plateOffBody, yb], [plateOffBody - 8.5, yf - 8.5],
  ];
  // fan triangulation from vertex 0
  traces.push({
    type: "mesh3d",
    x: plate.map((p) => X(p[0])), y: plate.map((p) => p[1]), z: plate.map(() => GROUND_Z),
    i: [0, 0, 0], j: [1, 2, 3], k: [2, 3, 4],
    color: "#ffffff", opacity: 0.55, hoverinfo: "skip", showlegend: false, flatshading: true,
  });
  traces.push({
    type: "scatter3d", mode: "lines",
    x: [...plate, plate[0]].map((p) => X(p[0])), y: [...plate, plate[0]].map((p) => p[1]), z: Array(6).fill(GROUND_Z),
    line: { color: colors.line, width: 4 }, hovertemplate: "Home plate<extra></extra>", showlegend: false,
  });
  if (showBox) {
    const yc = stanceDepth - 8.5;
    const x0 = plateOffBody - 14.5 - 48, x1 = plateOffBody - 14.5, y0 = yc - 36, y1 = yc + 36;
    const rect: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    traces.push({
      type: "mesh3d",
      x: [x0, x1, x1, x0].map(X), y: [y0, y0, y1, y1], z: Array(4).fill(GROUND_Z - 0.05),
      i: [0, 0], j: [1, 2], k: [2, 3],
      color: colors.fill, opacity: 0.1, hoverinfo: "skip", showlegend: false,
    });
    traces.push({
      type: "scatter3d", mode: "lines",
      x: rect.map((p) => X(p[0])), y: rect.map((p) => p[1]), z: Array(5).fill(GROUND_Z),
      line: { color: colors.line, width: 3 },
      hovertemplate: "Batter's box (4 ft x 6 ft)<extra></extra>", showlegend: false,
    });
  }
  return traces;
}

// ── ground data labels ────────────────────────────────────────────────────────────────────────────────
const LABEL_COLOR = "#0e7c86";

function labelTrace(points: V3[], text: string[], sg: 1 | -1, opts: { dash?: boolean; textpos?: string } = {}): object {
  return {
    type: "scatter3d",
    mode: "lines+text",
    x: points.map((p) => p[0] * sg), y: points.map((p) => p[1]), z: points.map((p) => p[2]),
    text, textposition: opts.textpos ?? "top center",
    textfont: { color: LABEL_COLOR, size: 12, family: "DM Sans, sans-serif" },
    line: { color: LABEL_COLOR, width: 4, dash: opts.dash ? "dash" : "solid" },
    hoverinfo: "skip", showlegend: false,
  };
}

const fmt = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));

export function stanceLabelTraces(
  feet: StanceFeet, row: StanceRow, sg: 1 | -1,
  show: { apart: boolean; angle: boolean; depth: boolean },
): object[] {
  const out: object[] = [];
  const z = GROUND_Z + 0.3;
  const b = feet.back.bigToe, f = feet.front.bigToe;
  const bb: V3 = [b[0], b[1], z], ff: V3 = [f[0], f[1], z];
  const mid: V3 = [(b[0] + f[0]) / 2, (b[1] + f[1]) / 2, z];

  if (show.apart) {
    out.push(labelTrace([bb, mid, ff], ["", `${fmt(row.foot_sep2)}″ apart`, ""], sg, { textpos: "bottom center" }));
  }
  if (show.angle) {
    // Reference line straight toward the pitcher from the back toe, and the actual toe-to-toe line.
    const len = Math.hypot(f[0] - b[0], f[1] - b[1]);
    const ref: V3 = [b[0], b[1] + len, z];
    const a = row.foot_angle2;
    const word = a == null ? "" : a < -0.5 ? "open" : a > 0.5 ? "closed" : "square";
    out.push(labelTrace([bb, ref], ["", ""], sg, { dash: true }));
    if (!show.apart) out.push(labelTrace([bb, ff], ["", ""], sg));
    // Label sits at the back toe, away from the feet-apart and depth labels.
    out.push({ ...labelTrace([bb], [`${a != null && a > 0 ? "+" : ""}${fmt(a)}° ${word}`], sg, { textpos: "bottom center" }), mode: "text" });
  }
  if (show.depth) {
    const plateFront = feet.stanceDepth;
    const from: V3 = [mid[0], mid[1], z], to: V3 = [mid[0], plateFront, z];
    out.push(labelTrace([from, [mid[0], (from[1] + to[1]) / 2, z], to], ["", `${fmt(row.contact_depth)}″ behind front of plate`, ""], sg, { dash: true, textpos: "middle left" }));
  }
  return out;
}
