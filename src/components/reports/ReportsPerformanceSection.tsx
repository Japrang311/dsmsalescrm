import { Trophy, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent, formatRupiahShort } from "@/lib/format";
import type { Client } from "@/lib/domain";
import type { ReportSalesPerformanceRow } from "@/lib/report-selectors";

export function ReportsPerformanceSection({
  topCustomers,
  totalRevenue,
  salesPerf,
}: {
  topCustomers: { client: Client; revenue: number }[];
  totalRevenue: number;
  salesPerf: ReportSalesPerformanceRow[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-primary" /> Top 5 Customers YTD
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topCustomers.length === 0 ? (
            <EmptyState
              className="m-4"
              description="Belum ada revenue pada scope ini."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Klien</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-xs">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map(({ client, revenue }) => {
                  const share = totalRevenue ? revenue / totalRevenue : 0;
                  return (
                    <TableRow key={client.id} className="text-xs">
                      <TableCell className="max-w-[220px] truncate">
                        <Link
                          to="/clients/$clientId"
                          params={{ clientId: client.id }}
                          className="font-medium hover:text-primary"
                        >
                          {client.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiahShort(revenue)}
                      </TableCell>
                      <TableCell className="w-24">
                        <div className="flex items-center gap-1">
                          <Progress value={share * 100} className="h-1.5" />
                          <span className="w-8 text-[10px] tabular-nums text-muted-foreground">
                            {formatPercent(share)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" /> Sales Performance
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            1 Manager · {salesPerf.length} Sales
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Sales</TableHead>
                <TableHead className="text-right text-xs">Revenue</TableHead>
                <TableHead className="text-right text-xs">Target</TableHead>
                <TableHead className="text-xs">Achv</TableHead>
                <TableHead className="text-xs">Task</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesPerf.map(
                ({
                  member,
                  revenue,
                  target,
                  pct,
                  openTasks,
                  overdueTasks,
                  escalatedTasks,
                  completedTasks,
                  cancelledTasks,
                }) => (
                  <TableRow key={member.id} className="text-xs">
                    <TableCell>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        sales
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatRupiahShort(revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatRupiahShort(target)}
                    </TableCell>
                    <TableCell className="w-24">
                      <div className="flex items-center gap-1">
                        <Progress
                          value={Math.min(100, pct * 100)}
                          className="h-1.5"
                        />
                        <span
                          className={`w-9 text-[10px] tabular-nums ${pct >= 1 ? "text-emerald-600" : pct >= 0.7 ? "text-amber-600" : "text-red-600"}`}
                        >
                          {formatPercent(pct)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px]">
                      {openTasks === null ? (
                        <span className="text-muted-foreground">
                          Aggregate only
                        </span>
                      ) : (
                        <>
                          <span className="font-medium">{openTasks}</span> open
                          {overdueTasks ? (
                            <span className="ml-1 text-amber-600">
                              · {overdueTasks} overdue
                            </span>
                          ) : null}
                          {escalatedTasks ? (
                            <span className="ml-1 text-red-600">
                              · {escalatedTasks} escalated
                            </span>
                          ) : null}
                          <span className="ml-1 text-muted-foreground">
                            · {completedTasks} done / {cancelledTasks} cancel
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
