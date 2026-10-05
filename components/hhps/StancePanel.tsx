"use client";

import { useState } from "react";
import type { StanceMedians, StanceRow } from "@/lib/hhps";
import { pickStance } from "@/lib/hhps";

const f1 = (v: number | null | undefined, unit = "″") => (v == null ? "—" : `${v.toFixed(1)}${unit}`);
const ang = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}°`);

function Tile({ label, value, league, title }: { label: string; value: string; league?: string; title?: string }) {
  return (
    <div className="rounded-lg border border-[var(--rule)] p-3" title={title}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {league && <div className="text-[11px] text-[var(--dimmer)]">league median {league}</div>}
    </div>
  );
}

export default function StancePanel({
  rows, league, season, split, name,
}: {
  rows: StanceRow[];
  league: StanceMedians | null;
  season: number;
  split: string;          // current explorer split code (A R L F B O RF ...): vs-hand rows follow the hand buttons
  name: string;
}) {
  const sides = Array.from(new Set(rows.filter((r) => r.period === "S").map((r) => r.side)));
  const [sidePick, setSidePick] = useState<"L" | "R" | null>(null);
  if (!rows.length) return null;
  const side = (sidePick && sides.includes(sidePick) ? sidePick : sides[0]) as "L" | "R" | undefined;
  const row = pickStance(rows, side, split);
  if (!row) return null;
  const handLabel = row.pitch_hand === "A" ? "all pitchers" : row.pitch_hand === "R" ? "vs RHP" : "vs LHP";
  const seq = [
    { label: "At stance", sep: row.foot_sep0, angle: row.foot_angle0, lsep: league?.foot_sep0, lang: league?.foot_angle0 },
    { label: "At release", sep: row.foot_sep1, angle: row.foot_angle1, lsep: league?.foot_sep1, lang: league?.foot_angle1 },
    { label: "At contact", sep: row.foot_sep2, angle: row.foot_angle2, lsep: league?.foot_sep2, lang: league?.foot_angle2 },
  ];

  return (
    <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm">Stance at contact — {name}</h2>
          <p className="text-xs text-[var(--dim)] mt-0.5">
            {season} · bats {row.side === "L" ? "left" : "right"} · {handLabel} · from Baseball Savant&rsquo;s batting-stance data
          </p>
        </div>
        {sides.length > 1 && (
          <div className="flex gap-1 text-xs">
            {sides.map((sd) => (
              <button
                key={sd}
                onClick={() => setSidePick(sd)}
                className={`px-2 py-0.5 rounded border ${
                  sd === row.side
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "bg-[var(--panel)] text-[var(--dim)] border-[var(--panel-border)]"
                }`}
              >
                {sd === "L" ? "As LHH" : "As RHH"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--dimmer)] bg-[var(--bg)]">
              <th className="px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-left">Feet apart</th>
              <th className="px-3 py-2 text-left" title="Line between his big toes vs the pitcher direction. 0° is square, negative is open (front foot farther from the plate), positive is closed (front foot closer to the plate).">Foot angle</th>
            </tr>
          </thead>
          <tbody>
            {seq.map((s) => (
              <tr key={s.label} className="border-t border-[var(--rule)]">
                <td className="px-3 py-1.5 font-medium">{s.label}</td>
                <td className="px-3 py-1.5 tabular-nums">
                  {f1(s.sep)} <span className="text-[11px] text-[var(--dimmer)]">lg {f1(s.lsep)}</span>
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  {ang(s.angle)} <span className="text-[11px] text-[var(--dimmer)]">lg {ang(s.lang)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Stride" value={f1(row.stride)} league={f1(league?.stride)} title="How far his front foot travels from stance to contact" />
        <Tile
          label="Stance depth"
          value={f1(row.stance_depth)}
          league={f1(league?.stance_depth)}
          title="How far behind the front of the plate he stands. This is also the distance to the strike-zone plane drawn in the 3D view."
        />
        <Tile label="Depth at contact" value={f1(row.contact_depth)} league={f1(league?.contact_depth)} title="Derived: stance depth minus how far his feet move toward the pitcher by contact" />
        <Tile label="Off the plate" value={f1(row.stance_off_plate)} league={f1(league?.stance_off_plate)} title="Distance from the plate at stance" />
      </div>
    </section>
  );
}
