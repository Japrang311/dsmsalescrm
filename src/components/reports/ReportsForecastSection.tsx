import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiahShort } from "@/lib/format";
import { CHART_COLORS, ChartEmpty, ForecastTile } from "./ReportPrimitives";

export function ReportsForecastSection({
  totalRevenue,
  sourceBreakdown,
  forecast,
}: {
  totalRevenue: number;
  sourceBreakdown: { name: string; value: number }[];
  forecast: {
    achievement: number;
    pipeline: number;
    total: number;
    target: number;
  };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Revenue Source Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] px-2 pb-3">
          {totalRevenue === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {sourceBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Forecast vs Achievement vs Target YTD
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Forecast = Achievement + nilai pipeline terbobot per stage (Client
            Request for Quotes 15% s/d Commit 90%).
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <ForecastTile
            label="Achievement"
            value={forecast.achievement}
            tone="primary"
            pct={forecast.target ? forecast.achievement / forecast.target : 0}
          />
          <ForecastTile
            label="Forecast (Achv + Pipeline)"
            value={forecast.total}
            tone="emerald"
            pct={forecast.target ? forecast.total / forecast.target : 0}
          />
          <ForecastTile
            label="Target YTD"
            value={forecast.target}
            tone="amber"
            pct={1}
          />
        </CardContent>
      </Card>
    </div>
  );
}
