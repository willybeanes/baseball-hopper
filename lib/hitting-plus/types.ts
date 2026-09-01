export interface FieldMeta {
  key: string;
  label: string;
  desc: string;
}

export interface Player {
  player_name: string;
  game_year: number;
  pitches: number;
  swings: number;
  pa: number;
  "Hitting+": number | null;
  "Decision+": number | null;
  "Timing+": number | null;
  "Contact+": number | null;
  "Power+": number | null;
  "paBS+": number | null;
  "paAA+": number | null;
  xwoba: number | null;
  woba: number | null;
  extra_bases: number | null;
  swing_rate: number | null;
  whiff_rate: number | null;
  /** Expected whiff rate on the pitches he swung at, given their location, count,
   *  and pitch family. Contact+ grades whiff_rate against this, not against a flat
   *  league average, so a hitter who sees tougher pitches isn't penalized for it. */
  exp_whiff: number | null;
  /** Swing rate and average regret by strike-zone cell ("cx_cz", 0-indexed from
   *  bottom-left, on a 5x5 grid plus a chase margin). regret is already calibrated
   *  against the league-optimal choice for that location and count, so a value near
   *  0 means good decisions there -- no separate typical/elite reference needed.
   *  Cells with too few pitches for that player-season are simply absent. */
  decision_zone: Record<string, { regret: number; swing_rate: number; n: number }> | null;
  paBS: number | null;
  paAA: number | null;
  fooled: number | null;
  depth_FB: number | null;
  depth_BR: number | null;
  depth_OS: number | null;
  qualified: boolean;
  fam_min: number | null;
  conf_hitting: number | null;
  conf_decision: number | null;
  conf_timing: number | null;
  conf_contact: number | null;
  conf_power: number | null;
  /** From FanGraphs, merged in at build time (see scripts/fetch-wrc-plus.ts). Not part
   *  of the swingplus engine's own output, so it can be null even when everything else
   *  on the row is present. */
  wrc_plus: number | null;
}

export interface SwingPlusData {
  generated: string;
  source: string;
  seasons: number[];
  fields: FieldMeta[];
  players: Player[];
}

export const COMPONENT_KEYS = ["Decision+", "Timing+", "Contact+", "Power+"] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

/** Every stat the app computes a within-season percentile for. */
export type StatKey = ComponentKey | "Hitting+" | "xwoba" | "wrc_plus";

export const DEPTH_KEYS = ["depth_FB", "depth_BR", "depth_OS"] as const;
export type DepthKey = (typeof DEPTH_KEYS)[number];

/** Maps each component (and the headline grade) to its confidence field. */
export const CONF_FIELD: Record<ComponentKey | "Hitting+", keyof Player> = {
  "Decision+": "conf_decision",
  "Timing+": "conf_timing",
  "Contact+": "conf_contact",
  "Power+": "conf_power",
  "Hitting+": "conf_hitting",
};
