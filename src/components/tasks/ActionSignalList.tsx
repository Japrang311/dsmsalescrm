import { AlertTriangle, ArrowRight, ListChecks, PhoneCall } from "lucide-react";

import { LogCommercialFollowUpDialog } from "@/components/commercial/LogCommercialFollowUpDialog";
import { ActionSignalActionDialog } from "@/components/tasks/ActionSignalActionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ActionSignalItem,
  ActionSignalsSnapshot,
} from "@/lib/data/action-signals";
import { formatDateShort, formatRupiahShort } from "@/lib/format";

const RULE_LABELS: Record<ActionSignalItem["ruleId"], string> = {
  won_without_so: "Won tanpa SO",
  expected_close_overdue: "Expected close lewat",
  quotation_expiry_due: "Quotation hampir kedaluwarsa",
  deal_stagnant: "Deal stagnan",
};

export type ActionSignalGroup = {
  entityId: string;
  clientName: string;
  ownerName: string;
  quotationNumber: string | null;
  stage: string;
  totalValue: number | null;
  sourceHref: string;
  signals: ActionSignalItem[];
};

function groupActionSignalsByEntity(
  items: ActionSignalItem[],
): ActionSignalGroup[] {
  const groups = new Map<string, ActionSignalGroup>();
  for (const item of items) {
    const existing = groups.get(item.entityId);
    if (existing) {
      existing.signals.push(item);
      continue;
    }
    groups.set(item.entityId, {
      entityId: item.entityId,
      clientName: item.clientName,
      ownerName: item.ownerName,
      quotationNumber: item.quotationNumber,
      stage: item.stage,
      totalValue: item.totalValue,
      sourceHref: item.sourceHref,
      signals: [item],
    });
  }
  return [...groups.values()];
}

type ActionSignalListProps = {
  snapshot?: ActionSignalsSnapshot;
  isLoading?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  aggregateOnly?: boolean;
  compact?: boolean;
  showAllHref?: string;
  onRetry?: () => void;
  onLoadMore?: () => void;
};

export function ActionSignalList({
  snapshot,
  isLoading = false,
  isError = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  aggregateOnly = false,
  compact = false,
  showAllHref,
  onRetry,
  onLoadMore,
}: ActionSignalListProps) {
  const groups = groupActionSignalsByEntity(snapshot?.items ?? []);

  return (
    <section
      aria-labelledby="action-signal-heading"
      className="rounded-xl border border-border bg-card"
      data-action-signal-count={snapshot?.totals.totalCount}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2
            id="action-signal-heading"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <ListChecks className="h-4 w-4 text-primary" /> Antrean tindakan
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Prioritas deterministik dari kondisi quotation, bukan ranking AI.
          </p>
        </div>
        {snapshot ? (
          <div className="text-right text-xs text-muted-foreground">
            <p className="font-medium tabular-nums text-foreground">
              {snapshot.totals.totalCount} sinyal
            </p>
            {!aggregateOnly ? <p>{groups.length} quotation dimuat</p> : null}
            {snapshot.totals.snoozedCount > 0 ? (
              <p>{snapshot.totals.snoozedCount} sinyal ditunda</p>
            ) : null}
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <div
          className="space-y-3 p-4"
          role="status"
          aria-label="Memuat antrean tindakan"
        >
          <span className="sr-only">Memuat antrean tindakan…</span>
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : isError ? (
        <div role="alert" className="flex items-start gap-3 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-foreground">
              Antrean tindakan gagal dimuat
            </p>
            <p className="text-xs text-muted-foreground">
              Jumlah exception belum dapat dipastikan.
            </p>
            {onRetry ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
                onClick={onRetry}
              >
                Coba lagi
              </button>
            ) : null}
          </div>
        </div>
      ) : aggregateOnly && snapshot ? (
        <div className="p-4 text-sm" role="status">
          <p className="font-medium text-foreground">
            {snapshot.totals.totalCount} sinyal aktif
          </p>
          <p className="text-xs text-muted-foreground">
            Detail dibatasi untuk role Executive; aggregate perusahaan tetap
            tersedia.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={ListChecks}
          title="Tidak ada exception aktif"
          description="Tidak ada quotation yang memerlukan tindakan dari rule saat ini."
        />
      ) : (
        <>
          <ul className="divide-y divide-border" aria-label="Daftar exception">
            {groups.map((group) => (
              <li key={group.entityId} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {group.clientName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {group.quotationNumber ?? "Quotation"} · {group.stage} ·{" "}
                      {group.ownerName}
                    </p>
                    <p className="mt-1 text-xs font-medium tabular-nums text-foreground">
                      {group.totalValue === null
                        ? "Nilai belum tersedia"
                        : formatRupiahShort(group.totalValue)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 self-start">
                    <LogCommercialFollowUpDialog
                      item={{
                        id: group.entityId,
                        type: "Quotation",
                        description: group.quotationNumber ?? "Quotation",
                      }}
                      clientName={group.clientName}
                      fromActionSignal
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                        >
                          <PhoneCall className="mr-1 h-3.5 w-3.5" /> Catat
                          follow-up
                        </Button>
                      }
                    />
                    <Button asChild variant="outline" size="sm" className="h-8">
                      <a href={group.sourceHref}>
                        Buka quotation{" "}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {group.signals.map((signal) => (
                    <li
                      key={signal.ruleId}
                      className="rounded-md bg-muted/60 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          Prioritas {signal.priority}
                        </Badge>
                        <span className="font-medium text-foreground">
                          {RULE_LABELS[signal.ruleId]}
                        </span>
                        {signal.dataState === "data_insufficient" ? (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning"
                          >
                            Data belum cukup
                          </Badge>
                        ) : null}
                        {signal.latestFeedback ? (
                          <Badge variant="secondary">
                            {signal.latestFeedback === "relevant"
                              ? "Relevan"
                              : "Tidak relevan"}
                          </Badge>
                        ) : null}
                        <ActionSignalActionDialog
                          signal={signal}
                          clientName={group.clientName}
                        />
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {signal.reason}
                      </p>
                      {signal.feedbackReason ? (
                        <p className="mt-1 text-muted-foreground">
                          Feedback: {signal.feedbackReason}
                        </p>
                      ) : null}
                      {!compact && signal.dueDate ? (
                        <p className="mt-1 text-muted-foreground">
                          Tanggal prioritas {formatDateShort(signal.dueDate)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {hasNextPage || showAllHref ? (
            <div className="flex flex-wrap justify-center gap-2 border-t border-border p-3">
              {hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={onLoadMore}
                >
                  {isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
                </Button>
              ) : null}
              {showAllHref ? (
                <Button asChild variant="outline" size="sm">
                  <a href={showAllHref}>Lihat antrean lengkap</a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
