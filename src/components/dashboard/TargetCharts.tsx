import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CURRENT_MONTH } from "@/lib/domain";
import type { Role } from "@/lib/domain";
import {
  monthlyRevenueTrendFromRpc,
  sumTrendRevenue,
  targetPerSalesFromRpc,
  ytdCumulativeTrendFromRpc,
  ytdTargetValue,
} from "@/lib/data/dashboard-selectors";
import {
  getSalesOrdersMonthlyTrend,
  getSalesOrdersOwnerYtd,
} from "@/lib/data/sales-orders-trend";
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

// ---------------------------------------------------------------------------
// 1. Achievement YTD vs Target YTD (cumulative) — Manager & Executive
// ---------------------------------------------------------------------------
export function YtdAchievementVsTargetChart({ role }: { role: Role }) {
  const cfg = useChartConfig();
  const { authReady } = useRole();
  const { targetsByMember, companyTarget, currentUserId } = useDashboardData();
  const trendQuery = useQuery({
    queryKey: ["sales-orders", "monthly-trend", "dashboard"],
    queryFn: () => getSalesOrdersMonthlyTrend(),
    enabled: authReady,
  });
  const data = ytdCumulativeTrendFromRpc(
    trendQuery.data ?? [],
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  const ach = sumTrendRevenue(trendQuery.data ?? []);
  const tgt = ytdTargetValue(
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
    12,
  );
  const pct = tgt > 0 ? ach / tgt : 0;

  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle
              as="h2"
              className="text-sm font-semibold text-foreground"
            >
              Akumulasi capaian per bulan
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Kumulatif vs target tahunan —{" "}
              {role === "manager" ? "seluruh tim sales" : "level perusahaan"}.
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              "shrink-0 " +
              (pct >= 1
                ? "border-success/40 bg-success/10 text-success"
                : pct >= 0.8
                  ? "border-primary/40 bg-primary-soft text-primary"
                  : "border-warning/40 bg-warning/10 text-warning")
            }
          >
            {formatPercent(pct)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={chartCardContent}>
        <ChartFrame
          height={cfg.height}
          label={`Grafik garis kumulatif achievement vs target ${
            role === "manager" ? "tim sales" : "perusahaan"
          } per bulan. Total achievement ${formatRupiahShort(
            ach,
          )} dari target ${formatRupiahShort(tgt)} (${formatPercent(pct)}).`}
        >
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
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Monthly Achievement vs Monthly Target (grouped bars) — Manager & Executive
// ---------------------------------------------------------------------------
export function MonthlyAchievementVsTargetChart({ role }: { role: Role }) {
  const cfg = useChartConfig();
  const { authReady } = useRole();
  const { targetsByMember, companyTarget, currentUserId } = useDashboardData();
  const trendQuery = useQuery({
    queryKey: ["sales-orders", "monthly-trend", "dashboard"],
    queryFn: () => getSalesOrdersMonthlyTrend(),
    enabled: authReady,
  });
  const data = monthlyRevenueTrendFromRpc(
    trendQuery.data ?? [],
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <CardTitle as="h2" className="text-sm font-semibold text-foreground">
          Achievement Monthly vs Target Monthly
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Perbandingan per bulan (Jan–
          {new Date(2026, CURRENT_MONTH - 1).toLocaleDateString("id-ID", {
            month: "short",
          })}
          ).
        </p>
        {data.length > 0 && !data.some((d) => d.revenue > 0) && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3 w-3" /> Belum ada capaian tercatat pada rentang
            ini.
          </p>
        )}
      </CardHeader>
      <CardContent className={chartCardContent}>
        <ChartFrame
          height={cfg.height}
          label={`Grafik batang: achievement vs target per bulan, Januari sampai bulan berjalan. Total achievement ${formatRupiahShort(
            data.reduce((s, d) => s + d.revenue, 0),
          )} dari target ${formatRupiahShort(
            data.reduce((s, d) => s + d.target, 0),
          )}.`}
        >
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
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Target per Sales (single sales) — Sales role
// ---------------------------------------------------------------------------
export function SingleSalesTargetChart() {
  const cfg = useChartConfig();
  const { authReady } = useRole();
  const { ownersById, targetsByMember, companyTarget, currentUserId } =
    useDashboardData();
  const trendQuery = useQuery({
    queryKey: ["sales-orders", "monthly-trend", "dashboard"],
    queryFn: () => getSalesOrdersMonthlyTrend(),
    enabled: authReady,
  });
  const memberName = currentUserId
    ? (ownersById[currentUserId]?.name ?? "Sales")
    : "Sales";
  const data = monthlyRevenueTrendFromRpc(
    trendQuery.data ?? [],
    "sales",
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  const ach = sumTrendRevenue(trendQuery.data ?? []);
  const tgt = ytdTargetValue(
    "sales",
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  const pct = tgt > 0 ? ach / tgt : 0;
  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle
              as="h2"
              className="truncate text-sm font-semibold text-foreground"
            >
              Target {memberName}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              YTD <span className="num">{formatRupiahShort(ach)}</span> /{" "}
              <span className="num">{formatRupiahShort(tgt)}</span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              "shrink-0 " +
              (pct >= 1
                ? "border-success/40 bg-success/10 text-success"
                : pct >= 0.8
                  ? "border-primary/40 bg-primary-soft text-primary"
                  : "border-warning/40 bg-warning/10 text-warning")
            }
          >
            {formatPercent(pct)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={chartCardContent}>
        <ChartFrame
          height={cfg.height}
          label={`Grafik batang: achievement bulanan ${memberName}. YTD ${formatRupiahShort(
            ach,
          )} dari target ${formatRupiahShort(tgt)} (${formatPercent(pct)}).`}
        >
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
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Target ALL Sales — Manager & Executive
// ---------------------------------------------------------------------------
export function TargetAllSalesChart() {
  const cfg = useChartConfig();
  const { authReady } = useRole();
  const { salesTeam, targetsByMember } = useDashboardData();
  const ownerYtdQuery = useQuery({
    queryKey: ["sales-orders", "owner-ytd", "dashboard"],
    queryFn: () => getSalesOrdersOwnerYtd(),
    enabled: authReady,
  });
  // On mobile, use first-name-only labels so grouped bars stay legible.
  const data = targetPerSalesFromRpc(
    ownerYtdQuery.data ?? [],
    salesTeam,
    targetsByMember,
  ).map((r) => ({
    ...r,
    label: cfg.isMobile ? r.name.split(" ")[0] : r.name,
  }));
  const mobileHeight = cfg.isMobile ? 300 : 260;
  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <CardTitle as="h2" className="text-sm font-semibold text-foreground">
          Target All Sales · Achievement vs Target YTD
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Perbandingan capaian setiap sales terhadap target akumulatif hingga
          bulan berjalan.
        </p>
        {data.length > 0 && !data.some((d) => d.achievement > 0) && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3 w-3" /> Belum ada capaian tercatat pada rentang
            ini.
          </p>
        )}
      </CardHeader>
      <CardContent className={chartCardContent}>
        <ChartFrame
          height={mobileHeight}
          label={`Grafik batang berkelompok: achievement vs target YTD untuk ${data.length} sales.`}
        >
          <BarChart
            data={data}
            margin={{ ...cfg.margin, bottom: cfg.isMobile ? 32 : 0 }}
            barCategoryGap={cfg.isMobile ? "16%" : "24%"}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={cfg.axisTick}
              interval={0}
              angle={cfg.isMobile ? -30 : 0}
              textAnchor={cfg.isMobile ? "end" : "middle"}
              height={cfg.isMobile ? 52 : 24}
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
                  achievementLabel="Achievement YTD"
                  targetLabel="Target YTD"
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
              name="Target YTD"
              fill="var(--color-navy)"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="achievement"
              name="Achievement YTD"
              fill="var(--color-primary)"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
}
