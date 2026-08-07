import { GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUOTATION_STAGES } from "@/lib/business-rules";
import type {
  AnalyticsCoverage,
  StageDwellMetric,
  StageFunnelMetric,
} from "@/lib/data/stage4-analytics";
import { CHART_COLORS, ChartEmpty } from "./ReportPrimitives";
import { CoverageNote, formatDays } from "./Stage4Primitives";

export function Stage4FunnelDwellSection({
  funnel,
  dwell,
  coverage,
}: {
  funnel: StageFunnelMetric[];
  dwell: StageDwellMetric[];
  coverage: AnalyticsCoverage[];
}) {
  const funnelCoverage = coverage.find((c) => c.metricName === "funnel");
  const dwellCoverage = coverage.find((c) => c.metricName === "dwell");
  const funnelByStage = Object.fromEntries(
    funnel.map((f) => [f.stage, f.enteredCount]),
  );
  const dwellByStage = Object.fromEntries(dwell.map((d) => [d.stage, d]));
  const maxEntered = Math.max(...funnel.map((f) => f.enteredCount), 1);
  const hasFunnel = funnel.length > 0;
  const hasDwell = dwell.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-primary" /> Stage-Entry Funnel
            (event-based)
          </CardTitle>
          <CoverageNote coverage={funnelCoverage} />
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          {!hasFunnel ? (
            <ChartEmpty />
          ) : (
            QUOTATION_STAGES.map((stage, i) => {
              const count = funnelByStage[stage] ?? 0;
              const pct = (count / maxEntered) * 100;
              return (
                <div key={stage} className="flex items-center gap-2 text-xs">
                  <div className="w-32 truncate text-muted-foreground">
                    {stage}
                  </div>
                  <div className="flex-1">
                    <div className="h-6 overflow-hidden rounded-md bg-muted/60">
                      <div
                        className="flex h-full items-center justify-end whitespace-nowrap pr-2 text-[10px] font-medium text-white"
                        style={{
                          width: `${count > 0 ? Math.max(6, pct) : 0}%`,
                          minWidth: count > 0 ? "3rem" : 0,
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      >
                        {count > 0 ? count : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Stage Dwell Time
          </CardTitle>
          <CoverageNote coverage={dwellCoverage} />
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 pb-4">
          {!hasDwell ? (
            <ChartEmpty />
          ) : (
            QUOTATION_STAGES.map((stage) => {
              const d = dwellByStage[stage];
              if (!d) return null;
              return (
                <div
                  key={stage}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-muted-foreground">
                    {stage}
                  </span>
                  <span className="flex gap-3 tabular-nums">
                    <span title="Completed dwell (interval tertutup)">
                      Selesai: {formatDays(d.completedMedianDays)} (
                      {d.completedCount})
                    </span>
                    <span
                      className="text-amber-700"
                      title="Open dwell (masih berjalan)"
                    >
                      Berjalan: {formatDays(d.openMedianDays)} ({d.openCount})
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
