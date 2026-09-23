/**
 * HHPS (Hard-Hit Possibility Space) types, storage URLs, and client utilities.
 */

const STORAGE_BASE = (supabaseUrl: string) =>
  `${supabaseUrl}/storage/v1/object/public/hhps-players`;

export const SEASONS = [2026, 2025, 2024] as const;
export type Season = (typeof SEASONS)[number];

// ── Types matching engine output ──────────────────────────────────────────────

export interface HHPSLeaderboardRow {
  mlbam: number;
  season: number;
  name: string;
  stand: "R" | "L" | "S";
  split: "A" | "R" | "L";
  pa_total: number;
  bip: number;
  hh_rate: number | null;
  brl_rate: number | null;
  bip_hard_in3: number;
  sw_hard_in3: number;
  bip_brl_in3: number;
  sw_brl_in3: number;
  bip_hard_rank: number | null;
  sw_hard_rank: number | null;
  bip_brl_rank: number | null;
  sw_brl_rank: number | null;
  qualified: boolean;
}

/** Cubes as parallel arrays, ready for Plotly scatter3d. */
export interface CubeData {
  x: number[];
  y: number[];
  z: number[];
  c: number[]; // probability rate, used as marker color
}

export interface SplitPayload {
  stand?: "R" | "L";
  bip_hard: number[][];
  sw_hard: number[][];
  bip_brl: number[][];
  sw_brl: number[][];
  bat_target_hard: [number, number, number] | null;
  bat_target_brl: [number, number, number] | null;
}

export interface PlayerJson {
  mlbam: number;
  name: string;
  stand: "R" | "L" | "S";
  zone: { plate_off_body: number; sz_bot: number; sz_top: number };
  splits: { A: SplitPayload; R: SplitPayload; L: SplitPayload };
}

export interface LeagueJson {
  R: LeagueEntry;
  L: LeagueEntry;
}

interface LeagueEntry {
  stand: "R" | "L";
  zone: { plate_off_body: number; sz_bot: number; sz_top: number };
  splits: { A: SplitPayload; R: SplitPayload; L: SplitPayload };
}

export interface MetaJson {
  built: string;
  max_game_date: string;
  support_cloud: [number, number, number][];
  thresholds: Record<string, number>;
  qual_pa: number;
}

export interface FigureJson {
  body: PlotlyMesh;
  hands: [number, number, number];
  bat_len: number;
}

export interface PlotlyMesh {
  x: number[];
  y: number[];
  z: number[];
  i: number[];
  j: number[];
  k: number[];
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function playerJsonUrl(supabaseUrl: string, season: number, mlbam: number) {
  return `${STORAGE_BASE(supabaseUrl)}/${season}/players/${mlbam}.json`;
}
export function leagueJsonUrl(supabaseUrl: string, season: number) {
  return `${STORAGE_BASE(supabaseUrl)}/${season}/league.json`;
}
export function metaJsonUrl(supabaseUrl: string, season: number) {
  return `${STORAGE_BASE(supabaseUrl)}/${season}/meta.json`;
}
export function figureJsonUrl(supabaseUrl: string, season: number) {
  return `${STORAGE_BASE(supabaseUrl)}/${season}/figure.json`;
}

/** Deep-link into the 3D Swing Explorer. */
export function hhpsUrl(
  mlbamId: number,
  opts?: { outcome?: "hard" | "barrel"; mode?: "contact" | "swing"; hand?: "all" | "R" | "L" },
): string {
  const params = new URLSearchParams({ player: String(mlbamId) });
  if (opts?.outcome) params.set("outcome", opts.outcome);
  if (opts?.mode) params.set("mode", opts.mode);
  if (opts?.hand) params.set("hand", opts.hand);
  return `/hhps?${params}`;
}

// ── Data transforms ───────────────────────────────────────────────────────────

/** Convert [[x,y,z,rate],...] from the engine to parallel arrays for Plotly. */
export function cubesFromList(list: number[][]): CubeData {
  const x: number[] = [],
    y: number[] = [],
    z: number[] = [],
    c: number[] = [];
  for (const [cx, cy, cz, cr] of list) {
    x.push(cx);
    y.push(cy);
    z.push(cz);
    c.push(cr);
  }
  return { x, y, z, c };
}

/** Get the right cube list from a split payload for the current toggles. */
export function getCubeList(
  payload: SplitPayload,
  mode: "bip" | "sw",
  outcome: "hard" | "brl",
): CubeData {
  const key = `${mode}_${outcome}` as keyof SplitPayload;
  return cubesFromList(payload[key] as number[][]);
}

/** Get the bat centroid for the current outcome. */
export function getBatTarget(
  payload: SplitPayload,
  outcome: "hard" | "brl",
): [number, number, number] | null {
  return outcome === "hard" ? payload.bat_target_hard : payload.bat_target_brl;
}

/** Mirror x-coordinates for LHH (sg = -1). */
export function flipX(arr: number[], sg: 1 | -1): number[] {
  return sg === 1 ? arr : arr.map((v) => v * -1);
}

// ── Bat mesh ──────────────────────────────────────────────────────────────────
// Ported from figure_mesh.py's bat() function.

function cross(a: [number,number,number], b: [number,number,number]): [number,number,number] {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function norm(a: [number,number,number]): [number,number,number] {
  const l = Math.sqrt(a[0]**2+a[1]**2+a[2]**2);
  return [a[0]/l, a[1]/l, a[2]/l];
}
function add(a: [number,number,number], b: [number,number,number], s=1): [number,number,number] {
  return [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];
}

function capsule(
  p0: [number,number,number], p1: [number,number,number],
  r0: number, r1: number, nseg = 14,
): PlotlyMesh {
  const ax = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]] as [number,number,number];
  const u = norm(ax);
  const tmp: [number,number,number] = Math.abs(u[0]) < 0.9 ? [1,0,0] : [0,1,0];
  const v = norm(cross(u, tmp));
  const w = cross(u, v);
  const verts: [number,number,number][] = [];
  const faces: [number,number,number][] = [];

  const rings: [[number,number,number], number][] = [[p0, r0], [p1, r1]];
  for (const [c, r] of rings) {
    for (let n = 0; n < nseg; n++) {
      const t = (2 * Math.PI * n) / nseg;
      verts.push([
        c[0] + r * (Math.cos(t) * v[0] + Math.sin(t) * w[0]),
        c[1] + r * (Math.cos(t) * v[1] + Math.sin(t) * w[1]),
        c[2] + r * (Math.cos(t) * v[2] + Math.sin(t) * w[2]),
      ]);
    }
  }
  for (let i = 0; i < nseg; i++) {
    const j = (i + 1) % nseg;
    faces.push([i, j, nseg + i]);
    faces.push([j, nseg + j, nseg + i]);
  }
  verts.push(p0); verts.push(p1);
  const c0 = verts.length - 2, c1 = verts.length - 1;
  for (let i = 0; i < nseg; i++) {
    const j = (i + 1) % nseg;
    faces.push([c0, j, i]);
    faces.push([c1, nseg + i, nseg + j]);
  }
  const x: number[] = [], y: number[] = [], z: number[] = [];
  for (const vt of verts) { x.push(vt[0]); y.push(vt[1]); z.push(vt[2]); }
  const ii: number[] = [], jj: number[] = [], kk: number[] = [];
  for (const [a, b, c] of faces) { ii.push(a); jj.push(b); kk.push(c); }
  return { x, y, z, i: ii, j: jj, k: kk };
}

function mergeMeshes(parts: PlotlyMesh[]): PlotlyMesh {
  const x: number[] = [], y: number[] = [], z: number[] = [];
  const ii: number[] = [], jj: number[] = [], kk: number[] = [];
  let off = 0;
  for (const p of parts) {
    x.push(...p.x); y.push(...p.y); z.push(...p.z);
    for (let n = 0; n < p.i.length; n++) {
      ii.push(p.i[n] + off); jj.push(p.j[n] + off); kk.push(p.k[n] + off);
    }
    off += p.x.length;
  }
  return { x, y, z, i: ii, j: jj, k: kk };
}

/** Build bat mesh from the hands position and bat centroid target. */
export function buildBatMesh(
  hands: [number, number, number],
  target: [number, number, number],
): PlotlyMesh {
  const diff: [number,number,number] = [target[0]-hands[0], target[1]-hands[1], target[2]-hands[2]];
  const u = norm(diff);
  const knob = add(hands, u, -2);
  const end = add(knob, u, 34);
  const mid1 = add(knob, u, 12);
  const mid2 = add(knob, u, 24);
  return mergeMeshes([
    capsule(knob, mid1, 0.6, 0.55),
    capsule(mid1, mid2, 0.55, 1.1),
    capsule(mid2, end, 1.1, 1.3),
  ]);
}
