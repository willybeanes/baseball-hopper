/** One row of the Supabase table swing_profile. Written by ~/swingplus/swing_profile/publish_swing_profile.py. */
export type WhiffGroup = "fastball" | "breaking" | "offspeed";

export interface WhiffDirection {
  /** Whiff depth minus swing depth. Above zero means further out front. Never shown in copy. */
  gap: number;
  direction: "early" | "late";
  whiffs: number;
}

export interface SwingProfileRow {
  mlbam: number;
  season: number;
  name: string;
  qualified: boolean;
  normal_swing: number | null;
  hardest_swing: number | null;
  sandbag: number | null;
  sandbag_pct: number | null;
  chase_penalty: number | null;
  chase_notable: boolean | null;
  outside_share: number | null;
  two_strike_drop: number | null;
  two_strike_label: "Shy Away Derek" | "Swing Away Merrill" | null;
  picking_pct: number | null;
  quadrant: "big_picks" | "big_spreads" | "small_picks" | "small_spreads" | null;
  payoff_ev: number | null;
  payoff_whiff: number | null;
  whiff_direction: Partial<Record<WhiffGroup, WhiffDirection>> | null;
  whiff_breaks_pattern: WhiffGroup[] | null;
  /** Tier B, from Savant's average swing. 2026 only so far. */
  frames_to_contact: number | null;
  launch_rank: number | null;
  launch_tied: boolean | null;
  launch_pool: number | null;
  launch_fifth: "Latest" | "Late" | "Middle" | "Early" | "Earliest" | null;
}

/** League numbers for one season, from swing_profile_league. The table holds more; these are the ones the page reads. */
export interface SwingProfileLeague {
  normal_swing_median: number;
  hardest_swing_median: number;
  chase_penalty_median: number;
  two_strike_drop_mean: number;
  payoff_ev_median: number;
  payoff_whiff_median: number;
  launch_trade?: Record<"latest" | "earliest", { contact: number; power: number; xwoba: number }>;
}

/** Tier C, hand-maintained in public/data/swing-profile-video.json. Only for hitters tracked from broadcast video. */
export interface SwingProfileVideo {
  season: number;
  waggleHitters: number;
  waggle?: { label: string };
  clock?: { type: "Guesser" | "Reactor" | "Metronome"; soft_start_share: number; note: string };
  extras?: string[];
}

export interface SwingProfileData {
  rows: SwingProfileRow[];
  leagues: Record<number, SwingProfileLeague>;
  video?: SwingProfileVideo | null;
}

/** Article links for labels and names. Filled in once the URLs are final; a null renders as plain text. */
export const SWING_PROFILE_ARTICLES: Record<"partOne" | "partTwo" | "sandbagged" | "swingAwayMerrills", string | null> = {
  partOne: null,
  partTwo: null,
  sandbagged: null,
  swingAwayMerrills: null,
};
