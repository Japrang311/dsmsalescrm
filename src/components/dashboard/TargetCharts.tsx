import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CURRENT_MONTH } from "@/lib/domain";
import type { Role } from "@/lib/domain";
import {
  monthlyRevenueTrend,
  targetPerSales,
  ytdCumulativeTrend,
  ytdRevenue,
  ytdTargetValue,
} from "@/lib/data/dashboard-selectors";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatPercent, formatRupiahShort } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";

const CURRENT_SALES_ID = "22222222-2222-2222-2222-222222222222";

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: 10,
  boxShadow: "0 6px 16px -8px rgba(3,45,96,0.18)",
  fontSize: 12,
} as const;

type TooltipRow = { label: string; value: number; color: string };

function ComparisonTooltip({
  active,
  payload,
  label,
  achievementKey,
  targetKey,
  achievementLabel = "Achievement",
  targetLabel = "Target",
  subtitle,
  cumulative = false,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  label?: string | number;
  achievementKey: string;
  targetKey: string;
  achievementLabel?: string;
  targetLabel?: string;
  subtitle?: string;
  cumulative?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload ?? {};
  const ach = Number(row[achievementKey] ?? 0);
  const tgt = Number(row[targetKey] ?? 0);
  const pct = tgt > 0 ? ach / tgt : 0;
  const gap = ach - tgt;
  const rows: TooltipRow[] = [
    { label: targetLabel, value: tgt, color: "var(--color-navy)" },
    { label: achievementLabel, value: ach, color: "var(--color-primary)" },
  ];
  const pctTone =
    pct >= 1 ? "text-success" : pct >= 0.8 ? "text-primary" : "text-warning";
  return (
    <div style={tooltipStyle}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        {subtitle ??
          (cumulative ? (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Kumulatif
            </div>
          ) : null)}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: r.color }}
              />
              {r.label}
            </span>
            <span className="num font-medium text-foreground">
              {formatRupiahShort(r.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-1.5">
        <span className="text-muted-foreground">Achievement %</span>
        <span className={`num font-semibold ${pctTone}`}>
          {formatPercent(pct)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Gap vs target</span>
        <span
          className={`num font-medium ${gap >= 0 ? "text-success" : "text-warning"}`}
        >
          {gap >= 0 ? "+" : "−"}
          {formatRupiahShort(Math.abs(gap))}
        </span>
      </div>
    </div>
  );
}

// Consistent responsive chart config shared by every chart card.
function useChartConfig() {
  const isMobile = useIsMobile();
  return {
    isMobile,
    axisTick: {
      fontSize: isMobile ? 10 : 11,
      fill: "var(--color-muted-foreground)",
    } as const,
    yWidth: isMobile ? 56 : 70,
    // Tighter left inset on mobile so more space goes to the plot area.
    margin: {
      top: 8,
      right: isMobile ? 4 : 8,
      bottom: 0,
      left: isMobile ? 0 : -8,
    } as const,
    height: isMobile ? 240 : 260,
    legendStyle: { fontSize: isMobile ? 10 : 11, paddingTop: 4 },
  };
}

// Shared responsive padding for chart cards — trims default p-6 on mobile
// so the plot area gets ~24px more horizontal space.
const chartCardHeader = "px-3 pt-4 pb-2 sm:px-6 sm:pt-6";
const chartCardContent = "px-1 pb-4 pt-2 sm:px-4 sm:pb-6";

// ---------------------------------------------------------------------------
// 1. Achievement YTD vs Target YTD (cumulative) — Manager & Executive
// ---------------------------------------------------------------------------
export function YtdAchievementVsTargetChart({ role }: { role: Role }) {
  const cfg = useChartConfig();
  const { orders, targetsByMember, companyTarget } = useDashboardData();
  const data = ytdCumulativeTrend(
    orders,
    role,
    CURRENT_SALES_ID,
    targetsByMember,
    companyTarget,
  );
  const ach = ytdRevenue(orders);
  const tgt = ytdTargetValue(
    role,
    CURRENT_SALES_ID,
    targetsByMember,
    companyTarget,
  );
  const pct = tgt > 0 ? ach / tgt : 0;

  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground">
              Achievement YTD vs Target YTD
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Akumulasi bulanan —{" "}
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
        <div className="w-full" style={{ height: cfg.height }}>
          <ResponsiveContainer width="100%" height="100%">
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
                tickFormatter={(v: number) =>
                  formatRupiahShort(v).replace("Rp", "")
                }
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
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Monthly Achievement vs Monthly Target (grouped bars) — Manager & Executive
// ---------------------------------------------------------------------------
export function MonthlyAchievementVsTargetChart({ role }: { role: Role }) {
  const cfg = useChartConfig();
  const { orders, targetsByMember, companyTarget } = useDashboardData();
  const data = monthlyRevenueTrend(
    orders,
    role,
    CURRENT_SALES_ID,
    targetsByMember,
    companyTarget,
  );
  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <CardTitle className="text-sm font-semibold text-foreground">
          Achievement Monthly vs Target Monthly
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Perbandingan per bulan (Jan–
          {new Date(2026, CURRENT_MONTH - 1).toLocaleDateString("id-ID", {
            month: "short",
          })}
          ).
        </p>
      </CardHeader>
      <CardContent className={chartCardContent}>
        <div className="w-full" style={{ height: cfg.height }}>
          <ResponsiveContainer width="100%" height="100%">
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
                tickFormatter={(v: number) =>
                  formatRupiahShort(v).replace("Rp", "")
                }
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
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Target per Sales (single sales) — Sales role
// ---------------------------------------------------------------------------
export function SingleSalesTargetChart() {
  const cfg = useChartConfig();
  const { orders, ownersById, targetsByMember, companyTarget } =
    useDashboardData();
  const memberName = ownersById[CURRENT_SALES_ID]?.name ?? "Sales";
  const data = monthlyRevenueTrend(
    orders,
    "sales",
    CURRENT_SALES_ID,
    targetsByMember,
    companyTarget,
  );
  const ach = ytdRevenue(orders);
  const tgt = ytdTargetValue(
    "sales",
    CURRENT_SALES_ID,
    targetsByMember,
    companyTarget,
  );
  const pct = tgt > 0 ? ach / tgt : 0;
  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-semibold text-foreground">
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
        <div className="w-full" style={{ height: cfg.height }}>
          <ResponsiveContainer width="100%" height="100%">
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
                tickFormatter={(v: number) =>
                  formatRupiahShort(v).replace("Rp", "")
                }
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
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Target ALL Sales — Manager & Executive
// ---------------------------------------------------------------------------
export function TargetAllSalesChart() {
  const cfg = useChartConfig();
  const { orders, salesTeam, targetsByMember } = useDashboardData();
  // On mobile, use first-name-only labels so grouped bars stay legible.
  const data = targetPerSales(orders, salesTeam, targetsByMember).map((r) => ({
    ...r,
    label: cfg.isMobile ? r.name.split(" ")[0] : r.name,
  }));
  const mobileHeight = cfg.isMobile ? 300 : 260;
  return (
    <Card className="border-border shadow-none">
      <CardHeader className={chartCardHeader}>
        <CardTitle className="text-sm font-semibold text-foreground">
          Target All Sales · Achievement vs Target YTD
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Perbandingan capaian setiap sales terhadap target akumulatif hingga
          bulan berjalan.
        </p>
      </CardHeader>
      <CardContent className={chartCardContent}>
        <div className="w-full" style={{ height: mobileHeight }}>
          <ResponsiveContainer width="100%" height="100%">
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
                tickFormatter={(v: number) =>
                  formatRupiahShort(v).replace("Rp", "")
                }
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
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
