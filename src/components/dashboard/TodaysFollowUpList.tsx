import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageSquare, MapPin, Users } from "lucide-react";

import { todaysFollowUps } from "@/lib/data/dashboard-selectors";
import { listActiveTasks } from "@/lib/data/tasks";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatDateShort, formatRupiahShort } from "@/lib/format";
import { useRole } from "@/context/role-context-core";

const METHOD_ICON = {
  Phone,
  Email: Mail,
  WhatsApp: MessageSquare,
  Visit: MapPin,
  Meeting: Users,
} as const;

// RLS already scopes `tasks` to what the logged-in user can see — no role
// prop needed here anymore (unlike the old mock version).
export function TodaysFollowUpList() {
  const { role, authReady } = useRole();
  const { clients, items, ownersById } = useDashboardData();
  // Today/Overdue/Escalated can only ever come from the still-open working
  // set, never Done/Cancelled/archived rows — same queryKey as the Tasks
  // Inbox page, so this reuses its cache instead of pulling the full
  // ever-growing task history via useDashboardData()'s unbounded listTasks().
  const activeTasksQuery = useQuery({
    queryKey: ["tasks", "active"],
    queryFn: listActiveTasks,
    enabled: authReady,
  });
  const rows = todaysFollowUps(
    activeTasksQuery.data ?? [],
    clients,
    items,
    ownersById,
  ).slice(0, 8);
  const canCompleteTasks = role !== "executive";

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Follow-Up Prioritas Hari Ini
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length} aktivitas menunggu tindak lanjut
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8" asChild>
          <Link to="/tasks">Lihat semua</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            className="m-4 py-10"
            description="Tidak ada follow-up prioritas hari ini."
          />
        ) : (
          <div className="divide-y divide-border">
            {rows.map(({ task, client, commercialItem, owner }) => {
              const Icon = METHOD_ICON[task.method];
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {client?.name ?? task.title}
                        </span>
                        {task.dueState === "Escalated" ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 bg-destructive/10 text-[10px] font-medium text-destructive"
                          >
                            Escalated
                          </Badge>
                        ) : task.dueState === "Overdue" ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 bg-destructive/10 text-[10px] font-medium text-destructive"
                          >
                            Overdue
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-primary/30 bg-primary-soft text-[10px] font-medium text-primary"
                          >
                            Hari ini
                          </Badge>
                        )}
                        {task.priority === "High" ? (
                          <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning/10 text-[10px] font-medium text-warning"
                          >
                            High
                          </Badge>
                        ) : null}
                      </div>
                      {client && (task.title || commercialItem) ? (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {task.title}
                          {commercialItem
                            ? ` · ${commercialItem.type} · ${commercialItem.stage}`
                            : ""}
                        </div>
                      ) : !client && commercialItem ? (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {commercialItem.type} · {commercialItem.stage}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-right">
                      {commercialItem ? (
                        <div className="num text-sm font-medium text-foreground">
                          {formatRupiahShort(commercialItem.estimatedValue)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">—</div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        Due {formatDateShort(task.dueDate)} ·{" "}
                        {owner?.initials ?? "-"}
                      </div>
                    </div>
                    {canCompleteTasks ? (
                      <Button size="sm" variant="secondary" className="h-8">
                        Mark Done
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
