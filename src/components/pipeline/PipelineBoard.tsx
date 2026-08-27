import { ChevronDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { cn } from "@/lib/utils";
import { NOW, type Client, type CommercialItem } from "@/lib/domain";
import type { CommercialStage } from "@/lib/data/commercial-stages";
import type { OwnerLookup } from "@/lib/data/clients";
import { formatRupiahShort, formatDateShort, daysBetween } from "@/lib/format";

export type PipelineColumnData = {
  stage: CommercialStage;
  items: CommercialItem[];
  sum: number;
  hasMore: boolean;
  isFetching: boolean;
};

type Props = {
  columns: PipelineColumnData[];
  canDrag: boolean;
  canMoveItem: (item: CommercialItem) => boolean;
  draggingId: string | null;
  dragOverStage: CommercialStage | null;
  onDragOverStage: (stage: CommercialStage | null) => void;
  onDraggingChange: (id: string | null) => void;
  clientById: Record<string, Client>;
  ownerById: OwnerLookup;
  nextByItem: Map<string, string | undefined>;
  onDrop: (stage: CommercialStage) => void;
  onLoadMore: (stage: CommercialStage) => void;
  onCardClick: (itemId: string) => void;
  // Derived live, not stored: Closed Won Quotations with no linked Sales
  // Order yet.
  pendingSoItemIds: Set<string>;
  onCreateSoForItem: (itemId: string) => void;
};

export function PipelineBoard({
  columns,
  canDrag,
  canMoveItem,
  draggingId,
  dragOverStage,
  onDragOverStage,
  onDraggingChange,
  clientById,
  ownerById,
  nextByItem,
  onDrop,
  onLoadMore,
  onCardClick,
  pendingSoItemIds,
  onCreateSoForItem,
}: Props) {
  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => {
          const { stage, items: col, sum, hasMore, isFetching } = column;
          const isDropTarget = dragOverStage === stage && draggingId !== null;
          const tone = stageTone(stage);
          return (
            <div
              key={stage}
              data-testid="pipeline-column"
              data-stage={stage}
              onDragOver={(e) => {
                if (!canDrag || !draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverStage !== stage) onDragOverStage(stage);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragOverStage === stage) onDragOverStage(null);
              }}
              onDrop={(e) => {
                if (!canDrag) return;
                e.preventDefault();
                onDrop(stage);
              }}
              className={cn(
                "flex w-[280px] shrink-0 flex-col overflow-hidden rounded-lg border bg-muted/30 transition-colors",
                isDropTarget &&
                  "border-primary bg-primary-soft/60 ring-2 ring-primary/30",
              )}
            >
              <div className={cn("h-1 w-full", tone.rail)} />
              <div className="flex items-center justify-between border-b bg-card px-3 py-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-xs font-semibold uppercase tracking-wide",
                      tone.text,
                    )}
                  >
                    {stage}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {col.length}
                    {hasMore ? "+" : ""} · {formatRupiahShort(sum)}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
                    tone.count,
                  )}
                >
                  {col.length}
                  {hasMore ? "+" : ""}
                </span>
              </div>

              <div className="flex flex-col gap-2 p-2 min-h-[80px]">
                {col.length === 0 ? (
                  <div
                    className={cn(
                      "rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground",
                      isDropTarget && "border-primary text-primary",
                    )}
                  >
                    {isDropTarget ? "Lepas di sini" : "Kosong"}
                  </div>
                ) : (
                  col.map((it) => {
                    const client = clientById[it.clientId];
                    const ownerName = ownerById[it.ownerId]?.name ?? "-";
                    const next = nextByItem.get(it.id);
                    const nextDays = next ? daysBetween(NOW, next) : null;
                    const overdue = nextDays !== null && nextDays < 0;
                    const today = nextDays === 0;
                    const isDragging = draggingId === it.id;
                    const canMoveThis = canMoveItem(it);
                    return (
                      <div
                        key={it.id}
                        data-testid="pipeline-card"
                        data-commercial-document-id={it.id}
                        draggable={canMoveThis}
                        onDragStart={(e) => {
                          if (!canMoveThis) return;
                          onDraggingChange(it.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", it.id);
                        }}
                        onDragEnd={() => {
                          onDraggingChange(null);
                          onDragOverStage(null);
                        }}
                        onClick={() => onCardClick(it.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCardClick(it.id);
                          }
                        }}
                        className={cn(
                          "group relative flex flex-col gap-1.5 rounded-md border bg-card p-2.5 pl-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md",
                          "before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-border-strong",
                          tone.cardRail,
                          canMoveThis && "cursor-grab active:cursor-grabbing",
                          !canMoveThis && "cursor-pointer",
                          isDragging && "opacity-40",
                        )}
                      >
                        {canMoveThis && (
                          <GripVertical className="pointer-events-none absolute left-1 top-2.5 h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground" />
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                            {client?.name ?? "-"}
                          </p>
                          <Badge
                            variant="outline"
                            className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                          >
                            {it.type}
                          </Badge>
                        </div>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">
                          {it.description}
                        </p>
                        {pendingSoItemIds.has(it.id) && (
                          <div className="flex items-center justify-between gap-2 rounded-md border border-warning/35 bg-warning/10 px-2 py-1 text-[10px] text-warning">
                            <span className="font-medium">SO belum dibuat</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-warning hover:text-warning"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateSoForItem(it.id);
                              }}
                            >
                              Buat SO
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-[12px] font-semibold tabular-nums text-foreground">
                            {formatRupiahShort(it.estimatedValue)}
                          </span>
                          {client && <StatusBadge status={client.status} />}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate">{ownerName}</span>
                          {next ? (
                            <span
                              className={cn(
                                "tabular-nums",
                                overdue && "text-destructive font-medium",
                                today && "text-warning font-medium",
                              )}
                            >
                              {overdue
                                ? `overdue ${Math.abs(nextDays!)}h`
                                : today
                                  ? "hari ini"
                                  : formatDateShort(next)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/70">
                              no next action
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Load more button for stages with additional items */}
                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 w-full text-xs text-muted-foreground"
                    onClick={() => onLoadMore(stage)}
                    disabled={isFetching}
                  >
                    <ChevronDown className="mr-1 h-3 w-3" />
                    {isFetching ? "Memuat…" : "Muat lebih banyak"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

function stageTone(stage: CommercialStage) {
  if (stage === "Closed Won") {
    return {
      rail: "bg-success",
      text: "text-success",
      count: "bg-success/10 text-success",
      cardRail: "before:bg-success/70",
    };
  }
  if (stage === "Closed Lost") {
    return {
      rail: "bg-border-strong",
      text: "text-muted-foreground",
      count: "bg-muted text-muted-foreground",
      cardRail: "before:bg-border-strong",
    };
  }
  if (stage === "Commit" || stage === "Hot Prospect") {
    return {
      rail: "bg-warning",
      text: "text-foreground",
      count: "bg-warning/10 text-warning",
      cardRail: "before:bg-warning/70",
    };
  }
  return {
    rail: "bg-primary",
    text: "text-foreground",
    count: "bg-primary-soft text-primary",
    cardRail: "before:bg-primary/55",
  };
}
