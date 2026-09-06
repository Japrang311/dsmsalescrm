import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent, formatRupiahShort } from "@/lib/format";
import type {
  AnalyticsCoverage,
  LostReasonMetric,
  WinLossMetrics,
} from "@/lib/data/stage4-analytics";
import { ChartEmpty, StatBlock } from "./ReportPrimitives";
import { CHART_COLORS } from "./chart-colors";
import { CoverageNote } from "./Stage4Primitives";

export function Stage4WinLossSection({
  winLoss,
  lostReasons,
  coverage,
}: {
  winLoss: WinLossMetrics | undefined;
  lostReasons: LostReasonMetric[];
  coverage: AnalyticsCoverage[];
}) {
  const winLossCoverage = coverage.find((c) => c.metricName === "win_loss");
  const lostReasonCoverage = coverage.find(
    (c) => c.metricName === "lost_reason",
  );
  const hasWinLoss = (winLoss?.terminalCount ?? 0) > 0;
  const maxLostCount = Math.max(...lostReasons.map((r) => r.lostCount), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle
            as="h3"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Trophy className="h-4 w-4 text-primary" /> Win/Loss Quotation
          </CardTitle>
          <CoverageNote coverage={winLossCoverage} />
        </CardHeader>
        <CardContent>
          {!hasWinLoss ? (
            <ChartEmpty />
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatBlock
                label="Won"
                value={`${winLoss!.wonCount} · ${formatRupiahShort(winLoss!.wonValue)}`}
                tone="emerald"
              />
              <StatBlock
                label="Lost"
                value={`${winLoss!.lostCount} · ${formatRupiahShort(winLoss!.lostValue)}`}
                tone="amber"
              />
              <StatBlock
                label="Win Rate"
                value={
                  winLoss!.winRate === null
                    ? "—"
                    : formatPercent(winLoss!.winRate, 1)
                }
                tone="primary"
              />
              <StatBlock
                label="Total Terminal"
                value={`${winLoss!.terminalCount}`}
                tone="muted"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h3" className="text-sm font-semibold">
            Lost-Reason Breakdown
          </CardTitle>
          <CoverageNote coverage={lostReasonCoverage} />
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          {lostReasons.length === 0 ? (
            <ChartEmpty />
          ) : (
            lostReasons.map((r, i) => {
              const pct = (r.lostCount / maxLostCount) * 100;
              return (
                <div
                  key={r.lostReason}
                  className="flex items-center gap-2 text-xs"
                >
                  <div className="w-36 truncate text-muted-foreground">
                    {r.lostReason}
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/60">
                      <div
                        className="h-full rounded-md"
                        style={{
                          width: `${Math.max(2, pct)}%`,
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="w-28 shrink-0 whitespace-nowrap text-right text-[10px] font-medium tabular-nums text-foreground">
                      {r.lostCount} · {formatRupiahShort(r.lostValue)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
