"use client";

import { useEffect, useRef, useState } from "react";
import { COMPONENT_KEYS, CONF_FIELD, DepthKey, Player, StatKey } from "@/lib/hitting-plus/types";
import { confidenceOpacity, confidenceTier, fmtNum, fmtPercentile, fmtSigned, ordinal, formatName } from "@/lib/hitting-plus/metrics";
import { ramp } from "@/lib/hitting-plus/ramp";
import { COMPONENT_ASK, CONFIDENCE_NOTE } from "@/lib/hitting-plus/copy";
import ContactDiagram from "./ContactDiagram";
import WhiffDiagram from "./WhiffDiagram";
import PowerDiagram from "./PowerDiagram";
import Headshot from "./Headshot";
import YearOverYear from "./YearOverYear";
import RollingChart from "./RollingChart";
import SplitsTable from "./SplitsTable";

type PctFn = (x: number | null | undefined) => number | null;
type PctRecord = Record<StatKey, PctFn>;

interface Props {
  player: Player;
  pct: PctRecord;
  leagueDepth: Record<DepthKey, number>;
  eliteGap: Record<"depth_BR" | "depth_OS", number>;
  leagueWhiffGap: number;
  eliteWhiffGap: number;
  leagueBS: number;
  leagueAA: number;
  eliteBS: number;
  eliteAA: number;
  history: Player[];
  pctBySeason: Record<number, PctRecord>;
  onSelectSeason: (year: number) => void;
}

const GAP_HIGH = 25;
const GAP_LOW = -25;

export default function PlayerCard({
  player: d,
  pct,
  leagueDepth,
  eliteGap,
  leagueWhiffGap,
  eliteWhiffGap,
  leagueBS,
  leagueAA,
  eliteBS,
  eliteAA,
  history,
  pctBySeason,
  onSelectSeason,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [gamelog, setGamelog] = useState<Record<string, unknown> | null | "loading">("loading");

  // Fetch gamelog for this player+season
  useEffect(() => {
    setGamelog("loading");
    fetch(`/data/gamelogs_${d.game_year}.json`)
      .then((r) => r.json())
      .then((data) => setGamelog(data?.players?.[d.player_name] ?? null))
      .catch(() => setGamelog(null));
  }, [d.player_name, d.game_year]);

  // Scroll card into view when season changes (e.g. from YearOverYear click)
  const prevSeason = useRef(d.game_year);
  useEffect(() => {
    if (prevSeason.current !== d.game_year) {
      prevSeason.current = d.game_year;
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [d.game_year]);

  const hp = pct["Hitting+"](d["Hitting+"]);
  const xp = pct["xwoba"](d.xwoba);
  const wp = pct["wrc_plus"](d.wrc_plus);
  const gap = hp != null && xp != null ? hp - xp : null;

  const hittingConf = d[CONF_FIELD["Hitting+"]] as number | null;
  const hittingTier = confidenceTier(hittingConf);

  let read: string | null = null;
  let warn = false;
  if (gap != null) {
    if (gap > GAP_HIGH) {
      warn = true;
      read =
        "The swing grades far better than the batted balls. Something after contact is not going his way, or the model is seeing skills the results have not paid out yet.";
    } else if (gap < GAP_LOW) {
      warn = true;
      const extra = d.extra_bases;
      if (extra != null && extra > 0.04) {
        read = `He is producing well beyond what the swing itself explains. He also takes ${fmtSigned(
          extra,
          2
        )} extra bases per batted ball, which Hitting+ cannot see because it grades the bat, not the legs.`;
      } else {
        read =
          "He is producing well beyond what the swing itself explains. His extra bases are unremarkable, so this gap is not baserunning. It is the model missing something about how he hits.";
      }
    }
  }

  const loadedGamelog = gamelog === "loading" ? null : gamelog;
  const splits = loadedGamelog && typeof loadedGamelog === "object" && "splits" in loadedGamelog
    ? (loadedGamelog as { splits: Parameters<typeof SplitsTable>[0]["splits"] }).splits
    : undefined;

  return (
    <div ref={cardRef} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-6 shadow-[var(--panel-shadow)] sm:px-7 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--rule)] pb-5">
        <div className="flex items-center gap-4">
          <Headshot name={d.player_name} size={72} className="border border-[var(--panel-border)]" />
          <div>
            <div className="text-3xl font-bold leading-tight sm:text-[34px]">{formatName(d.player_name)}</div>
            <div className="mt-1.5 text-xs text-[var(--dim)]">
              {[
                `${d.game_year}`,
                `${d.pitches.toLocaleString()} pitches`,
                `${d.swings.toLocaleString()} swings`,
                `${d.pa} PA`,
              ].join(" · ")}
            </div>
            <a
              href={`/compare?tab=hitter&a=${encodeURIComponent(formatName(d.player_name))}&yearA=${d.game_year}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-[var(--rule)] bg-[var(--panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--dim)] transition-colors hover:border-[var(--dimmer)] hover:text-[var(--text)]"
            >
              Compare in Percentile Compare ↗
            </a>
          </div>
        </div>
        <div
          className="flex-shrink-0 text-left sm:text-right"
          style={{ opacity: confidenceOpacity(hittingConf) }}
        >
          <div className="text-[40px] font-bold leading-none tabular-nums sm:text-[52px]" style={{ color: ramp(hp) }}>
            {fmtNum(d["Hitting+"], 0)}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">Hitting+</div>
          <div className="mt-0.5 text-xs text-[var(--dim)]">{hp == null ? "" : fmtPercentile(hp)}</div>
          {hittingTier !== "full" && hittingConf != null && (
            <div className="mt-0.5 text-xs text-[var(--dimmer)]" title={CONFIDENCE_NOTE}>
              {(hittingConf * 100).toFixed(0)}% confidence
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          The swing, in order
        </h2>
        <div className="relative space-y-[18px] pl-[26px]">
          <div className="absolute bottom-[14px] left-[7px] top-[10px] w-px bg-[var(--rule)]" />
          {COMPONENT_KEYS.map((k, i) => {
            const p = pct[k](d[k]);
            const w = Math.max(2, Math.min(100, p == null ? 0 : p));
            const color = ramp(p);
            const conf = d[CONF_FIELD[k]] as number | null;
            const tier = confidenceTier(conf);
            return (
              <div key={k} className="relative" style={{ opacity: confidenceOpacity(conf) }}>
                <span
                  className="absolute -left-[23px] top-[6px] h-[9px] w-[9px] rounded-full border"
                  style={{
                    background: p != null && p >= 50 ? "var(--accent)" : "var(--panel)",
                    borderColor: p != null && p >= 50 ? "var(--accent)" : "var(--dimmer)",
                  }}
                />
                <div className="mb-1.5 flex flex-wrap items-baseline gap-2.5">
                  <span className="text-[11px] tracking-[0.1em] text-[var(--dimmer)]">{i + 1}</span>
                  <span className="text-[15px] font-semibold">{k}</span>
                  <span className="text-[13px] text-[var(--dim)]">{COMPONENT_ASK[k]}</span>
                  <span className="ml-auto flex items-baseline gap-2">
                    <span className="text-[17px] font-bold tabular-nums" style={{ color }}>
                      {fmtNum(d[k], 0)}
                    </span>
                    {tier !== "full" && conf != null && (
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: tier === "low" ? "var(--accent)" : "var(--amber)" }}
                        title={CONFIDENCE_NOTE}
                      >
                        {(conf * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative h-[7px] overflow-hidden rounded-full bg-[var(--track)]">
                  <span className="absolute -bottom-0.5 -top-0.5 left-1/2 w-px bg-[var(--dimmer)]" />
                  <span
                    className="absolute bottom-0 left-0 top-0 rounded-full transition-[width] motion-reduce:transition-none"
                    style={{ width: `${w}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          Where he meets the ball
        </h2>
        <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--track)] px-4 pb-3 pt-[18px] sm:px-5">
          <ContactDiagram player={d} leagueDepth={leagueDepth} eliteGap={eliteGap} />
        </div>
        <p className="mt-2 text-[11px] text-[var(--dimmer)]">
          {`Fastball is ${formatName(d.player_name).split(" ")[0]}'s own baseline. Each dot shows how many inches later he meets that pitch type than he meets a fastball, which is exactly what Timing+ grades: the gap, not how early or late he is compared to other hitters. The open circle marks a typical hitter's gap and the line marks the least-fooled hitters' gap (90th percentile), so a hitter can look ordinary on any one pitch type and still have a large or small gap.`}
        </p>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          Whether he made contact
        </h2>
        <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--track)] px-4 pb-3 pt-[18px] sm:px-5">
          <WhiffDiagram player={d} leagueGap={leagueWhiffGap} eliteGap={eliteWhiffGap} />
        </div>
        <p className="mt-2 text-[11px] text-[var(--dimmer)]">
          {`How much more, or less, ${formatName(d.player_name).split(" ")[0]} whiffed than expected given the location, count and pitch type he actually swung at, which is exactly what Contact+ grades: the gap, not the raw whiff rate, so a hitter who saw tougher pitches isn't penalized for it. The open circle marks a typical hitter's gap and the line marks the least-fooled hitters' gap (10th percentile).`}
        </p>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          What the bat did on contact
        </h2>
        <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--track)] px-4 pb-3 pt-[18px] sm:px-5">
          <PowerDiagram player={d} leagueBS={leagueBS} leagueAA={leagueAA} eliteBS={eliteBS} eliteAA={eliteAA} />
        </div>
        <p className="mt-2 text-[11px] text-[var(--dimmer)]">
          {`Bat speed and attack angle at the moment of contact, both adjusted for pitch location since hitters naturally swing slower and steeper on some locations regardless of ability. Together these are what Power+ grades. Dotted lines mark a typical hitter and the 90th-percentile hitter on each axis independently.`}
        </p>
      </div>

      <YearOverYear history={history} pctBySeason={pctBySeason} currentSeason={d.game_year} onSelectSeason={onSelectSeason} />

      <SplitsTable splits={splits} />

      <RollingChart gamelog={gamelog === "loading" ? null : gamelog} loading={gamelog === "loading"} />

      <div className="mt-6">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
          Grade against results
        </h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-5">
          <div className="bg-[var(--panel)] px-4 py-3.5">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">Hitting+</div>
            <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: ramp(hp) }}>
              {fmtNum(d["Hitting+"], 0)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--dimmer)]">
              {hp == null ? "" : `${ordinal(hp)} pctile`}
            </div>
          </div>
          <div className="bg-[var(--panel)] px-4 py-3.5">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">wRC+</div>
            <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: ramp(wp) }}>
              {fmtNum(d.wrc_plus, 0)}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--dimmer)]">
              {wp == null ? "FanGraphs" : `${ordinal(wp)} pctile`}
            </div>
          </div>
          <div className="bg-[var(--panel)] px-4 py-3.5">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">xwOBA</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{fmtNum(d.xwoba, 3)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--dimmer)]">
              {xp == null ? "" : `${ordinal(xp)} pctile`}
            </div>
          </div>
          <div className="bg-[var(--panel)] px-4 py-3.5">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">wOBA</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{fmtNum(d.woba, 3)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--dimmer)]">actual</div>
          </div>
          <div className="bg-[var(--panel)] px-4 py-3.5">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">Extra bases</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{fmtSigned(d.extra_bases, 2)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--dimmer)]">per batted ball</div>
          </div>
        </div>
      </div>
    </div>
  );
}
