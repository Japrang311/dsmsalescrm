import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  sub,
  right,
  tone = "default",
  accent = false,
  compact = false,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  // `accent` = the primary metric of a group (a top rule, not a full border
  // that reads as focus). `compact` = a secondary stat: smaller value, no
  // reserved sub-line height.
  accent?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border shadow-none",
        accent && "border-t-2 border-t-primary",
      )}
    >
      <CardHeader
        className={cn(
          "flex flex-row items-start justify-between space-y-0",
          compact ? "p-4 pb-1.5" : "pb-2",
        )}
      >
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        {right}
      </CardHeader>
      <CardContent className={cn("space-y-1.5", compact && "p-4 pt-0")}>
        <div
          className={cn(
            "num font-semibold leading-tight text-foreground",
            compact ? "text-lg" : "text-2xl",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
            tone === "primary" && "text-primary",
          )}
        >
          {value}
        </div>
        {sub ? (
          <div
            className={cn(
              "text-xs text-muted-foreground",
              // Reserve two lines only for full-size cards, so a sibling with a
              // wrapping sub-line (e.g. Variance) doesn't grow taller.
              !compact && "min-h-8",
            )}
          >
            {sub}
          </div>
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
  // Start collapsed and grow on mount, so the bar reads as a fill rather than
  // appearing already-full. `transition-transform` below does the easing, and
  // the reduced-motion rule in styles.css collapses it to an instant jump.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const bg =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : "bg-primary";
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
      <div
        className={cn(
          "h-full w-full origin-left rounded-full transition-transform duration-500 ease-out",
          bg,
        )}
        style={{ transform: `scaleX(${grown ? clamped : 0})` }}
      />
    </div>
  );
}
