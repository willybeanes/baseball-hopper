import { Player } from "./types";

/** Convert stored "Last Jr., First" to display "First Last Jr." */
export function formatName(stored: string): string {
  const comma = stored.indexOf(",");
  if (comma < 0) return stored;
  const last  = stored.slice(0, comma).trim();
  const first = stored.slice(comma + 1).trim();
  return first ? `${first} ${last}` : stored;
}

/** Strip accents so "Ramirez" matches "Ramírez". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Percentile of x within values: the share of values strictly less than x.
 * Computed within a single season's players, never pooled across seasons.
 */
export function percentileIn(values: number[], x: number | null | undefined): number | null {
  if (x == null || values.length === 0) return null;
  const below = values.filter((v) => v < x).length;
  return (100 * below) / values.length;
}

/** Build a lookup of percentile functions for a set of numeric keys, scoped to one season's players. */
export function buildPercentiles<K extends string>(
  players: Player[],
  keys: readonly K[]
): Record<K, (x: number | null | undefined) => number | null> {
  const out = {} as Record<K, (x: number | null | undefined) => number | null>;
  for (const key of keys) {
    const values = players
      .map((p) => (p as unknown as Record<string, number | null>)[key])
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    out[key] = (x) => percentileIn(values, x ?? null);
  }
  return out;
}

/** Mean of a field across players, ignoring nulls. Used to center the depth diagram on league average. */
export function leagueMean(players: Player[], key: keyof Player): number {
  const values = players
    .map((p) => p[key])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Value at percentile p (0 to 100) of a sorted-ascending numeric field, ignoring nulls. */
export function fieldPercentileValue(players: Player[], key: keyof Player, p: number): number | null {
  const values = players
    .map((pl) => pl[key])
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const idx = Math.min(values.length - 1, Math.max(0, Math.round((p / 100) * (values.length - 1))));
  return values[idx];
}

/**
 * Value at percentile p (0 to 100) of the per-player difference (keyA - keyB), ignoring
 * players missing either field. Used for the contact diagram's fooled-gap reference
 * lines, where the meaningful quantity is each hitter's own breaking/offspeed depth
 * minus their own fastball depth, not either field's standing against league average.
 */
export function pairedFieldPercentileValue(
  players: Player[],
  keyA: keyof Player,
  keyB: keyof Player,
  p: number
): number | null {
  const diffs = players
    .map((pl) => {
      const a = pl[keyA];
      const b = pl[keyB];
      return typeof a === "number" && typeof b === "number" ? a - b : null;
    })
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (diffs.length === 0) return null;
  const idx = Math.min(diffs.length - 1, Math.max(0, Math.round((p / 100) * (diffs.length - 1))));
  return diffs[idx];
}

export function fmtNum(v: number | null | undefined, digits: number): string {
  if (v == null) return "--";
  return v.toFixed(digits);
}

export function fmtSigned(v: number | null | undefined, digits: number): string {
  if (v == null) return "--";
  return (v >= 0 ? "+" : "") + v.toFixed(digits);
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "--";
  return (v * 100).toFixed(0) + "%";
}

/** "1st", "2nd", "3rd", "4th", ..., "11th", "12th", "13th", "21st", ... */
export function ordinal(n: number): string {
  const rounded = Math.round(n);
  const mod100 = Math.abs(rounded) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (Math.abs(rounded) % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

export function fmtPercentile(p: number | null | undefined): string {
  if (p == null) return "--";
  return `${ordinal(p)} percentile`;
}

export type ConfidenceTier = "full" | "partial" | "low";

/** conf >= 0.7 is settled, 0.3 to 0.7 is short, below 0.3 is very short. */
export function confidenceTier(conf: number | null | undefined): ConfidenceTier {
  if (conf == null || conf >= 0.7) return "full";
  if (conf >= 0.3) return "partial";
  return "low";
}

/** Visual weight for a grade given how settled its sample is. Never hides the value. */
export function confidenceOpacity(conf: number | null | undefined): number {
  const tier = confidenceTier(conf);
  if (tier === "full") return 1;
  if (tier === "partial") return 0.62;
  return 0.4;
}
