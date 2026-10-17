import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  PhoneCall,
} from "lucide-react";

import { AddFollowUpDialog } from "@/components/clients/AddFollowUpDialog";
import { RepeatOrderSummary } from "@/components/repeat-orders/RepeatOrderSummary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  RepeatOrderCadenceItem,
  RepeatOrderSnapshot,
} from "@/lib/data/repeat-order-cadence";

type RepeatOrderSignalListProps = {
  totals?: RepeatOrderSnapshot["totals"];
  items?: RepeatOrderCadenceItem[];
  isLoading?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  aggregateOnly?: boolean;
  canMutate?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
};

export function RepeatOrderSignalList({
  totals,
  items = [],
  isLoading = false,
  isError = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  aggregateOnly = false,
  canMutate = false,
  onRetry,
  onLoadMore,
}: RepeatOrderSignalListProps) {
  return (
    <section
      aria-labelledby="repeat-order-signal-heading"
      className="rounded-xl border border-border bg-card"
      data-repeat-order-count={totals?.candidateCount}
      data-repeat-order-overdue-count={totals?.overdueCount}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2
            id="repeat-order-signal-heading"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <CalendarClock className="h-4 w-4 text-primary" /> Kesehatan
            repeat-order
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Heuristik D05 dari tanggal order sah; bukan prediksi churn.
          </p>
        </div>
        {totals ? (
          <div className="text-right text-xs text-muted-foreground">
            <p className="font-medium tabular-nums text-foreground">
              {totals.overdueCount} terlambat
            </p>
            <p>{totals.dataInsufficientCount} data belum cukup</p>
            <p>{totals.candidateCount} kandidat total</p>
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <div
          className="space-y-3 p-4"
          role="status"
          aria-label="Memuat sinyal repeat-order"
        >
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : isError ? (
        <div role="alert" className="flex items-start gap-3 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-foreground">
              Sinyal repeat-order gagal dimuat
            </p>
            <p className="text-xs text-muted-foreground">
              Jumlah dan alasan belum dapat dipastikan.
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
      ) : aggregateOnly && totals ? (
        <div className="p-4 text-sm" role="status">
          <p className="font-medium text-foreground">
            {totals.overdueCount} sinyal terlambat
          </p>
          <p className="text-xs text-muted-foreground">
            Detail client dibatasi untuk role Executive; aggregate perusahaan
            tetap tersedia.
          </p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={CalendarClock}
          title="Belum ada kandidat repeat-order"
          description="Belum ada order berbayar yang memenuhi scope rule D05."
        />
      ) : (
        <>
          <ul
            className="divide-y divide-border"
            aria-label="Daftar kesehatan repeat-order"
          >
            {items.map((item) => (
              <li key={item.clientId} className="p-4">
                <RepeatOrderSummary
                  item={item}
                  canMutate={canMutate}
                  showClientName
                />
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  {canMutate && item.state === "overdue" ? (
                    <AddFollowUpDialog
                      clientId={item.clientId}
                      clientName={item.clientName}
                      ownerId={item.ownerId}
                      preferExistingTask
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
                  ) : null}
                  <Button asChild variant="outline" size="sm" className="h-8">
                    <a href={item.sourceHref}>
                      Buka client <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {hasNextPage ? (
            <div className="flex justify-center border-t border-border p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={onLoadMore}
              >
                {isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
