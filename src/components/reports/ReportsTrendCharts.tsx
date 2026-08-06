import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiahShort } from "@/lib/format";
import { CURRENT_YEAR } from "@/lib/domain";
import { ChartEmpty } from "./ReportPrimitives";

type TrendPoint = { month: string; achievement: number; target: number };
type MonthlyPoint = { month: string; revenue: number; target: number };

export function ReportsTrendCharts({
  cumulativeTrend,
  monthlyTrend,
}: {
  cumulativeTrend: TrendPoint[];
  monthlyTrend: MonthlyPoint[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Achievement YTD vs Target YTD
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Akumulasi bulanan (kumulatif) untuk tahun {CURRENT_YEAR}.
          </p>
          {cumulativeTrend.length > 0 &&
            !cumulativeTrend.some((d) => d.achievement > 0) && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3" /> Belum ada capaian tercatat pada
                rentang ini.
              </p>
            )}
        </CardHeader>
        <CardContent className="h-[280px] px-2 pb-3">
          {cumulativeTrend.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={cumulativeTrend}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  opacity={0.5}
                />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => formatRupiahShort(v)}
                  tick={{ fontSize: 10 }}
                  width={70}
                />
                <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="achievement"
                  name="Achievement"
                  fill="#0176D3"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Monthly Achievement vs Monthly Target
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Perbandingan revenue per bulan terhadap target bulanan.
          </p>
          {monthlyTrend.length > 0 &&
            !monthlyTrend.some((d) => d.revenue > 0) && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3" /> Belum ada capaian tercatat pada
                rentang ini.
              </p>
            )}
        </CardHeader>
        <CardContent className="h-[280px] px-2 pb-3">
          {monthlyTrend.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyTrend}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  opacity={0.5}
                />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => formatRupiahShort(v)}
                  tick={{ fontSize: 10 }}
                  width={70}
                />
                <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="target"
                  name="Target"
                  fill="#CBD5E1"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="#0176D3"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
