import { formatDateShort } from "@/lib/format";
import type { AnalyticsCoverage } from "@/lib/data/stage4-analytics";

// Stage 4 spec 7.3/7.5: every affected metric displays its
// analytics_effective_from and coverage (included/excluded) beside it, so
// a viewer can see at a glance how much of the data a chart actually
// reflects rather than silently trusting a number with unknown gaps.
export function CoverageNote({
  coverage,
}: {
  coverage: AnalyticsCoverage | undefined;
}) {
  if (!coverage) return null;
  const total = coverage.includedCount + coverage.excludedCount;
  const pct = total > 0 ? (coverage.includedCount / total) * 100 : 100;
  return (
    <p className="mt-0.5 text-[10px] text-muted-foreground">
      Cakupan: {coverage.includedCount}/{total} ({pct.toFixed(0)}%)
      {coverage.effectiveFrom
        ? ` · efektif sejak ${formatDateShort(coverage.effectiveFrom)}`
        : ""}
      {coverage.excludedCount > 0 && coverage.exclusionReason
        ? ` · ${coverage.excludedCount} dikecualikan: ${coverage.exclusionReason}`
        : ""}
    </p>
  );
}

export function formatDays(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)} hari`;
}
