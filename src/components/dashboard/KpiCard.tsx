import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  sub,
  right,
  tone = "default",
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  children?: ReactNode;
}) {
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        {right}
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div
          className={cn(
            "num text-2xl font-semibold leading-tight text-foreground",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
            tone === "primary" && "text-primary",
          )}
        >
          {value}
        </div>
        {sub ? (
          <div className="text-xs text-muted-foreground">{sub}</div>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

export function KpiProgress({
  pct,
  tone = "primary",
}: {
  pct: number;
  tone?: "primary" | "success" | "warning";
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const bg =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : "bg-primary";
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", bg)}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
