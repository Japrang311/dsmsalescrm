import { useQuery } from "@tanstack/react-query";
import { History, ArrowRight, ShieldCheck, User2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { listClientStatusHistory } from "@/lib/data/activity-log";
import { ROLE_LABEL } from "@/context/role-context";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusAuditTrail({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["activity-log", "client-status", clientId],
    queryFn: () => listClientStatusHistory(clientId),
  });
  const entries = data ?? [];

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold text-foreground">
            Audit Trail Status
          </CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {entries.length} perubahan
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <History className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Belum ada perubahan status
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Setiap perubahan status oleh Sales atau Sales Manager akan
              tercatat di sini lengkap dengan aktor, waktu, dan catatan.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {entries.map((entry) => {
              const isManager = entry.byRole === "manager";
              return (
                <li key={entry.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={entry.from} />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <StatusBadge status={entry.to} />
                    {isManager && (
                      <Badge
                        variant="outline"
                        className="border-warning/40 bg-warning/10 text-[10px] text-warning"
                      >
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Koreksi Manager
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-foreground">
                      <User2 className="h-3 w-3" />
                      {entry.byUserName}
                    </span>
                    <span>{ROLE_LABEL[entry.byRole]}</span>
                    <span>·</span>
                    <span>{formatWhen(entry.at)}</span>
                  </div>
                  {entry.note && (
                    <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-foreground">
                      {entry.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
