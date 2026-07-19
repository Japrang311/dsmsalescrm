import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageSquare, MapPin, Users } from "lucide-react";

import { todaysFollowUps } from "@/lib/data/dashboard-selectors";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatDateShort, formatRupiahShort } from "@/lib/format";

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
  const { tasks, clients, items, ownersById } = useDashboardData();
  const rows = todaysFollowUps(tasks, clients, items, ownersById).slice(0, 8);

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
        <Button variant="outline" size="sm" className="h-8">
          Lihat semua
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Tidak ada follow-up prioritas hari ini.
          </div>
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
                          {client?.name ?? "-"}
                        </span>
                        {task.status === "Overdue" ? (
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
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {task.title}
                        {commercialItem
                          ? ` · ${commercialItem.type} · ${commercialItem.stage}`
                          : ""}
                      </div>
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
                    <Button size="sm" variant="secondary" className="h-8">
                      Mark Done
                    </Button>
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
