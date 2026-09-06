import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Role } from "@/lib/domain";
import {
  monthlyRevenueTrendFromRpc,
  sumTrendRevenue,
  ytdCumulativeTrendFromRpc,
  ytdTargetValue,
} from "@/lib/data/dashboard-selectors";
import { getSalesOrdersMonthlyTrend } from "@/lib/data/sales-orders-trend";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useRole } from "@/context/role-context-core";
import {
  formatPercent,
  formatRupiahAxis,
  formatRupiahShort,
} from "@/lib/format";
import {
  ChartFrame,
  ComparisonTooltip,
} from "@/components/dashboard/chart-primitives";
import {
  chartCardContent,
  chartCardHeader,
  useChartConfig,
} from "@/components/dashboard/chart-config";

// One chart replacing the old YTD-cumulative + monthly-bar + revenue-trend
// trio — a segmented toggle switches between the accumulation view and the
// per-month view over the same data.
export function AchievementTrendChart({ role }: { role: Role }) {
  const cfg = useChartConfig();
  const { authReady } = useRole();
  const { targetsByMember, companyTarget, currentUserId } = useDashboardData();
  const [view, setView] = useState<"cumulative" | "monthly">("cumulative");

  const trendQuery = useQuery({
    queryKey: ["sales-orders", "monthly-trend", "dashboard"],
    queryFn: () => getSalesOrdersMonthlyTrend(),
    enabled: authReady,
  });
  const trend = trendQuery.data ?? [];

  const cumulative = ytdCumulativeTrendFromRpc(
    trend,
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  const monthly = monthlyRevenueTrendFromRpc(
    trend,
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );

  const ach = sumTrendRevenue(trend);
  const tgt = ytdTargetValue(
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
    12,
  );
  const pct = tgt > 0 ? ach / tgt : 0;

  const isCumulative = view === "cumulative";
  const data = isCumulative ? cumulative : monthly;
  const scope = role === "manager" ? "tim sales" : "perusahaan";
  const hasNoAchievement =
    data.length > 0 &&
    (isCumulative
      ? !cumulative.some((d) => d.achievement > 0)
      : !monthly.some((d) => d.revenue > 0));

  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle
              as="h2"
              className="text-sm font-semibold text-foreground"
            >
              Tren capaian
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isCumulative
                ? `Akumulasi vs target tahunan — ${scope}.`
                : `Per bulan vs target bulanan — ${scope}.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className={
                pct >= 1
                  ? "border-success/40 bg-success/10 text-success"
                  : pct >= 0.8
                    ? "border-primary/40 bg-primary-soft text-primary"
                    : "border-warning/40 bg-warning/10 text-warning"
              }
            >
              {formatPercent(pct)}
            </Badge>
            <ToggleGroup
              type="single"
              size="sm"
              value={view}
              onValueChange={(v) => {
                if (v === "cumulative" || v === "monthly") setView(v);
              }}
              className="rounded-md border bg-card p-0.5"
            >
              <ToggleGroupItem
                value="cumulative"
                className="h-7 px-2 text-[11px]"
              >
                Kumulatif
              </ToggleGroupItem>
              <ToggleGroupItem value="monthly" className="h-7 px-2 text-[11px]">
                Per-bulan
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        {hasNoAchievement && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3 w-3" /> Belum ada capaian tercatat pada rentang
            ini.
          </p>
        )}
      </CardHeader>
      <CardContent className={chartCardContent}>
        <ChartFrame
          height={cfg.height}
          label={`${
            isCumulative ? "Grafik garis kumulatif" : "Grafik batang per bulan"
          } achievement vs target ${scope}. Total achievement ${formatRupiahShort(
            ach,
          )} dari target ${formatRupiahShort(tgt)} (${formatPercent(pct)}).`}
        >
          {isCumulative ? (
            <ComposedChart data={data} margin={cfg.margin}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={cfg.axisTick}
                interval={cfg.isMobile ? 1 : 0}
              />
              <YAxis
                tickFormatter={formatRupiahAxis}
                tickLine={false}
                axisLine={false}
                tick={cfg.axisTick}
                width={cfg.yWidth}
              />
              <Tooltip
                cursor={{ fill: "var(--color-primary-soft)", opacity: 0.35 }}
                content={(props) => (
                  <ComparisonTooltip
                    {...props}
                    achievementKey="achievement"
                    targetKey="target"
                    cumulative
                  />
                )}
              />
              <Legend
                wrapperStyle={cfg.legendStyle}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="achievement"
                name="Achievement"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="target"
                name="Target"
                stroke="var(--color-navy)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "var(--color-navy)" }}
              />
            </ComposedChart>
          ) : (
            <BarChart
              data={data}
              margin={cfg.margin}
              barCategoryGap={cfg.isMobile ? "12%" : "20%"}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={cfg.axisTick}
                interval={cfg.isMobile ? 1 : 0}
              />
              <YAxis
                tickFormatter={formatRupiahAxis}
                tickLine={false}
                axisLine={false}
                tick={cfg.axisTick}
                width={cfg.yWidth}
              />
              <Tooltip
                cursor={{ fill: "var(--color-primary-soft)", opacity: 0.35 }}
                content={(props) => (
                  <ComparisonTooltip
                    {...props}
                    achievementKey="revenue"
                    targetKey="target"
                  />
                )}
              />
              <Legend
                wrapperStyle={cfg.legendStyle}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="target"
                name="Target"
                fill="var(--color-navy)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="revenue"
                name="Achievement"
                fill="var(--color-primary)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          )}
        </ChartFrame>
      </CardContent>
    </Card>
  );
}
