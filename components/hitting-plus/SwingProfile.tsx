import { Fragment, type ReactNode } from "react";
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

// Fixed scales for the row strips, so a dot means the same thing on every player page. Each runs about the 1st to 99th percentile of qualified hitters in 2024-26; anything past an end sits on that end.
const PAYOFF_EV_AXIS = { min: -1, max: 11 };
const PAYOFF_WHIFF_AXIS = { min: -10, max: 20 };
const CHASE_AXIS = { min: -0.2, max: 1.6 };
const TWO_STRIKE_AXIS = { min: -1, max: 5 };
const PERCENTILE_AXIS = { min: 1, max: 99 };
const FIFTHS = [0.2, 0.4, 0.6, 0.8];

const QUADRANT: Record<NonNullable<SwingProfileRow["quadrant"]>, string> = {
  big_picks: "Big Sandbag, picks his spots",
  big_spreads: "Big Sandbag, spreads it around",
  small_picks: "Small Sandbag, picks his spots",
  small_spreads: "Small Sandbag, spreads it around",
};

const GROUP_ADJECTIVE: Record<WhiffGroup, string> = { fastball: "fastball", breaking: "breaking-ball", offspeed: "offspeed" };

const mph = (v: number) => v.toFixed(1);
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(digits)}`;
const percentile = (p: number) => ordinal(Math.min(99, Math.max(1, Math.round(p))));
const axisPct = (v: number) => (100 * (Math.min(AXIS_MAX, Math.max(AXIS_MIN, v)) - AXIS_MIN)) / (AXIS_MAX - AXIS_MIN);

function Metric({ label, value, note, chart, children }: { label: string; value?: ReactNode; note?: string; chart?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[180px_1fr]">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--text)]">{label}</h3>
        {value != null && <p className="mt-0.5 text-[17px] font-bold tabular-nums text-[var(--text)]">{value}</p>}
        {note && <p className="mt-0.5 text-[11px] text-[var(--dim)]">{note}</p>}
      </div>
      <div>
        {chart && <div className="mb-2.5">{chart}</div>}
        <p className="text-pretty text-[13px] leading-relaxed text-[var(--dim)]">{children}</p>
      </div>
    </div>
  );
}

/** One hitter on a thin line, in the same marks as the bat speed bar: a tick for the typical hitter, a red dot for him. */
function Strip({
  axis,
  value,
  typical,
  typicalLabel,
  marks,
  ends,
  description,
}: {
  axis: { min: number; max: number };
  value: number;
  typical?: number;
  typicalLabel?: string;
  marks?: number[];
  ends: [string, string];
  description: string;
}) {
  const at = (v: number) => (100 * (Math.min(axis.max, Math.max(axis.min, v)) - axis.min)) / (axis.max - axis.min);
  return (
    <div>
      <div className="relative h-[26px]" role="img" aria-label={description}>
        <span className="absolute inset-x-0 top-[17px] h-[2px] bg-[var(--neutral-bar)]" />
        {marks?.map((m) => (
          <span key={m} className="absolute top-[14px] h-2 w-px bg-[var(--neutral-bar)]" style={{ left: `${100 * m}%` }} />
        ))}
        {typical != null && (
          <>
            <span className="absolute top-[11px] h-[14px] w-px bg-[var(--dimmer)]" style={{ left: `${at(typical)}%` }} />
            {typicalLabel && (
              <span
                className="absolute top-[-3px] -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-[var(--dim)]"
                style={{ left: `${Math.min(86, Math.max(14, at(typical)))}%` }}
              >
                {typicalLabel}
              </span>
            )}
          </>
        )}
        <span className="absolute top-[13.5px] h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-[var(--accent)]" style={{ left: `${at(value)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--dim)]">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
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
        How much faster his hardest swings are than his normal one on pitches in the zone, adjusted for pitch location, so it can differ a little from the gap between the two raw speeds. It is a style, not a skill: it has no relationship with Hitting+, Decision+ or Power+, and only a slight lean toward Contact+. The thin ticks mark a typical hitter&apos;s normal and hardest swing.
      </p>
    </div>
  );
}

const WHIFF_ROW: Record<WhiffGroup, string> = { fastball: "Fastballs", breaking: "Breaking balls", offspeed: "Offspeed" };

function WhiffChart({ groups, whiffs }: { groups: WhiffGroup[]; whiffs: NonNullable<SwingProfileRow["whiff_direction"]> }) {
  const dot = <span className="block h-[9px] w-[9px] rounded-full bg-[var(--accent)]" />;
  return (
    <div
      className="grid max-w-[380px] grid-cols-[96px_1fr_1px_1fr] items-center text-[11px] text-[var(--dim)]"
      role="img"
      aria-label={groups.map((g) => `${WHIFF_ROW[g]}: misses ${whiffs[g]!.direction}`).join(". ")}
    >
      <span />
      <span className="pb-1 text-center">Late</span>
      <span className="self-stretch bg-[var(--dimmer)]" />
      <span className="pb-1 text-center">Early</span>
      {groups.map((g) => (
        <Fragment key={g}>
          <span className="py-1">{WHIFF_ROW[g]}</span>
          <span className="flex justify-center">{whiffs[g]!.direction === "late" && dot}</span>
          <span className="self-stretch bg-[var(--dimmer)]" />
          <span className="flex justify-center">{whiffs[g]!.direction === "early" && dot}</span>
        </Fragment>
      ))}
    </div>
  );
}

function WhiffLine({ row }: { row: SwingProfileRow }) {
  const whiffs = row.whiff_direction ?? {};
  const shown = (["fastball", "breaking", "offspeed"] as WhiffGroup[]).filter((g) => whiffs[g]);
  if (!shown.length) return null;
  const breaks = row.whiff_breaks_pattern ?? [];

  const text = !breaks.length
    ? "Like nearly every hitter."
    : `He breaks the usual pattern: ${breaks
        .map((g) => `his ${GROUP_ADJECTIVE[g]} whiffs come ${whiffs[g]!.direction === "early" ? "further out front" : "deeper"} than his normal swing, where nearly every hitter misses the other way`)
        .join(", and ")}.`;
  return (
    <Metric label="Whiff direction" chart={<WhiffChart groups={shown} whiffs={whiffs} />}>
      {text} This compares where the bat meets the ball on his whiffs with all his swings, and shows direction, not how far.
    </Metric>
  );
}

function Launch({ row, league }: { row: SwingProfileRow; league: SwingProfileLeague }) {
  const { frames_to_contact: frames, launch_rank: rank, launch_pool: pool, launch_fifth: fifth } = row;
  if (frames == null || rank == null || pool == null || !fifth) return null;
  const trade = league.launch_trade;
  const xwoba = (v: number) => v.toFixed(3).replace(/^0/, "");
  return (
    <Metric
      label="When the swing launches"
      value={`${mph(frames)} frames`}
      note={`${row.launch_tied ? "tied " : ""}${ordinal(rank)} latest of ${pool}`}
      chart={
        <Strip
          axis={{ min: 1, max: pool }}
          value={rank}
          marks={FIFTHS}
          ends={["Latest fifth", "Earliest fifth"]}
          description={`${fifth} fifth of hitters: ${ordinal(rank)} latest launch of ${pool}.`}
        />
      }
    >
      <span className="font-medium text-[var(--text)]">{fifth} fifth of hitters. </span>
      How much of the swing is left once the bat really starts to turn, counted in frames of his average swing from Savant. Fewer frames means a later launch, which buys power and pays for it in contact, and the bill comes out about even.
      {trade &&
        ` Latest fifth: ${trade.latest.contact} Contact+, ${trade.latest.power} Power+, ${xwoba(trade.latest.xwoba)} xwOBA. Earliest fifth: ${trade.earliest.contact}, ${trade.earliest.power}, ${xwoba(trade.earliest.xwoba)}.`}
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
    <Metric
      label="With two strikes"
      value={value}
      chart={
        <Strip
          axis={TWO_STRIKE_AXIS}
          value={drop}
          typical={league.two_strike_drop_mean}
          typicalLabel={`typical ${mph(league.two_strike_drop_mean)}`}
          ends={["Swings harder", "Eases off"]}
          description={`Two-strike slowdown of ${mph(drop)} mph. A typical hitter eases off ${mph(league.two_strike_drop_mean)} mph.`}
        />
      }
    >
      {label && (
        <>
          <span className="font-medium text-[var(--text)]">{labelNode}</span>
          {label === "Shy Away Derek" ? ": he eases off with two strikes. " : ": the same swing, or harder, with two strikes. "}
        </>
      )}
      Most of the raw two-strike slowdown is pitchers throwing to slower spots, so this adjusts for location first. How much a hitter shortens up has no link to his contact, so read this as a style.
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
          <Metric
            label="Hard-swing payoff"
            value={`${signed(payoffEv)} mph`}
            note="exit velocity, fouls included"
            chart={
              <div className="space-y-2.5">
                <div>
                  <h4 className="text-[11px] font-medium text-[var(--dim)]">Exit velocity gain</h4>
                  <Strip
                    axis={PAYOFF_EV_AXIS}
                    value={payoffEv}
                    typical={league.payoff_ev_median}
                    typicalLabel={`typical ${signed(league.payoff_ev_median)} mph`}
                    ends={[`${PAYOFF_EV_AXIS.min} mph`, `+${PAYOFF_EV_AXIS.max} mph`]}
                    description={`Exit velocity gain of ${signed(payoffEv)} mph on his hardest swings. A typical hitter gains ${signed(league.payoff_ev_median)} mph.`}
                  />
                </div>
                <div>
                  <h4 className="text-[11px] font-medium text-[var(--dim)]">Change in whiffs</h4>
                  <Strip
                    axis={PAYOFF_WHIFF_AXIS}
                    value={payoffWhiff * 100}
                    typical={league.payoff_whiff_median * 100}
                    typicalLabel={`typical ${signed(league.payoff_whiff_median * 100)} pts`}
                    ends={[`${PAYOFF_WHIFF_AXIS.min} pts`, `+${PAYOFF_WHIFF_AXIS.max} pts`]}
                    description={`Whiff rate change of ${signed(payoffWhiff * 100)} points on his hardest swings. A typical hitter changes ${signed(league.payoff_whiff_median * 100)} points.`}
                  />
                </div>
              </div>
            }
          >
            {`On his hardest fifth of swings in the zone, contact comes off the bat ${mph(Math.abs(payoffEv))} mph ${payoffEv >= 0 ? "harder" : "softer"} than on the rest, and he whiffs ${whiffPts} points ${payoffWhiff >= 0 ? "more" : "less"} often.`}
          </Metric>
        )}

        {chase != null &&
          (row.chase_notable ? (
            <Metric
              label="Chase penalty"
              value={`${signed(chase)} mph`}
              note={`${Math.round((row.outside_share ?? 0) * 100)}% of swings outside the zone`}
              chart={
                <Strip
                  axis={CHASE_AXIS}
                  value={chase}
                  typical={league.chase_penalty_median}
                  typicalLabel={`typical ${signed(league.chase_penalty_median)} mph`}
                  ends={[`${CHASE_AXIS.min} mph`, `+${CHASE_AXIS.max} mph`]}
                  description={`Chase penalty of ${signed(chase)} mph. A typical hitter loses ${mph(league.chase_penalty_median)} mph this way.`}
                />
              }
            >
              How much raw bat speed undersells him because of swings at pitches off the plate. Those swings are slower for everyone.
            </Metric>
          ) : (
            <Metric label="Chase penalty">Raw bat speed is a clean read on his swing.</Metric>
          ))}

        <TwoStrikes row={row} league={league} />

        {row.picking_pct != null && (
          <Metric
            label="Picking his spots"
            value={percentile(row.picking_pct)}
            note="percentile"
            chart={
              <Strip
                axis={PERCENTILE_AXIS}
                value={row.picking_pct}
                typical={50}
                typicalLabel="typical"
                ends={["Spreads it around", "Picks his spots"]}
                description={`${percentile(row.picking_pct)} percentile for saving hard swings for the right spots.`}
              />
            }
          >
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
