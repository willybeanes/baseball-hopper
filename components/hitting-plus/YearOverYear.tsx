import { Player, StatKey } from "@/lib/hitting-plus/types";
import { fmtNum } from "@/lib/hitting-plus/metrics";
import { ramp } from "@/lib/hitting-plus/ramp";

type PctFn = (x: number | null | undefined) => number | null;
type PctRecord = Record<StatKey, PctFn>;

const COLUMNS: { key: StatKey; label: string; digits: number }[] = [
  { key: "Hitting+", label: "Hitting+", digits: 0 },
  { key: "Decision+", label: "Decision+", digits: 0 },
  { key: "Timing+", label: "Timing+", digits: 0 },
  { key: "Contact+", label: "Contact+", digits: 0 },
  { key: "Power+", label: "Power+", digits: 0 },
  { key: "xwoba", label: "xwOBA", digits: 3 },
  { key: "wrc_plus", label: "wRC+", digits: 0 },
];

export default function YearOverYear({
  history,
  pctBySeason,
  currentSeason,
  onSelectSeason,
}: {
  history: Player[];
  pctBySeason: Record<number, PctRecord>;
  currentSeason: number;
  onSelectSeason: (year: number) => void;
}) {
  if (history.length < 2) return null;

  const rows = [...history].sort((a, b) => a.game_year - b.game_year);

  return (
    <div className="mt-6">
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
        Year over year
      </h2>
      <div className="overflow-x-auto rounded-[10px] border border-[var(--rule)]">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--panel)] px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
                Season
              </th>
              <th className="px-2.5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
                PA
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-2.5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = pctBySeason[r.game_year];
              const isCurrent = r.game_year === currentSeason;
              return (
                <tr
                  key={r.game_year}
                  onClick={() => onSelectSeason(r.game_year)}
                  className="group cursor-pointer border-t border-[var(--rule)] hover:bg-[var(--track)]"
                  style={{ background: isCurrent ? "var(--track)" : undefined }}
                >
                  <td
                    className="sticky left-0 z-[1] px-2.5 py-2 text-left font-semibold group-hover:bg-[var(--track)]"
                    style={{ background: isCurrent ? "var(--track)" : "var(--panel)" }}
                  >
                    {r.game_year}
                    {isCurrent && <span className="ml-1.5 text-[10px] font-normal text-[var(--dimmer)]">(shown above)</span>}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-[var(--dim)]">{r.pa}</td>
                  {COLUMNS.map((c) => {
                    const value = r[c.key] as number | null;
                    const p50 = pct ? pct[c.key](value) : null;
                    return (
                      <td
                        key={c.key}
                        className={`px-2.5 py-2 text-right tabular-nums ${c.key === "Hitting+" ? "font-bold" : ""}`}
                        style={{ color: p50 != null ? ramp(p50) : "var(--text)" }}
                      >
                        {fmtNum(value, c.digits)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[var(--dimmer)]">
        Each season&apos;s color reflects that season&apos;s own percentile, never pooled across years. Click a row
        to view that season.
      </p>
    </div>
  );
}
