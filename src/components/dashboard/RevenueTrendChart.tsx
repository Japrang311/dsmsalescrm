import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import type { Role } from "@/lib/domain";
import { monthlyRevenueTrend } from "@/lib/data/dashboard-selectors";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatRupiahShort } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";

export function RevenueTrendChart({ role }: { role: Role }) {
  const isMobile = useIsMobile();
  const { orders, targetsByMember, companyTarget, currentUserId } =
    useDashboardData();
  const data = monthlyRevenueTrend(
    orders,
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  const tick = {
    fontSize: isMobile ? 10 : 11,
    fill: "var(--color-muted-foreground)",
  } as const;

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="px-3 pt-4 pb-2 sm:px-6 sm:pt-6">
        <CardTitle className="text-sm font-semibold text-foreground">
          Tren Revenue Bulanan
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bar: revenue aktual. Garis: target bulanan.
        </p>
      </CardHeader>
      <CardContent className="px-1 pb-4 pt-2 sm:px-4 sm:pb-6">
        <div className="w-full" style={{ height: isMobile ? 220 : 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{
                top: 8,
                right: isMobile ? 4 : 8,
                bottom: 0,
                left: isMobile ? 0 : -8,
              }}
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
                tick={tick}
                interval={isMobile ? 1 : 0}
              />
              <YAxis
                tickFormatter={(v) => formatRupiahShort(v).replace("Rp", "")}
                tickLine={false}
                axisLine={false}
                tick={tick}
                width={isMobile ? 56 : 70}
              />
              <Tooltip
                cursor={{ fill: "var(--color-primary-soft)" }}
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number) => formatRupiahShort(v)}
              />
              <Bar
                dataKey="revenue"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
                name="Revenue"
              />
              <Line
                type="monotone"
                dataKey="target"
                stroke="var(--color-navy)"
                strokeWidth={2}
                dot={false}
                name="Target"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function SimpleBarChart({
  data,
  dataKey = "value",
  color = "var(--color-primary)",
  height = 160,
}: {
  data: Array<{ name: string; value: number }>;
  dataKey?: string;
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <YAxis
            tickFormatter={(v) => formatRupiahShort(v).replace("Rp", "")}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            width={60}
          />
          <Tooltip
            cursor={{ fill: "var(--color-primary-soft)" }}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => formatRupiahShort(v)}
          />
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// LineChart re-export just to satisfy tree-shake noise (unused)
export const _Line = LineChart;
