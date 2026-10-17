import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
} from "lucide-react";

import { RepeatOrderFeedbackDialog } from "@/components/repeat-orders/RepeatOrderFeedbackDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RepeatOrderCadenceItem } from "@/lib/data/repeat-order-cadence";
import { formatDateShort } from "@/lib/format";

function formatDays(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari`;
}

function StateBadge({ state }: { state: RepeatOrderCadenceItem["state"] }) {
  if (state === "overdue") {
    return <Badge variant="destructive">Terlambat</Badge>;
  }
  if (state === "data_insufficient") {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        Data belum cukup
      </Badge>
    );
  }
  return <Badge variant="secondary">Dalam cadence</Badge>;
}

export function RepeatOrderSummary({
  item,
  isLoading = false,
  isError = false,
  aggregateOnly = false,
  aggregateCandidateCount = 0,
  canMutate = false,
  showClientName = false,
}: {
  item?: RepeatOrderCadenceItem;
  isLoading?: boolean;
  isError?: boolean;
  aggregateOnly?: boolean;
  aggregateCandidateCount?: number;
  canMutate?: boolean;
  showClientName?: boolean;
}) {
  return (
    <Card data-repeat-order-state={item?.state ?? "unavailable"}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-primary" /> Cadence
              repeat-order
            </h2>
            {showClientName && item ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.clientName} · {item.ownerName}
              </p>
            ) : null}
          </div>
          {item ? <StateBadge state={item.state} /> : null}
        </div>

        {isLoading ? (
          <div
            className="mt-3 space-y-2"
            role="status"
            aria-label="Memuat cadence repeat-order"
          >
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <div
            className="mt-3 flex gap-2 text-xs text-destructive"
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Cadence repeat-order gagal dimuat.
          </div>
        ) : aggregateOnly ? (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            {aggregateCandidateCount} kandidat tersedia. Detail client dibatasi
            untuk role Executive.
          </p>
        ) : !item ? (
          <div
            className="mt-3 flex gap-2 text-xs text-muted-foreground"
            role="status"
          >
            <Database className="h-4 w-4 shrink-0" />
            Data belum cukup: belum ada order berbayar yang memenuhi aturan D05.
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-foreground">{item.reason}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Order terakhir</dt>
                <dd className="font-medium">
                  {item.lastOrderDate
                    ? formatDateShort(item.lastOrderDate)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sampel</dt>
                <dd className="font-medium">
                  {item.sampleCount} tanggal order
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Median interval</dt>
                <dd className="font-medium">
                  {formatDays(item.medianIntervalDays)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sejak order</dt>
                <dd className="font-medium">
                  {formatDays(item.daysSinceLastOrder)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ambang</dt>
                <dd className="font-medium">
                  {formatDays(item.overdueThresholdDays)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cakupan histori</dt>
                <dd className="font-medium">
                  {item.historyCoverage === "full_window" ? "Penuh" : "Parsial"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
              <span>Rule {item.ruleVersion}</span>
              {item.latestFeedback ? (
                <Badge variant="secondary">
                  {item.latestFeedback === "relevant"
                    ? "Relevan"
                    : "Tidak relevan"}
                </Badge>
              ) : null}
              {item.feedbackReason ? <span>{item.feedbackReason}</span> : null}
              {item.state === "overdue" && canMutate ? (
                <RepeatOrderFeedbackDialog item={item} />
              ) : null}
              {item.state === "on_cadence" ? (
                <CheckCircle2
                  className="ml-auto h-4 w-4 text-success"
                  aria-label="Dalam cadence"
                />
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
