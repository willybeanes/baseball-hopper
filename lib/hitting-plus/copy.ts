import { ComponentKey, Player } from "./types";
import { fmtPct, fmtSigned } from "./metrics";

export const COMPONENT_ASK: Record<ComponentKey, string> = {
  "Decision+": "whether to swing",
  "Timing+": "when the bat arrived",
  "Contact+": "did the bat meet the pitch",
  "Power+": "what the swing brought",
};

export const COMPONENT_DESC: Record<ComponentKey, string> = {
  "Decision+":
    "Scores every pitch by the run-value regret of the swing-or-take choice, against what a league-average hitter gets in that location, count and pitch type. A correct choice scores zero. Coin-flip pitches barely register.",
  "Timing+":
    "Measures when the bat arrived: specifically, how far out front a hitter makes contact on breaking and offspeed pitches relative to fastballs. Everyone is early on soft stuff. Staying back is the skill.",
  "Contact+":
    "Whiff avoidance, graded against the expected whiff rate for the location, count and pitch type he actually swung at, not a flat league average. A hitter who sees a tougher mix of pitches isn't penalized for it.",
  "Power+":
    "Combines location-adjusted bat speed and location-adjusted attack angle, the lift term. Both are adjusted because contact point changes both measurements: hitters swing slower on high pitches and steeper on low ones regardless of ability.",
};

/** One line of plain-language context under each component, built from the raw fields. */
export const COMPONENT_NOTE: Record<ComponentKey, (d: Player) => string> = {
  "Decision+": (d) => `swings at ${fmtPct(d.swing_rate)} of pitches seen`,
  "Timing+": (d) => `${fmtSigned(d.fooled, 1)}" in front on soft stuff vs fastballs`,
  "Contact+": (d) =>
    `misses ${fmtPct(d.whiff_rate)} of his swings, ${fmtSigned(
      d.whiff_rate != null && d.exp_whiff != null ? (d.whiff_rate - d.exp_whiff) * 100 : null,
      1
    )} pts vs expected`,
  "Power+": (d) => `bat speed ${fmtSigned(d.paBS, 1)} mph, lift ${fmtSigned(d.paAA, 1)} deg vs expected`,
};

export const HEADLINE_DESC =
  "A regression refit on all four component features, not an average of them. The components correlate, so averaging would count the same tendency more than once.";

export const PA_FILTER_NOTE =
  "The components settle at different rates, measured by split-half reliability. Power+ is reliable after about 22 swings, Contact+ after 124, Timing+ after 269, and Decision+ needs more than 1,500 pitches. Below that, a grade is pulled toward league average in proportion to what is missing, so a hitter with 20 plate appearances shows a real Power+ and a Decision+ near 100.";

export const CONFIDENCE_NOTE =
  "Sample is short, so this grade is pulled toward league average.";

export const FOOTER_COPY = [
  "Hitting+ grades from Statcast pitch tracking, 2024 to 2026, calibrated against xwOBA. Decision+, Timing+, Contact+ and Power+ each grade one part of the swing, in the order it happens.",
];
