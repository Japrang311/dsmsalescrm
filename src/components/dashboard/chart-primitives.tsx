import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { formatPercent, formatRupiahShort } from "@/lib/format";

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 10,
  boxShadow: "0 6px 16px -8px rgba(3,45,96,0.18)",
  fontSize: 12,
} as const;

type TooltipRow = { label: string; value: number; color: string };

export function ComparisonTooltip({
  active,
  payload,
  label,
  achievementKey,
  targetKey,
  achievementLabel = "Achievement",
  targetLabel = "Target",
  subtitle,
  cumulative = false,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  label?: string | number;
  achievementKey: string;
  targetKey: string;
  achievementLabel?: string;
  targetLabel?: string;
  subtitle?: string;
  cumulative?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload ?? {};
  const ach = Number(row[achievementKey] ?? 0);
  const tgt = Number(row[targetKey] ?? 0);
  const pct = tgt > 0 ? ach / tgt : 0;
  const gap = ach - tgt;
  const rows: TooltipRow[] = [
    { label: targetLabel, value: tgt, color: "var(--color-navy)" },
    { label: achievementLabel, value: ach, color: "var(--color-primary)" },
  ];
  const pctTone =
    pct >= 1 ? "text-success" : pct >= 0.8 ? "text-primary" : "text-warning";
  return (
    <div style={tooltipStyle}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        {subtitle ??
          (cumulative ? (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Kumulatif
            </div>
          ) : null)}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: r.color }}
              />
              {r.label}
            </span>
            <span className="num font-medium text-foreground">
              {formatRupiahShort(r.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-1.5">
        <span className="text-muted-foreground">Achievement %</span>
        <span className={`num font-semibold ${pctTone}`}>
          {formatPercent(pct)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Gap vs target</span>
        <span
          className={`num font-medium ${gap >= 0 ? "text-success" : "text-warning"}`}
        >
          {gap >= 0 ? "+" : "−"}
          {formatRupiahShort(Math.abs(gap))}
        </span>
      </div>
    </div>
  );
}

// Every Recharts <svg> is invisible to screen readers (no accessible name).
// ChartFrame wraps the ResponsiveContainer with role="img" + a text summary
// so the chart has a WCAG 1.1.1 text alternative; the SVG internals are then
// skipped by assistive tech.
export function ChartFrame({
  height,
  label,
  children,
}: {
  height: number;
  label: string;
  children: ReactElement;
}) {
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
