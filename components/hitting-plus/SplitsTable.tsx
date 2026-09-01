"use client";

import { ramp } from "@/lib/hitting-plus/ramp";

interface SplitRow {
  pa: number;
  "Decision+": number | null;
  "Timing+": number | null;
  "Contact+": number | null;
  "Power+": number | null;
  "Hitting+": number | null;
}

interface Splits {
  platoon: Record<string, SplitRow>;
  month: Record<string, SplitRow>;
}

// percentile not available for splits, so color by value directly
// 100 = average (50th pctile), ±30 covers ~2 SD
function colorByValue(v: number | null): string {
  if (v == null) return "var(--text)";
  // Map 70–130 to 0–100 pctile scale for ramp()
  const pct = Math.max(0, Math.min(100, ((v - 70) / 60) * 100));
  return ramp(pct);
}

function fmt(v: number | null) {
  return v == null ? "—" : v.toFixed(0);
}

const COLS: { key: keyof SplitRow; label: string }[] = [
  { key: "Hitting+",  label: "Hit+" },
  { key: "Decision+", label: "Dec+" },
  { key: "Timing+",   label: "Tim+" },
  { key: "Contact+",  label: "Con+" },
  { key: "Power+",    label: "Pow+" },
];

function SplitSection({
  rows,
  labelFn,
}: {
  rows: [string, SplitRow][];
  labelFn: (k: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map(([key, row]) => (
        <tr key={key} className="border-t border-[var(--rule)]">
          <td className="py-2 pl-4 pr-2 text-left text-[12px] font-medium text-[var(--dim)]">
            {labelFn(key)}
          </td>
          <td className="py-2 pr-3 text-right tabular-nums text-[11px] text-[var(--dimmer)]">
            {row.pa}
          </td>
          {COLS.map(({ key: col }) => (
            <td
              key={col}
              className={`py-2 pr-3 text-right tabular-nums text-[12px] ${col === "Hitting+" ? "font-bold" : ""}`}
              style={{ color: colorByValue(row[col]) }}
            >
              {fmt(row[col])}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function SplitsTable({ splits }: { splits: Splits | undefined }) {
  if (!splits) return null;

  const platoonRows = Object.entries(splits.platoon ?? {});
  const monthRows   = Object.entries(splits.month ?? {});

  if (platoonRows.length === 0 && monthRows.length === 0) return null;

  const MONTH_ORDER = ["Mar/Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const sortedMonths = monthRows.sort(
    (a, b) => MONTH_ORDER.indexOf(a[0]) - MONTH_ORDER.indexOf(b[0])
  );

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
        Splits
      </h2>
      <div className="overflow-x-auto rounded-[10px] border border-[var(--rule)]">
        <table className="w-full min-w-[380px] border-collapse">
          <thead>
            <tr>
              <th className="py-2 pl-4 pr-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
                Split
              </th>
              <th className="py-2 pr-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]">
                PA
              </th>
              {COLS.map(({ key, label }) => (
                <th
                  key={key}
                  className="py-2 pr-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dim)]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Platoon divider */}
            {platoonRows.length > 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="border-t border-[var(--rule)] bg-[var(--track)] py-1 pl-4 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--dimmer)]"
                >
                  Platoon
                </td>
              </tr>
            )}
            <SplitSection
              rows={platoonRows}
              labelFn={(k) => (k === "R" ? "vs RHP" : "vs LHP")}
            />

            {/* Monthly divider */}
            {sortedMonths.length > 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="border-t border-[var(--rule)] bg-[var(--track)] py-1 pl-4 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--dimmer)]"
                >
                  By month
                </td>
              </tr>
            )}
            <SplitSection rows={sortedMonths} labelFn={(k) => k} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[var(--dimmer)]">
        Split grades use the same scale as season totals. Timing+ is unshrunk in small samples and may be noisy.
      </p>
    </div>
  );
}
