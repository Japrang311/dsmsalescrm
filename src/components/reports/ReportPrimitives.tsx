import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";
import { formatPercent, formatRupiahShort } from "@/lib/format";

export function KpiTile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/[0.03]" : ""}>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ForecastTile({
  label,
  value,
  tone,
  pct,
}: {
  label: string;
  value: number;
  tone: "primary" | "emerald" | "amber";
  pct: number;
}) {
  const bar =
    tone === "primary"
      ? "bg-primary"
      : tone === "emerald"
        ? "bg-emerald-500"
        : "bg-amber-500";
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums">
        {formatRupiahShort(value)}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={`${bar} h-full`}
          style={{
            width: `${Math.min(100, Math.max(0, pct * 100)).toFixed(1)}%`,
          }}
        />
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
        {formatPercent(pct)} vs target YTD
      </p>
    </div>
  );
}

export function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "emerald" | "amber" | "muted";
}) {
  const cls =
    tone === "primary"
      ? "border-primary/30 bg-primary/[0.04]"
      : tone === "emerald"
        ? "border-emerald-300/50 bg-emerald-50/60"
        : tone === "amber"
          ? "border-amber-300/50 bg-amber-50/60"
          : "border-border bg-muted/30";
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ChartEmpty() {
  return (
    <EmptyState
      className="h-full"
      icon={BarChart3}
      description="Belum ada data pada rentang & filter ini."
    />
  );
}
