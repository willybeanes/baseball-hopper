import type { ReactNode } from "react";
import { ordinal } from "@/lib/hitting-plus/metrics";
import {
  SWING_PROFILE_ARTICLES,
  type SwingProfileLeague,
  type SwingProfileRow,
  type SwingProfileVideo,
  type WhiffGroup,
} from "@/lib/swing-profile/types";

// Fixed mph axis so the range bar compares across player pages. Qualified hitters in 2024-26 run from 61.9 to 86.4 mph.
const AXIS_MIN = 58;
const AXIS_MAX = 88;

const QUADRANT: Record<NonNullable<SwingProfileRow["quadrant"]>, string> = {
  big_picks: "Big Sandbag, picks his spots",
  big_spreads: "Big Sandbag, spreads it around",
  small_picks: "Small Sandbag, picks his spots",
  small_spreads: "Small Sandbag, spreads it around",
};

const GROUP_NAME: Record<WhiffGroup, string> = { fastball: "fastballs", breaking: "breaking balls", offspeed: "offspeed pitches" };
const GROUP_ADJECTIVE: Record<WhiffGroup, string> = { fastball: "fastball", breaking: "breaking-ball", offspeed: "offspeed" };

const mph = (v: number) => v.toFixed(1);
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(digits)}`;
const percentile = (p: number) => ordinal(Math.min(99, Math.max(1, Math.round(p))));
const axisPct = (v: number) => (100 * (Math.min(AXIS_MAX, Math.max(AXIS_MIN, v)) - AXIS_MIN)) / (AXIS_MAX - AXIS_MIN);

const joinList = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function Metric({ label, value, note, children }: { label: string; value?: ReactNode; note?: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[180px_1fr]">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--text)]">{label}</h3>
        {value != null && <p className="mt-0.5 text-[17px] font-bold tabular-nums text-[var(--text)]">{value}</p>}
        {note && <p className="mt-0.5 text-[11px] text-[var(--dim)]">{note}</p>}
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--dim)]">{children}</p>
    </div>
  );
}

function SandbagBlock({ row, league }: { row: SwingProfileRow; league: SwingProfileLeague }) {
  const { normal_swing: normal, hardest_swing: hardest, sandbag } = row;
  if (normal == null || hardest == null || sandbag == null) return null;
  const left = axisPct(normal);
  const right = axisPct(hardest);
  const stats = [
    { label: "Normal swing", value: `${mph(normal)} mph` },
    { label: "Hardest swings", value: `${mph(hardest)} mph` },
    {
      label: "The Sandbag",
      value: `${mph(sandbag)} mph`,
      note: row.sandbag_pct != null ? `${percentile(row.sandbag_pct)} percentile` : undefined,
    },
  ];
  return (
    <div>
      <div className="rounded-[10px] bg-[var(--track)] px-4 pb-4 pt-[18px] sm:px-5">
        <dl className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-medium text-[var(--dim)]">{s.label}</dt>
              <dd className="mt-0.5 text-[17px] font-bold tabular-nums text-[var(--text)]">{s.value}</dd>
              {s.note && <dd className="text-[11px] text-[var(--dim)]">{s.note}</dd>}
            </div>
          ))}
        </dl>
        <div
          className="relative mt-6 h-[9px]"
          role="img"
          aria-label={`Bat speed range from a normal swing of ${mph(normal)} mph to hardest swings of ${mph(hardest)} mph. A typical hitter runs from ${mph(league.normal_swing_median)} to ${mph(league.hardest_swing_median)} mph.`}
        >
          <span className="absolute inset-x-0 top-[3px] h-[3px] rounded-full bg-[var(--neutral-bar)]" />
          {[league.normal_swing_median, league.hardest_swing_median].map((v) => (
            <span
              key={v}
              className="absolute -top-[3px] h-[15px] w-px bg-[var(--dimmer)]"
              style={{ left: `${axisPct(v)}%` }}
              title={`Typical hitter: ${mph(v)} mph`}
            />
          ))}
          <span
            className="absolute top-[3px] h-[3px] bg-[var(--accent)]"
            style={{ left: `${left}%`, width: `${right - left}%` }}
            title={`${mph(normal)} to ${mph(hardest)} mph`}
          />
          {[
            { v: normal, label: "Normal swing" },
            { v: hardest, label: "Hardest swings" },
          ].map((m) => (
            <span
              key={m.label}
              className="absolute top-0 h-[9px] w-[9px] -translate-x-1/2 rounded-full border-2 border-[var(--track)] bg-[var(--accent)] box-content -mt-0.5"
              style={{ left: `${axisPct(m.v)}%` }}
              title={`${m.label}: ${mph(m.v)} mph`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] tabular-nums text-[var(--dim)]">
          <span>{AXIS_MIN} mph</span>
          <span>{AXIS_MAX} mph</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--dimmer)]">
        How much faster his hardest swings are than his normal one, on pitches in the zone. The Sandbag adjusts for pitch location, so it can differ a little from the gap between the two raw speeds. It is a style, not a skill: it has no relationship with Hitting+, Decision+ or Power+, and only a slight lean toward Contact+. The thin ticks mark a typical hitter&apos;s normal and hardest swing.
      </p>
    </div>
  );
}

function WhiffLine({ row }: { row: SwingProfileRow }) {
  const whiffs = row.whiff_direction ?? {};
  const shown = (["fastball", "breaking", "offspeed"] as WhiffGroup[]).filter((g) => whiffs[g]);
  if (!shown.length) return null;
  const breaks = row.whiff_breaks_pattern ?? [];
  const usual = shown.filter((g) => !breaks.includes(g));
  const describe = (gs: WhiffGroup[]) =>
    joinList(gs.map((g) => `${whiffs[g]!.direction} on ${GROUP_NAME[g]}`));

  let text: string;
  if (!breaks.length && shown.length === 3) {
    text = "Like nearly every hitter, he misses late on fastballs and early on everything else.";
  } else if (!breaks.length) {
    text = `Like nearly every hitter, he misses ${describe(shown)}.`;
  } else {
    const broken = breaks
      .map((g) => `his ${GROUP_ADJECTIVE[g]} whiffs come ${whiffs[g]!.direction === "early" ? "further out front" : "deeper"} than his normal swing, where nearly every hitter misses the other way`)
      .join(", and ");
    text = `He breaks the usual pattern: ${broken}.${usual.length ? ` He misses ${describe(usual)}, like most hitters.` : ""}`;
  }
  return (
    <Metric label="Whiff direction">
      {text} This compares where the bat meets the ball on his whiffs with where it meets the ball on all his swings.
    </Metric>
  );
}

function Launch({ row, league }: { row: SwingProfileRow; league: SwingProfileLeague }) {
  const { frames_to_contact: frames, launch_rank: rank, launch_pool: pool, launch_fifth: fifth } = row;
  if (frames == null || rank == null || pool == null || !fifth) return null;
  const trade = league.launch_trade;
  const xwoba = (v: number) => v.toFixed(3).replace(/^0/, "");
  return (
    <Metric label="When the swing launches" value={`${mph(frames)} frames`} note={`${row.launch_tied ? "tied " : ""}${ordinal(rank)} latest of ${pool}`}>
      <span className="font-medium text-[var(--text)]">{fifth} fifth of hitters. </span>
      How much of the swing is left once the bat really starts to turn, counted in frames of his average swing from Savant. It works out to about a tenth of a second, and fewer frames means a later launch. A late launch buys power and pays for it in contact, and the bill comes out about even.
      {trade &&
        ` The latest fifth of hitters average ${trade.latest.contact} Contact+, ${trade.latest.power} Power+ and a ${xwoba(trade.latest.xwoba)} xwOBA; the earliest fifth average ${trade.earliest.contact}, ${trade.earliest.power} and ${xwoba(trade.earliest.xwoba)}.`}
    </Metric>
  );
}

function TwoStrikes({ row, league }: { row: SwingProfileRow; league: SwingProfileLeague }) {
  const drop = row.two_strike_drop;
  if (drop == null) return null;
  const value = Math.abs(drop) < 0.05 ? "Same swing" : `${mph(Math.abs(drop))} mph ${drop > 0 ? "slower" : "harder"}`;
  const label = row.two_strike_label;
  const labelUrl = label === "Swing Away Merrill" ? SWING_PROFILE_ARTICLES.swingAwayMerrills : null;
  const labelNode = label && labelUrl ? <a href={labelUrl} className="underline">{label}</a> : label;
  return (
    <Metric label="With two strikes" value={value}>
      {label && (
        <>
          <span className="font-medium text-[var(--text)]">{labelNode}</span>
          {label === "Shy Away Derek" ? ": he eases off with two strikes. " : ": the same swing, or harder, with two strikes. "}
        </>
      )}
      {`Most of the raw two-strike slowdown is pitchers throwing to slower spots, so this adjusts for location first. A typical hitter eases off about ${mph(league.two_strike_drop_mean)} mph. How much a hitter shortens up has no link to his contact, so read this as a style.`}
    </Metric>
  );
}

const TRACKED_NOTE = "tracked from video";

function VideoCards({ video }: { video: SwingProfileVideo }) {
  const { waggle, clock, extras } = video;
  return (
    <>
      {waggle && (
        <Metric label="Bat before the swing" value={waggle.label} note={TRACKED_NOTE}>
          {`How much the bat moves before the swing, from release until a tenth of a second before the ball arrives, on fastballs from right-handers. The label only compares the ${video.waggleHitters} hitters we tracked. It is a style; across hitters it has nothing to do with Contact+.`}
        </Metric>
      )}
      {clock && (
        <Metric label="Swing clock" value={clock.type} note={TRACKED_NOTE}>
          {`${clock.note} When a slower pitch gives him extra time, starting later takes up ${clock.soft_start_share}% of it, and the rest he absorbs inside the swing. Hitters set their clock by the count, by the ball or not at all, and that is a style too.`}
          {extras?.length ? ` ${extras.join(" ")}` : ""}
        </Metric>
      )}
    </>
  );
}

/** "How the hitter runs the swing": styles and profiles, never grades. Only Hitting+ grades good or bad. */
export default function SwingProfile({
  row,
  league,
  video,
}: {
  row: SwingProfileRow;
  league: SwingProfileLeague;
  video?: SwingProfileVideo | null;
}) {
  const chase = row.chase_penalty;
  const payoffEv = row.payoff_ev;
  const payoffWhiff = row.payoff_whiff;
  const whiffPts = payoffWhiff != null ? Math.abs(payoffWhiff * 100).toFixed(1) : null;

  return (
    <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--panel-shadow)] sm:px-7">
      <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Swing Profile</h2>
      <p className="mb-4 mt-1 text-xs text-[var(--dim)]">
        Hitting+ grades the swing. This describes how he runs it, so these are styles, not grades.
      </p>

      <SandbagBlock row={row} league={league} />

      <div className="mt-2 divide-y divide-[var(--rule)]">
        {payoffEv != null && payoffWhiff != null && (
          <Metric label="Hard-swing payoff" value={`${signed(payoffEv)} mph`} note="exit velocity, fouls included">
            {`On his hardest fifth of swings in the zone, contact comes off the bat ${mph(Math.abs(payoffEv))} mph ${payoffEv >= 0 ? "harder" : "softer"} than on the rest, and he whiffs ${whiffPts} points ${payoffWhiff >= 0 ? "more" : "less"} often. A typical hitter gains about ${mph(league.payoff_ev_median)} mph and whiffs about ${(league.payoff_whiff_median * 100).toFixed(1)} points more.`}
          </Metric>
        )}

        {chase != null &&
          (row.chase_notable ? (
            <Metric label="Chase penalty" value={`${signed(chase)} mph`}>
              {`How much raw bat speed undersells him because of swings at pitches off the plate. Those swings are slower for everyone, and ${Math.round((row.outside_share ?? 0) * 100)}% of his come outside the zone. A typical hitter loses about ${mph(league.chase_penalty_median)} mph this way.`}
            </Metric>
          ) : (
            <Metric label="Chase penalty">Raw bat speed is a clean read on his swing.</Metric>
          ))}

        <TwoStrikes row={row} league={league} />

        {row.picking_pct != null && (
          <Metric label="Picking his spots" value={percentile(row.picking_pct)} note="percentile">
            {row.quadrant && <span className="font-medium text-[var(--text)]">{QUADRANT[row.quadrant]}. </span>}
            How much he saves his hard swings for hitter&apos;s counts and pitches he can pull. This is a profile, not an edge: pickers trade power for contact and end up about the same overall.
          </Metric>
        )}

        <Launch row={row} league={league} />

        <WhiffLine row={row} />

        {video && video.season === row.season && <VideoCards video={video} />}
      </div>
    </section>
  );
}
