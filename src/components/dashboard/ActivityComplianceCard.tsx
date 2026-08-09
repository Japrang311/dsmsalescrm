import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activityCompliance } from "@/lib/data/dashboard-selectors";
import { getSalesTaskClientMetrics } from "@/lib/data/sales-performance-metrics";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useRole } from "@/context/role-context";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ActivityComplianceCard() {
  const { authReady } = useRole();
  const { clients, salesTeam } = useDashboardData();
  const compliance = activityCompliance(clients);
  // Same RPC + queryKey as SalesPerformanceTable — cache-shared, and avoids
  // this card pulling the full unbounded orders/tasks arrays just to derive
  // per-sales overdue counts.
  const taskClientQuery = useQuery({
    queryKey: ["sales-task-client-metrics", "dashboard"],
    queryFn: () => getSalesTaskClientMetrics(),
    enabled: authReady,
  });
  const metricsByOwner = new Map(
    (taskClientQuery.data ?? []).map((m) => [m.ownerId, m]),
  );
  const perSales = salesTeam.map((member) => {
    const m = metricsByOwner.get(member.id);
    return {
      id: member.id,
      name: member.name,
      initials: member.initials,
      overdue: m?.overdueTasks ?? 0,
      open: m?.openTasks ?? 0,
    };
  });

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Activity Compliance
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Client aktif dengan next follow-up terjadwal.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Compliance rate</span>
          <span
            className={cn(
              "num text-lg font-semibold",
              compliance >= 0.9
                ? "text-success"
                : compliance >= 0.7
                  ? "text-primary"
                  : "text-warning",
            )}
          >
            {formatPercent(compliance)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className={cn(
              "h-full rounded-full",
              compliance >= 0.9
                ? "bg-success"
                : compliance >= 0.7
                  ? "bg-primary"
                  : "bg-warning",
            )}
            style={{ width: `${compliance * 100}%` }}
          />
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Overdue by sales
          </div>
          {perSales.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-foreground">
                <span className="text-muted-foreground">{s.initials}</span> ·{" "}
                {s.name}
              </span>
              <span
                className={cn(
                  "num text-sm font-medium",
                  s.overdue > 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {s.overdue} overdue
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
