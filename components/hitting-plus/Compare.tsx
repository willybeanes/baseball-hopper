"use client";

import { COMPONENT_KEYS, ComponentKey, Player, StatKey } from "@/lib/hitting-plus/types";
import { fmtNum, fmtSigned, formatName } from "@/lib/hitting-plus/metrics";
import { ramp } from "@/lib/hitting-plus/ramp";
import { COMPONENT_ASK } from "@/lib/hitting-plus/copy";
import SearchBox from "./SearchBox";
import Headshot from "./Headshot";

type PctFn = (x: number | null | undefined) => number | null;

const MAX_SLOTS = 3;

const ROWS: { key: keyof Player; label: string; digits: number; signed?: boolean }[] = [
  { key: "Hitting+", label: "Hitting+", digits: 0 },
  { key: "Decision+", label: "Decision+", digits: 0 },
  { key: "Timing+", label: "Timing+", digits: 0 },
  { key: "Contact+", label: "Contact+", digits: 0 },
  { key: "Power+", label: "Power+", digits: 0 },
  { key: "xwoba", label: "xwOBA", digits: 3 },
  { key: "wrc_plus", label: "wRC+", digits: 0 },
  { key: "woba", label: "wOBA", digits: 3 },
  { key: "extra_bases", label: "Extra bases", digits: 2, signed: true },
];

export default function Compare({
  players,
  searchPool,
  pct,
  selected,
  onChangeSelected,
}: {
  /** Full season pool, used to resolve already-chosen hitters so the PA filter can't drop them mid-comparison. */
  players: Player[];
  /** PA-filtered pool offered in the "add a hitter" search. */
  searchPool: Player[];
  pct: Record<StatKey, PctFn>;
  selected: string[];
  onChangeSelected: (names: string[]) => void;
}) {
  const chosen = selected
    .map((name) => players.find((p) => p.player_name === name))
    .filter((p): p is Player => !!p);

  function add(name: string) {
    if (chosen.length >= MAX_SLOTS) return;
    onChangeSelected([...selected, name]);
  }

  function remove(name: string) {
    onChangeSelected(selected.filter((n) => n !== name));
  }

  function pctFor(key: keyof Player, p: Player): number | null {
    if (
      key === "Hitting+" ||
      key === "xwoba" ||
      key === "wrc_plus" ||
      COMPONENT_KEYS.includes(key as ComponentKey)
    ) {
      return pct[key as StatKey](p[key] as number | null);
    }
    return null;
  }

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-6 shadow-[var(--panel-shadow)] sm:px-7 sm:py-6">
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
        Compare, two or three hitters
      </h2>

      {chosen.length < MAX_SLOTS && (
        <div className="mb-5 flex flex-wrap gap-3">
          <SearchBox
            players={searchPool}
            placeholder="Add a hitter to compare"
            onSelect={add}
            excludeNames={selected}
          />
        </div>
      )}

      {chosen.length === 0 && (
        <p className="text-xs text-[var(--dim)]">
          Search above to add up to three hitters from the selected season.
        </p>
      )}

      {chosen.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 pb-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
                  &nbsp;
                </th>
                {chosen.map((p) => (
                  <th key={p.player_name} className="px-3 pb-3 text-right align-bottom">
                    <Headshot name={p.player_name} size={48} className="ml-auto mb-1.5 border border-[var(--panel-border)]" />
                    <div className="text-lg font-bold leading-tight">{formatName(p.player_name)}</div>
                    <button
                      type="button"
                      onClick={() => remove(p.player_name)}
                      className="mt-1 text-[11px] text-[var(--dim)] underline decoration-[var(--dimmer)] hover:text-[var(--accent)]"
                    >
                      remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-t border-[var(--rule)]">
                  <td className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">
                    {row.label}
                    {COMPONENT_KEYS.includes(row.key as ComponentKey) && (
                      <div className="mt-0.5 normal-case tracking-normal text-[var(--dimmer)]">
                        {COMPONENT_ASK[row.key as ComponentKey]}
                      </div>
                    )}
                  </td>
                  {chosen.map((p) => {
                    const v = p[row.key] as number | null;
                    const p50 = pctFor(row.key, p);
                    return (
                      <td
                        key={p.player_name}
                        className="px-3 py-2.5 text-right text-base font-bold tabular-nums"
                        style={{ color: p50 != null ? ramp(p50) : undefined }}
                      >
                        {row.signed ? fmtSigned(v, row.digits) : fmtNum(v, row.digits)}
                        {p50 != null && (
                          <span className="ml-2 text-[11px] font-normal text-[var(--dimmer)]">
                            {p50.toFixed(0)}p
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
