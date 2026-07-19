import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  GitBranch,
  Filter,
  User2,
  CalendarClock,
  GripVertical,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { PipelineCardDrawer } from "@/components/pipeline/PipelineCardDrawer";
import { PipelineAnalytics } from "@/components/pipeline/PipelineAnalytics";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/context/role-context";
import { NOW, type Role } from "@/lib/domain";
import {
  listCommercialItems,
  updateCommercialItem,
} from "@/lib/data/commercial-items";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import { listTasks } from "@/lib/data/tasks";
import { formatRupiahShort, formatDateShort, daysBetween } from "@/lib/format";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";

export const Route = createFileRoute("/_app/pipeline")({
  head: () => ({
    meta: [{ title: "Commercial Pipeline · DSM Sales Execution" }],
  }),
  component: PipelinePage,
});

const STAGES = [
  "RFQ Received",
  "Quotation in Progress",
  "Quotation Sent",
  "Waiting Client PO",
  "PO Received",
  "Prototype in Progress",
  "Closed Lost",
] as const;

type Stage = (typeof STAGES)[number];
type NextWindow = "all" | "overdue" | "today" | "week" | "none";

function addDaysISO(base: string | Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function PipelinePage() {
  const { role, hydrated } = useRole();

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <GitBranch className="h-5 w-5 text-primary" />
              Commercial Pipeline
            </h1>
            <p className="text-sm text-muted-foreground">Memuat pipeline…</p>
          </div>
        </div>
      </div>
    );
  }

  return <PipelineBoard role={role} />;
}

function PipelineBoard({ role }: { role: Role }) {
  const { authReady } = useRole();
  const queryClient = useQueryClient();
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });

  const [owner, setOwner] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [nextWindow, setNextWindow] = useState<NextWindow>("all");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    itemId: string;
    fromStage: Stage;
    toStage: Stage;
    clientName: string;
    currentNext?: string;
  } | null>(null);
  const [nextDateInput, setNextDateInput] = useState<string>("");
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);

  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: ownerById = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && role !== "sales",
  });
  const clientById = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);

  // For each commercial item, compute the earliest upcoming (or most-overdue) task date.
  // `items` is the real commercial_items data, so it.nextActionDate is
  // already authoritative — only fall back to related tasks if it's unset.
  const nextByItem = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const it of items) {
      if (it.nextActionDate) {
        map.set(it.id, it.nextActionDate);
        continue;
      }
      const related = tasks
        .filter((t) => t.clientId === it.clientId && t.status !== "Done")
        .map((t) => t.dueDate)
        .sort();
      map.set(it.id, related[0]);
    }
    return map;
  }, [items, tasks]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const client = clientById[it.clientId];
      if (!client) return false;
      if (owner !== "all" && it.ownerId !== owner) return false;
      if (status !== "all" && client.status !== status) return false;
      const next = nextByItem.get(it.id);
      if (nextWindow !== "all") {
        if (nextWindow === "none") {
          if (next) return false;
        } else {
          if (!next) return false;
          const d = daysBetween(NOW, next);
          if (nextWindow === "overdue" && d >= 0) return false;
          if (nextWindow === "today" && d !== 0) return false;
          if (nextWindow === "week" && (d < 0 || d > 7)) return false;
        }
      }
      return true;
    });
  }, [items, clientById, owner, status, nextWindow, nextByItem]);

  const grouped = useMemo(() => {
    const g = new Map<Stage, typeof items>();
    for (const s of STAGES) g.set(s, []);
    for (const it of filtered) {
      const key = (STAGES as readonly string[]).includes(it.stage)
        ? (it.stage as Stage)
        : "RFQ Received";
      g.get(key)!.push(it);
    }
    return g;
  }, [filtered]);

  const totalValue = filtered.reduce((s, it) => s + it.estimatedValue, 0);
  const activeFilters =
    (owner !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (nextWindow !== "all" ? 1 : 0);

  const canDrag = role !== "executive";

  function handleDrop(stage: Stage) {
    setDragOverStage(null);
    if (!draggingId) return;
    const item = items.find((i) => i.id === draggingId);
    setDraggingId(null);
    if (!item) return;
    const fromStage = item.stage as Stage;
    if (fromStage === stage) return;
    const client = clientById[item.clientId];
    const currentNext = nextByItem.get(item.id);
    setNextDateInput(currentNext ?? addDaysISO(NOW, 3));
    setPendingMove({
      itemId: item.id,
      fromStage,
      toStage: stage,
      clientName: client?.name ?? "-",
      currentNext,
    });
  }

  async function confirmMove() {
    if (!pendingMove) return;
    const item = items.find((i) => i.id === pendingMove.itemId);
    if (!item) return;
    try {
      await updateCommercialItem(pendingMove.itemId, {
        stage: pendingMove.toStage,
        nextActionDate: nextDateInput || undefined,
      });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "commercial_item_stage_change",
          ownerId: item.ownerId,
          actorId,
          clientId: item.clientId,
          commercialItemId: item.id,
          title: `${item.description} diperbarui`,
          detail: `stage: ${pendingMove.fromStage} → ${pendingMove.toStage}`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success(`${pendingMove.clientName} → ${pendingMove.toStage}`, {
        description: nextDateInput
          ? `Next action ${formatDateShort(nextDateInput)}`
          : "Tanpa next action",
      });
    } catch (error) {
      toast.error("Gagal memindahkan pipeline card", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
    setPendingMove(null);
  }

  if (!authReady || itemsLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Loading pipeline…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <GitBranch className="h-5 w-5 text-primary" />
            Commercial Pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} item · Total estimasi{" "}
            {formatRupiahShort(totalValue)}
            {canDrag && (
              <span className="ml-2 hidden md:inline text-muted-foreground/70">
                · Drag kartu untuk pindah stage
              </span>
            )}
          </p>
        </div>
        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOwner("all");
              setStatus("all");
              setNextWindow("all");
            }}
          >
            Reset filter ({activeFilters})
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
        <span className="flex items-center gap-1 pl-1 pr-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>

        {role !== "sales" && (
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <User2 className="h-3.5 w-3.5" />
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua sales</SelectItem>
              {salesTeam.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="Client status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="Prospect">Prospect</SelectItem>
            <SelectItem value="Active Customer">Active Customer</SelectItem>
            <SelectItem value="Repeat Order">Repeat Order</SelectItem>
            <SelectItem value="Dormant">Dormant</SelectItem>
            <SelectItem value="Lost">Lost</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={nextWindow}
          onValueChange={(v) => setNextWindow(v as NextWindow)}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <CalendarClock className="h-3.5 w-3.5" />
            <SelectValue placeholder="Next action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua next action</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Hari ini</SelectItem>
            <SelectItem value="week">7 hari ke depan</SelectItem>
            <SelectItem value="none">Tanpa next action</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Analytics */}
      <PipelineAnalytics
        items={filtered}
        showOwners={role !== "sales"}
        ownerById={ownerById}
      />

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGES.map((stage) => {
          const col = grouped.get(stage) ?? [];
          const sum = col.reduce((s, it) => s + it.estimatedValue, 0);
          const isDropTarget = dragOverStage === stage && draggingId !== null;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (!canDrag || !draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverStage !== stage) setDragOverStage(stage);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragOverStage === stage) setDragOverStage(null);
              }}
              onDrop={(e) => {
                if (!canDrag) return;
                e.preventDefault();
                handleDrop(stage);
              }}
              className={cn(
                "flex w-[280px] shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
                isDropTarget &&
                  "border-primary bg-primary-soft/60 ring-2 ring-primary/30",
              )}
            >
              <div className="flex items-center justify-between border-b bg-card px-3 py-2 rounded-t-lg">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
                    {stage}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {col.length} · {formatRupiahShort(sum)}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
                    stage === "Closed Lost"
                      ? "bg-zinc-200 text-zinc-700"
                      : "bg-primary-soft text-primary",
                  )}
                >
                  {col.length}
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
                    return (
                      <div
                        key={it.id}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          setDraggingId(it.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", it.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => setDrawerItemId(it.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDrawerItemId(it.id);
                          }
                        }}
                        className={cn(
                          "group relative flex flex-col gap-1.5 rounded-md border bg-card p-2.5 pl-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md",
                          canDrag && "cursor-grab active:cursor-grabbing",
                          !canDrag && "cursor-pointer",
                          isDragging && "opacity-40",
                        )}
                      >
                        {canDrag && (
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
                                overdue && "text-rose-600 font-medium",
                                today && "text-amber-700 font-medium",
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
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={pendingMove !== null}
        onOpenChange={(v) => {
          if (!v) setPendingMove(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pindahkan pipeline stage</DialogTitle>
            <DialogDescription>
              Update stage dan next action untuk{" "}
              <span className="font-medium text-foreground">
                {pendingMove?.clientName}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {pendingMove && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs">
                <span className="rounded-md border bg-background px-2 py-1 font-medium">
                  {pendingMove.fromStage}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="rounded-md border border-primary/40 bg-primary-soft px-2 py-1 font-medium text-primary">
                  {pendingMove.toStage}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="next-action-date" className="text-xs">
                  Next action date
                </Label>
                <Input
                  id="next-action-date"
                  type="date"
                  value={nextDateInput}
                  onChange={(e) => setNextDateInput(e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: "Hari ini", days: 0 },
                    { label: "+1 hari", days: 1 },
                    { label: "+3 hari", days: 3 },
                    { label: "+7 hari", days: 7 },
                  ].map((p) => (
                    <Button
                      key={p.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setNextDateInput(addDaysISO(NOW, p.days))}
                    >
                      {p.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setNextDateInput("")}
                  >
                    Kosongkan
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingMove(null)}>
              Batal
            </Button>
            <Button onClick={() => void confirmMove()}>Konfirmasi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PipelineCardDrawer
        open={drawerItemId !== null}
        onOpenChange={(v) => {
          if (!v) setDrawerItemId(null);
        }}
        item={
          drawerItemId
            ? (items.find((i) => i.id === drawerItemId) ?? null)
            : null
        }
        client={
          drawerItemId
            ? (clientById[
                items.find((i) => i.id === drawerItemId)?.clientId ?? ""
              ] ?? null)
            : null
        }
        currentNext={drawerItemId ? nextByItem.get(drawerItemId) : undefined}
        allItems={items}
        profilesById={ownerById}
        salesTeam={salesTeam}
      />
    </div>
  );
}
