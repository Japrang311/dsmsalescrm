import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Trophy } from "lucide-react";

import {
  forecastVsAchievement,
  topCustomersYtd,
  quotationFunnel,
  riskAlerts,
  ytdTargetValue,
} from "@/lib/data/dashboard-selectors";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatPercent, formatRupiahShort } from "@/lib/format";
import { KpiCard, KpiProgress } from "./KpiCard";
import { cn } from "@/lib/utils";

export function ForecastVsAchievementCard() {
  const { orders, items, targetsByMember, companyTarget } = useDashboardData();
  const { achievement, forecast, target } = forecastVsAchievement(
    orders,
    items,
    ytdTargetValue("executive", "", targetsByMember, companyTarget),
  );
  const pct = target > 0 ? forecast / target : 0;
  return (
    <KpiCard
      label="Forecast vs Target YTD"
      value={formatRupiahShort(forecast)}
      sub={
        <>
          Achievement{" "}
          <span className="num font-medium text-foreground">
            {formatRupiahShort(achievement)}
          </span>
          {" · "}Target <span className="num">{formatRupiahShort(target)}</span>
        </>
      }
      right={<TrendingUp className="h-4 w-4 text-primary" />}
    >
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Forecast coverage</span>
        <span className="num text-xs font-medium text-foreground">
          {formatPercent(pct)}
        </span>
      </div>
      <KpiProgress pct={pct} tone={pct >= 1 ? "success" : "primary"} />
    </KpiCard>
  );
}

export function TopCustomersCard() {
  const { orders, clients } = useDashboardData();
  const rows = topCustomersYtd(orders, clients, 5);
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy className="h-4 w-4 text-warning" />
          Top 5 Customers YTD
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li
              key={r.client.id}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {r.client.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.client.status}
                  </div>
                </div>
              </div>
              <div className="num shrink-0 text-sm font-semibold text-foreground">
                {formatRupiahShort(r.revenue)}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function QuotationFunnelCard() {
  const { items } = useDashboardData();
  const stages = quotationFunnel(items);
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Quotation Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {stages.map((s) => (
          <div key={s.stage}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.stage}</span>
              <span className="num font-medium text-foreground">
                {s.count} · {formatRupiahShort(s.value)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(s.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function RiskAlertsCard() {
  const { tasks, items, clients } = useDashboardData();
  const alerts = riskAlerts(tasks, items, clients);
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Risk Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 ? (
          <div className="rounded-md border border-border bg-surface-muted px-3 py-6 text-center text-xs text-muted-foreground">
            Tidak ada risiko yang perlu ditindaklanjuti.
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-md border px-3 py-2.5",
                a.severity === "high"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-warning/30 bg-warning/5",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {a.title}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    a.severity === "high"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-warning/40 bg-warning/10 text-warning",
                  )}
                >
                  {a.severity === "high" ? "High" : "Medium"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
