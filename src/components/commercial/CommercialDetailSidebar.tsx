import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDateShort } from "@/lib/format";
import { ROLE_LABEL } from "@/context/role-context";
import type { CommercialItem, Task } from "@/lib/domain";
import type { CommercialItemHistoryEntry } from "@/lib/data/activity-log";
import type { FollowUpLog } from "@/lib/data/follow-ups";

export function CommercialDetailSidebar({
  backHref,
  quotationHistory,
  relatedTasks,
  followUps,
  history,
  formatHistoryDetail,
}: {
  backHref: string;
  quotationHistory: CommercialItem[];
  relatedTasks: Task[];
  followUps: FollowUpLog[];
  history: CommercialItemHistoryEntry[];
  formatHistoryDetail: (detail: string | null | undefined) => string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {quotationHistory.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Riwayat Revisi
            </p>
            <ul className="flex flex-col gap-1.5">
              {quotationHistory.map((version) => (
                <li key={version.id}>
                  <Link
                    to={`${backHref}/${version.id}` as never}
                    className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-xs hover:border-primary/40"
                  >
                    <span className="font-mono">{version.quotationNumber}</span>
                    <Badge
                      variant={
                        version.isCurrentRevision ? "default" : "outline"
                      }
                    >
                      {version.isCurrentRevision ? "Current" : "Riwayat"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tasks / Follow-Up
          </p>
          {relatedTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Belum ada task terkait.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {relatedTasks.slice(0, 6).map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border bg-muted/30 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.title}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatDateShort(t.dueDate)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {t.method}
                    </Badge>
                    <span>{t.workflowStatus}</span>
                    <span>{t.dueState ?? "-"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Separator className="my-3" />

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Riwayat Follow-Up
          </p>
          {followUps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Belum ada follow-up terkait.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {followUps.slice(0, 6).map((followUp) => (
                <li
                  key={followUp.id}
                  className="rounded-md border bg-muted/30 p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {followUp.method} · {followUp.result}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatDateShort(followUp.fuDate)}
                    </span>
                  </div>
                  {followUp.notes && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {followUp.notes}
                    </p>
                  )}
                  {followUp.nextAction && (
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      Next: {followUp.nextAction}
                      {followUp.nextFuDate
                        ? ` · ${formatDateShort(followUp.nextFuDate)}`
                        : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            History
          </p>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Belum ada perubahan.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.slice(0, 8).map((h) => (
                <li
                  key={h.id}
                  className="rounded-md border bg-muted/30 p-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {h.actorName} · {ROLE_LABEL[h.actorRole]}
                    </span>
                    <span className="tabular-nums">
                      {new Date(h.at).toLocaleString("id-ID", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-start gap-1 text-[11px]">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {formatHistoryDetail(h.detail) ?? h.title}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
