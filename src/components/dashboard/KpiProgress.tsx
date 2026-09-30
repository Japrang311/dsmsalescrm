import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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
