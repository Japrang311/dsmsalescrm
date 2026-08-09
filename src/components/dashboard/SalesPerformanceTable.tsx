import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { salesPerformanceFromRpc } from "@/lib/data/dashboard-selectors";
import { getSalesOrdersOwnerYtd } from "@/lib/data/sales-orders-trend";
import { getSalesTaskClientMetrics } from "@/lib/data/sales-performance-metrics";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useRole } from "@/context/role-context-core";
import { formatRupiahShort, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SalesPerformanceTable() {
  const { authReady } = useRole();
  const { salesTeam, targetsByMember } = useDashboardData();
  const ownerYtdQuery = useQuery({
    queryKey: ["sales-orders", "owner-ytd", "dashboard"],
    queryFn: () => getSalesOrdersOwnerYtd(),
    enabled: authReady,
  });
  const taskClientQuery = useQuery({
    queryKey: ["sales-task-client-metrics", "dashboard"],
    queryFn: () => getSalesTaskClientMetrics(),
    enabled: authReady,
  });
  const rows = salesPerformanceFromRpc(
    ownerYtdQuery.data ?? [],
    taskClientQuery.data ?? [],
    salesTeam,
    targetsByMember,
  );

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Sales Performance vs Target YTD
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {salesTeam.length} anggota tim sales aktif. FOC prototype tidak
          dihitung dalam revenue.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[220px]">Sales</TableHead>
              <TableHead className="text-right">Revenue YTD</TableHead>
              <TableHead className="text-right">Target YTD</TableHead>
              <TableHead className="text-right">Achievement</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const pct = r.pct;
              const tone =
                pct >= 1 ? "success" : pct >= 0.8 ? "primary" : "warning";
              return (
                <TableRow key={r.member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-primary-soft text-primary text-[11px] font-semibold">
                          {r.member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {r.member.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.activeClients} active clients
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="num text-right text-sm">
                    {formatRupiahShort(r.revenue)}
                  </TableCell>
                  <TableCell className="num text-right text-sm text-muted-foreground">
                    {formatRupiahShort(r.target)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={cn(
                          "num text-sm font-semibold",
                          tone === "success" && "text-success",
                          tone === "warning" && "text-warning",
                          tone === "primary" && "text-primary",
                        )}
                      >
                        {formatPercent(pct)}
                      </span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border/60">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            tone === "success" && "bg-success",
                            tone === "warning" && "bg-warning",
                            tone === "primary" && "bg-primary",
                          )}
                          style={{ width: `${Math.min(1, pct) * 100}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="num text-right text-sm">
                    {r.openTasks}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.overdue > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 bg-destructive/10 text-destructive"
                      >
                        {r.overdue}
                      </Badge>
                    ) : (
                      <span className="num text-sm text-muted-foreground">
                        0
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
