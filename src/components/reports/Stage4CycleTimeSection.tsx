import { Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AnalyticsCoverage,
  CycleTimeLeg,
  CycleTimeMetric,
} from "@/lib/data/stage4-analytics";
import { ChartEmpty } from "./ReportPrimitives";
import { CoverageNote } from "./Stage4Primitives";
import { formatDays } from "./format-days";

const LEG_LABEL: Record<CycleTimeLeg, string> = {
  quote_to_po: "Quote → Customer PO",
  po_to_so: "Customer PO → Sales Order",
  quote_to_so: "Quote → Sales Order (end-to-end)",
};

function LegCard({ leg }: { leg: CycleTimeMetric }) {
  const total = leg.includedCount + leg.excludedCount;
  if (total === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {LEG_LABEL[leg.leg]}
        </p>
        <div className="mt-2">
          <ChartEmpty />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {LEG_LABEL[leg.leg]}
      </p>
      {leg.includedCount === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Tidak ada sample bertaut untuk periode/filter ini ({leg.excludedCount}{" "}
          dikecualikan).
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="font-semibold tabular-nums">
              {formatDays(leg.medianDays)}
            </p>
            <p className="text-[10px] text-muted-foreground">Median</p>
          </div>
          <div>
            <p className="font-semibold tabular-nums">
              {formatDays(leg.p75Days)}
            </p>
            <p className="text-[10px] text-muted-foreground">P75</p>
          </div>
          <div>
            <p className="font-semibold tabular-nums">
              {formatDays(leg.p90Days)}
            </p>
            <p className="text-[10px] text-muted-foreground">P90</p>
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {leg.includedCount}/{total} sample tercakup
      </p>
    </div>
  );
}

export function Stage4CycleTimeSection({
  cycleTime,
  coverage,
}: {
  cycleTime: CycleTimeMetric[];
  coverage: AnalyticsCoverage[];
}) {
  const cycleTimeCoverage = coverage.find((c) => c.metricName === "cycle_time");
  const order: CycleTimeLeg[] = ["quote_to_po", "po_to_so", "quote_to_so"];
  const byLeg = Object.fromEntries(cycleTime.map((c) => [c.leg, c]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4 text-primary" /> Cycle-Time (Quote → PO →
          Sales Order)
        </CardTitle>
        <CoverageNote coverage={cycleTimeCoverage} />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {order.map((leg) =>
          byLeg[leg] ? (
            <LegCard key={leg} leg={byLeg[leg]} />
          ) : (
            <div key={leg} className="rounded-md border bg-muted/20 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {LEG_LABEL[leg]}
              </p>
              <ChartEmpty />
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}
