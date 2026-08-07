import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { toast } from "sonner";
import { PipelineCardDrawer } from "@/components/pipeline/PipelineCardDrawer";
import { PipelineAnalytics } from "@/components/pipeline/PipelineAnalytics";
import { PipelineFilterBar } from "@/components/pipeline/PipelineFilterBar";
import type { PipelineNextWindow } from "@/components/pipeline/PipelineFilterBar";
import {
  PipelineBoard,
  type PipelineColumnData,
} from "@/components/pipeline/PipelineBoard";
import {
  PipelineStageMoveDialog,
  type PendingPipelineMove,
} from "@/components/pipeline/PipelineStageMoveDialog";
import { CreateSalesOrderDialog } from "@/components/clients/CreateRecordDialogs";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/context/role-context";
import {
  NOW,
  toLocalIsoDate,
  type QuotationLostReason,
  type Role,
} from "@/lib/domain";
import {
  listCommercialItems,
  toCommercialItem,
} from "@/lib/data/commercial-items";
import {
  listCommercialDocumentsPage,
  transitionCommercialStage,
  type CommercialDocumentPageFilters,
} from "@/lib/data/commercial-documents";
import { getPipelineMetrics } from "@/lib/data/pipeline-metrics";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import { listTasks } from "@/lib/data/tasks";
import { listSalesOrders } from "@/lib/data/sales-orders";
import { activeCommercialTasks } from "@/lib/data/task-relations";
import {
  COMMERCIAL_STAGES,
  type CommercialStage,
} from "@/lib/data/commercial-stages";
import { formatRupiahShort, formatDateShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { getCurrentActorId } from "@/lib/data/activity-log";
import { buildExplicitFollowUpCommand } from "@/lib/follow-up-command";
import {
  activeLostReasonPatch,
  isLostReasonTracked,
  validateQuotationLostReason,
} from "@/lib/data/quotation-lost-reasons";
import { getErrorMessage } from "@/lib/utils";
import { invalidateCommercialStageQueries } from "@/lib/query-invalidation";
import { listQueryKey } from "@/lib/pagination-contracts";

export const Route = createFileRoute("/_app/pipeline")({
  head: () => ({
    meta: [{ title: "Commercial Pipeline · DSM Sales Execution" }],
  }),
  component: PipelinePage,
});

const STAGES = COMMERCIAL_STAGES;

type Stage = (typeof STAGES)[number];

function addDaysISO(base: string | Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
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

  return <PipelineBoardPage role={role} />;
}

function PipelineBoardPage({ role }: { role: Role }) {
  const { authReady } = useRole();
  const queryClient = useQueryClient();

  const [owner, setOwner] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [nextWindow, setNextWindow] = useState<PipelineNextWindow>("all");

  // Per-stage cursors for "load more" pagination
  const [stageCursors, setStageCursors] = useState<
    Record<Stage, string | null>
  >({} as Record<Stage, string | null>);

  const filters = useMemo<CommercialDocumentPageFilters>(
    () => ({
      ownerId: owner !== "all" ? owner : undefined,
      clientStatus: status !== "all" ? status : undefined,
    }),
    [owner, status],
  );

  // Reset cursors when filters change
  useMemo(() => {
    setStageCursors({} as Record<Stage, string | null>);
  }, [filters]);

  // Per-stage paginated queries (6 columns, fetched in parallel)
  const stageQueries = useQueries({
    queries: STAGES.map((stage) => ({
      queryKey: listQueryKey("commercial-documents", "page", {
        filters: { ...filters, stage },
        page: { pageSize: 50, cursor: stageCursors[stage] ?? null },
      }),
      queryFn: () =>
        listCommercialDocumentsPage({
          filters: { ...filters, stage },
          page: { pageSize: 50, cursor: stageCursors[stage] ?? null },
        }),
      enabled: authReady,
    })),
  });

  // Aggregate metrics query (server-side totals, replaces client-side compute)
  const { data: metrics } = useQuery({
    queryKey: listQueryKey("commercial-documents", "aggregate", {
      filters,
    }),
    queryFn: () =>
      getPipelineMetrics({
        ownerId: filters.ownerId,
        clientStatus: filters.clientStatus as
          | import("@/lib/domain").ClientStatus
          | undefined,
      }),
    enabled: authReady,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });
  const { data: allSalesOrders = [] } = useQuery({
    queryKey: ["sales-orders", "all"],
    queryFn: () => listSalesOrders(),
    enabled: authReady,
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingPipelineMove | null>(
    null,
  );
  const [nextDateInput, setNextDateInput] = useState<string>("");
  const [nextActionInput, setNextActionInput] = useState<string>("");
  const [taskMode, setTaskMode] = useState<"existing_task" | "create_task">(
    "create_task",
  );
  const [taskIdInput, setTaskIdInput] = useState("");
  const [lostReason, setLostReason] = useState<QuotationLostReason | "">("");
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const [wonQuotationForSo, setWonQuotationForSo] = useState<{
    id: string;
    quotationNumber?: string;
    projectName?: string;
    clientId: string;
    clientName: string;
    ownerId: string;
  } | null>(null);

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

  // Flatten all loaded items across stages for lookups (drag source, drawer, etc.)
  const allLoadedItems = useMemo(() => {
    return stageQueries.flatMap((q) =>
      (q.data?.rows ?? []).map(toCommercialItem),
    );
  }, [stageQueries]);

  // For each commercial item, compute the earliest upcoming (or most-overdue) task date.
  // `items` is the real commercial_items data, so it.nextActionDate is
  // already authoritative — only fall back to related tasks if it's unset.
  const nextByItem = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const it of allLoadedItems) {
      if (it.nextActionDate) {
        map.set(it.id, it.nextActionDate);
        continue;
      }
      const related = activeCommercialTasks(tasks, it.id)
        .map((t) => t.dueDate)
        .sort();
      map.set(it.id, related[0]);
    }
    return map;
  }, [allLoadedItems, tasks]);

  // Per-stage column data for the board (rows/sum/hasMore/isFetching), keeps
  // PipelineBoard decoupled from the raw useQueries result shape.
  const stageColumns: PipelineColumnData[] = useMemo(
    () =>
      STAGES.map((stage, stageIndex) => {
        const query = stageQueries[stageIndex];
        const items = (query.data?.rows ?? []).map(toCommercialItem);
        const sum = items.reduce((s, it) => s + it.estimatedValue, 0);
        return {
          stage,
          items,
          sum,
          hasMore: query.data?.nextCursor !== null,
          isFetching: query.isFetching,
        };
      }),
    [stageQueries],
  );

  // Live derived flag, not a stored status: a Closed Won Quotation counts as
  // "SO belum dibuat" only while no Sales Order references it as source —
  // it resolves itself automatically once an SO is created through any path.
  const linkedQuotationIds = useMemo(
    () =>
      new Set(
        allSalesOrders
          .map((so) => so.sourceCommercialDocumentId)
          .filter((id): id is string => !!id),
      ),
    [allSalesOrders],
  );
  const pendingSoItemIds = useMemo(
    () =>
      new Set(
        allLoadedItems
          .filter(
            (it) =>
              it.stage === "Closed Won" &&
              it.type === "Quotation" &&
              !linkedQuotationIds.has(it.id),
          )
          .map((it) => it.id),
      ),
    [allLoadedItems, linkedQuotationIds],
  );

  function openCreateSoForItem(itemId: string) {
    const item = allLoadedItems.find((i) => i.id === itemId);
    if (!item) return;
    const client = clientById[item.clientId];
    setWonQuotationForSo({
      id: item.id,
      quotationNumber: item.quotationNumber,
      projectName: item.projectName,
      clientId: item.clientId,
      clientName: client?.name ?? "-",
      ownerId: item.ownerId,
    });
  }

  const activeFilters =
    (owner !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (nextWindow !== "all" ? 1 : 0);

  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentActorId,
    enabled: authReady,
  });
  const pendingMoveItem = pendingMove
    ? allLoadedItems.find((item) => item.id === pendingMove.itemId)
    : undefined;
  const collectsLostReason =
    pendingMove && pendingMoveItem
      ? isLostReasonTracked(pendingMoveItem.type, pendingMove.toStage)
      : false;

  // Manager/super_admin can move any card; sales can only move cards they
  // own — mirrors the ownership boundary RLS already enforces server-side
  // (see sales_orders_update policy), so this just avoids a confusing
  // silent-failure toast for a move the DB would reject anyway.
  function canMoveItem(item: { ownerId: string }) {
    if (role === "manager" || role === "super_admin") return true;
    if (role === "sales") return item.ownerId === currentUserId;
    return false;
  }

  const canDrag = role !== "executive";

  function loadMore(stage: Stage) {
    const query = stageQueries[STAGES.indexOf(stage)];
    if (query.data?.nextCursor) {
      setStageCursors((prev) => ({
        ...prev,
        [stage]: query.data.nextCursor,
      }));
    }
  }

  function handleDrop(stage: Stage) {
    setDragOverStage(null);
    if (!draggingId) return;
    const item = allLoadedItems.find((i) => i.id === draggingId);
    setDraggingId(null);
    if (!item) return;
    const fromStage = item.stage as Stage;
    if (fromStage === stage) return;
    const client = clientById[item.clientId];
    const currentNext = nextByItem.get(item.id);
    const activeTasks = activeCommercialTasks(tasks, item.id);
    setNextDateInput(currentNext ?? addDaysISO(NOW, 3));
    setNextActionInput(`Follow-up stage ${stage}`);
    setTaskMode(activeTasks.length > 0 ? "existing_task" : "create_task");
    setTaskIdInput(activeTasks[0]?.id ?? "");
    setLostReason("");
    setLostReasonDetail("");
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
    const item = allLoadedItems.find((i) => i.id === pendingMove.itemId);
    if (!item) return;
    const lostReasonError = validateQuotationLostReason({
      type: item.type,
      stage: pendingMove.toStage,
      lostReason: lostReason || null,
      lostReasonDetail,
    });
    if (lostReasonError) {
      toast.error(lostReasonError);
      return;
    }
    const reasonPatch = activeLostReasonPatch({
      type: item.type,
      stage: pendingMove.toStage,
      lostReason: lostReason || null,
      lostReasonDetail,
    });
    try {
      const command = buildExplicitFollowUpCommand(
        taskMode === "existing_task"
          ? { mode: "existing_task", taskId: taskIdInput }
          : {
              mode: "create_task",
              createTaskTitle: `Follow-up · ${item.type} — ${pendingMove.clientName}`,
              taskDueDate: nextDateInput,
            },
        {
          nextAction: nextActionInput,
          nextActionDate: nextDateInput,
          note: [
            `Stage ${pendingMove.fromStage} → ${pendingMove.toStage}`,
            isLostReasonTracked(item.type, pendingMove.toStage)
              ? `Alasan lost: ${reasonPatch.lostReason}${
                  reasonPatch.lostReasonDetail
                    ? ` — ${reasonPatch.lostReasonDetail}`
                    : ""
                }`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
          method: "Phone",
          result: "Progress Update",
          fuDate: toLocalIsoDate(NOW),
        },
      );
      await transitionCommercialStage({
        commercialDocumentId: item.id,
        expectedFromStage: pendingMove.fromStage,
        toStage: pendingMove.toStage,
        lostReason: isLostReasonTracked(item.type, pendingMove.toStage)
          ? reasonPatch.lostReason
          : null,
        lostReasonDetail: isLostReasonTracked(item.type, pendingMove.toStage)
          ? reasonPatch.lostReasonDetail
          : null,
        ...command,
      });
      await invalidateCommercialStageQueries(queryClient);
      toast.success(`${pendingMove.clientName} → ${pendingMove.toStage}`, {
        description: nextDateInput
          ? `Next action ${formatDateShort(nextDateInput)}`
          : "Tanpa next action",
      });
      if (pendingMove.toStage === "Closed Won" && item.type === "Quotation") {
        setWonQuotationForSo({
          id: item.id,
          quotationNumber: item.quotationNumber,
          projectName: item.projectName,
          clientId: item.clientId,
          clientName: pendingMove.clientName,
          ownerId: item.ownerId,
        });
      }
    } catch (error) {
      toast.error("Gagal memindahkan pipeline card", {
        description: getErrorMessage(error),
      });
    }
    setPendingMove(null);
  }

  const isLoading =
    !authReady || stageQueries.some((q) => q.isLoading) || !metrics;

  if (isLoading) {
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
            {metrics.totals.itemCount} item · Total estimasi{" "}
            {formatRupiahShort(metrics.totals.totalValue)}
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

      <PipelineFilterBar
        role={role}
        owner={owner}
        onOwnerChange={setOwner}
        status={status}
        onStatusChange={setStatus}
        nextWindow={nextWindow}
        onNextWindowChange={setNextWindow}
        salesTeam={salesTeam}
      />

      {/* Analytics */}
      <PipelineAnalytics
        metrics={metrics}
        showOwners={role !== "sales"}
        ownerById={ownerById}
      />

      {/* Board -- more stage columns than fit most viewports; the edge
          fade hints at the horizontal scroll so it doesn't look like the
          board simply ends at "Commit". */}
      <PipelineBoard
        columns={stageColumns}
        canDrag={canDrag}
        canMoveItem={canMoveItem}
        draggingId={draggingId}
        dragOverStage={dragOverStage}
        onDragOverStage={setDragOverStage}
        onDraggingChange={setDraggingId}
        clientById={clientById}
        ownerById={ownerById}
        nextByItem={nextByItem}
        onDrop={(stage: CommercialStage) => handleDrop(stage)}
        onLoadMore={(stage: CommercialStage) => loadMore(stage)}
        onCardClick={setDrawerItemId}
        pendingSoItemIds={pendingSoItemIds}
        onCreateSoForItem={openCreateSoForItem}
      />

      <PipelineStageMoveDialog
        pendingMove={pendingMove}
        pendingMoveItem={pendingMoveItem}
        onOpenChange={(v) => {
          if (!v) setPendingMove(null);
        }}
        tasks={tasks}
        nextActionInput={nextActionInput}
        onNextActionInputChange={setNextActionInput}
        nextDateInput={nextDateInput}
        onNextDateInputChange={setNextDateInput}
        taskMode={taskMode}
        onTaskModeChange={setTaskMode}
        taskIdInput={taskIdInput}
        onTaskIdInputChange={setTaskIdInput}
        collectsLostReason={collectsLostReason}
        lostReason={lostReason}
        onLostReasonChange={setLostReason}
        lostReasonDetail={lostReasonDetail}
        onLostReasonDetailChange={setLostReasonDetail}
        onCancel={() => setPendingMove(null)}
        onConfirm={() => void confirmMove()}
      />

      <CreateSalesOrderDialog
        open={wonQuotationForSo !== null}
        onOpenChange={(v) => {
          if (!v) setWonQuotationForSo(null);
        }}
        clientId={wonQuotationForSo?.clientId}
        clientName={wonQuotationForSo?.clientName}
        ownerId={wonQuotationForSo?.ownerId}
        sourceCommercialDocument={
          wonQuotationForSo
            ? {
                id: wonQuotationForSo.id,
                quotationNumber: wonQuotationForSo.quotationNumber,
                projectName: wonQuotationForSo.projectName,
              }
            : undefined
        }
        onCreated={() => {
          void queryClient.invalidateQueries({
            queryKey: ["sales-orders"],
          });
        }}
      />

      <PipelineCardDrawer
        open={drawerItemId !== null}
        onOpenChange={(v) => {
          if (!v) setDrawerItemId(null);
        }}
        item={
          drawerItemId
            ? (allLoadedItems.find((i) => i.id === drawerItemId) ?? null)
            : null
        }
        client={
          drawerItemId
            ? (clientById[
                allLoadedItems.find((i) => i.id === drawerItemId)?.clientId ??
                  ""
              ] ?? null)
            : null
        }
        currentNext={drawerItemId ? nextByItem.get(drawerItemId) : undefined}
        allItems={allLoadedItems}
        profilesById={ownerById}
        onWonWithoutSo={(item) => openCreateSoForItem(item.id)}
      />
    </div>
  );
}
