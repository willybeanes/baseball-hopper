/**
 * Event categories for the 3D Swing Explorer's Circles view: what kind of pitch/swing it was (the "type") and how the plate
 * appearance ended on it (the "result"). Shared by the chart and the play card so colors and wording always agree.
 *
 * Event code (EventPoint[3]): 1 whiff, 2 hard-hit (not a barrel), 3 barrel, 4 foul, 5 soft-hit (in play, under 95 mph).
 * Result (EventPoint[11]): S single, D double, T triple, H home run, O out in play / other, K strikeout, "" = PA continued.
 */
import type { EventPoint } from "@/lib/hhps";

export const COLOR_HARD = "#DF4601";
export const COLOR_BRL = "#8E1A5E";
export const COLOR_WHIFF = "#1F7A5A";
export const COLOR_SOFT = "#C99700";
export const COLOR_FOUL = "#8D99A6";

export type CircleType = "hard" | "brl" | "soft" | "whiff" | "foul";
export type ResCode = "S" | "D" | "T" | "H" | "O" | "K";

/** Drawing priority order: a barrel is also hard-hit, so barrel wins when both are on. */
export const CIRCLE_TYPES: { key: CircleType; label: string; color: string; test: (code: number) => boolean }[] = [
  { key: "brl", label: "Barrel", color: COLOR_BRL, test: (c) => c === 3 },
  { key: "hard", label: "Hard-hit", color: COLOR_HARD, test: (c) => c === 2 || c === 3 },
  { key: "soft", label: "Soft-hit", color: COLOR_SOFT, test: (c) => c === 5 },
  { key: "whiff", label: "Whiff", color: COLOR_WHIFF, test: (c) => c === 1 },
  { key: "foul", label: "Foul", color: COLOR_FOUL, test: (c) => c === 4 },
];

/** Button order in the UI. */
export const TYPE_BUTTON_ORDER: CircleType[] = ["hard", "brl", "soft", "whiff", "foul"];

export const RESULTS: { code: ResCode; label: string; color: string }[] = [
  { code: "S", label: "Single", color: "#1971C2" },
  { code: "D", label: "Double", color: "#0C8599" },
  { code: "T", label: "Triple", color: "#6741D9" },
  { code: "H", label: "Home run", color: "#C92A2A" },
  { code: "O", label: "Out in play", color: "#343A40" },
  { code: "K", label: "Strikeout", color: "#E64980" },
];

export const typeInfo = (k: CircleType) => CIRCLE_TYPES.find((t) => t.key === k)!;
export const resultInfo = (c: string) => RESULTS.find((r) => r.code === c);

/** Which circle types match the cube view's current selection (used when first switching to Circles). */
export function typesFromOutcome(outcome: "hard" | "brl" | "soft" | "whiff", alsoWhiff: boolean): Record<CircleType, boolean> {
  return {
    hard: outcome === "hard",
    brl: outcome === "brl",
    soft: outcome === "soft",
    whiff: outcome === "whiff" || alsoWhiff,
    foul: false,
  };
}

export function parseTypes(csv: string | undefined): Record<CircleType, boolean> | null {
  if (!csv) return null;
  const on = new Set(csv.split(","));
  return { hard: on.has("hard"), brl: on.has("brl"), soft: on.has("soft"), whiff: on.has("whiff"), foul: on.has("foul") };
}

export function parseRes(csv: string | undefined): Record<ResCode, boolean> {
  const on = new Set((csv ?? "").split(","));
  return { S: on.has("S"), D: on.has("D"), T: on.has("T"), H: on.has("H"), O: on.has("O"), K: on.has("K") };
}

export const serializeTypes = (t: Record<CircleType, boolean>) => TYPE_BUTTON_ORDER.filter((k) => t[k]).join(",");
export const serializeRes = (r: Record<ResCode, boolean>) => RESULTS.filter((x) => r[x.code]).map((x) => x.code).join(",");

/** One-line description of an event: what it was and how the PA ended. */
export function eventLabel(ev: EventPoint): string {
  const code = ev[3];
  const velo = ev[4] != null ? ` ${ev[4].toFixed(1)} mph` : "";
  const base =
    code === 1 ? `whiff${ev[10] != null ? ` (missed by ${ev[10].toFixed(1)}")` : ""}`
    : code === 4 ? "foul"
    : code === 5 ? `soft-hit${velo}`
    : code === 3 ? `barrel${velo}`
    : `hard-hit${velo}`;
  const res = ev[11] ? resultInfo(ev[11])?.label : undefined;
  return res ? `${base} · ${res}` : base;
}

/** Color of the event's own type (for the play card). */
export function eventColor(ev: EventPoint): string {
  const t = CIRCLE_TYPES.find((x) => x.test(ev[3]));
  return t ? t.color : COLOR_HARD;
}
