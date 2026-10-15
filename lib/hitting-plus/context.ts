import { COMPONENT_KEYS, DepthKey, Player } from "./types";
import { buildPercentiles, fieldPercentileValue, leagueMean, pairedFieldPercentileValue } from "./metrics";

export const PCT_KEYS = [...COMPONENT_KEYS, "Hitting+", "xwoba", "wrc_plus"] as const;
const DEPTH_KEYS: DepthKey[] = ["depth_FB", "depth_BR", "depth_OS"];

export type PctRecord = ReturnType<typeof buildPercentiles<(typeof PCT_KEYS)[number]>>;

/** Percentile functions per season, each graded against that season's qualified pool. */
export function percentilesBySeason(pools: Record<number, Player[]>): Record<number, PctRecord> {
  const out: Record<number, PctRecord> = {};
  for (const [season, qualified] of Object.entries(pools)) {
    out[Number(season)] = buildPercentiles(qualified, PCT_KEYS);
  }
  return out;
}

/** League and elite reference values the player card's diagrams draw against. */
export function cardReferences(qualified: Player[]) {
  const leagueDepth = {} as Record<DepthKey, number>;
  for (const k of DEPTH_KEYS) leagueDepth[k] = leagueMean(qualified, k);

  // Timing+ grades each hitter's own breaking/offspeed depth minus their own fastball
  // depth, so the elite reference is the least-fooled hitters' gap (10th percentile).
  const eliteGap = {
    depth_BR: pairedFieldPercentileValue(qualified, "depth_BR", "depth_FB", 10) ?? 0,
    depth_OS: pairedFieldPercentileValue(qualified, "depth_OS", "depth_FB", 10) ?? 0,
  };

  // Contact+ grades whiff_rate against exp_whiff, so the per-player gap is what matters.
  const gaps = qualified
    .map((p) => (p.whiff_rate != null && p.exp_whiff != null ? p.whiff_rate - p.exp_whiff : null))
    .filter((v): v is number => v != null);
  const leagueWhiffGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const eliteWhiffGap = pairedFieldPercentileValue(qualified, "whiff_rate", "exp_whiff", 10) ?? 0;

  // Bat speed and lift are already deltas versus expected; elite is the 90th percentile.
  return {
    leagueDepth,
    eliteGap,
    leagueWhiffGap,
    eliteWhiffGap,
    leagueBS: leagueMean(qualified, "paBS"),
    leagueAA: leagueMean(qualified, "paAA"),
    eliteBS: fieldPercentileValue(qualified, "paBS", 90) ?? 0,
    eliteAA: fieldPercentileValue(qualified, "paAA", 90) ?? 0,
  };
}
