import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  ExternalLink,
  FileText,
  History,
  Package,
  User2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { cn, getErrorMessage } from "@/lib/utils";
import { invalidateCommercialStageQueries } from "@/lib/query-invalidation";
import { formatRupiahShort, formatDateShort } from "@/lib/format";
import { useRole } from "@/context/role-context-core";
import {
  toLocalIsoDate,
  type CommercialItem,
  type Client,
  type ClientStatus,
  type QuotationLostReason,
} from "@/lib/domain";
import { updateClientStatus } from "@/lib/data/clients";
import { describeCommercialItemChanges } from "@/lib/data/commercial-items";
import { transitionCommercialStage } from "@/lib/data/commercial-documents";
import { listSalesOrders } from "@/lib/data/sales-orders";
import { listTasks } from "@/lib/data/tasks";
import { activeCommercialTasks } from "@/lib/data/task-relations";
import {
  listFollowUpsForCommercialDocument,
  recordCommercialFollowUp,
} from "@/lib/data/follow-ups";
import { buildExplicitFollowUpCommand } from "@/lib/follow-up-command";
import { COMMERCIAL_STAGES } from "@/lib/data/commercial-stages";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  activeLostReasonPatch,
  isLostReasonTracked,
  QUOTATION_LOST_REASONS,
  validateQuotationLostReason,
} from "@/lib/data/quotation-lost-reasons";
import {
  getCurrentActorId,
  listClientStatusHistory,
  listCommercialItemHistory,
  logActivity,
} from "@/lib/data/activity-log";

const CLIENT_STATUSES: ClientStatus[] = [
  "Prospect",
  "Active Customer",
  "Repeat Order",
  "Dormant",
  "Lost",
];

const STAGES = COMMERCIAL_STAGES;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: CommercialItem | null;
  client: Client | null;
  currentNext?: string;
  allItems: CommercialItem[];
  profilesById: Record<string, { name: string }>;
  // Mirrors the same pipeline drag-and-drop hand-off in the board route:
  // a Quotation moved to Closed Won from this drawer should also open the
  // Create Sales Order flow, pre-filled and locked to this Quotation.
  onWonWithoutSo?: (item: CommercialItem) => void;
};

const FIELD_LABEL: Record<string, string> = {
  stage: "Stage",
  nextActionDate: "Next action",
  ownerId: "Owner",
  lostReason: "Alasan closed lost",
  lostReasonDetail: "Detail alasan",
};

export function PipelineCardDrawer({
  open,
  onOpenChange,
  item,
  allItems,
  profilesById,
  client,
  currentNext,
  onWonWithoutSo,
}: Props) {
  const { role, authReady } = useRole();
  const queryClient = useQueryClient();

  const { data: commercialHistory = [] } = useQuery({
    queryKey: ["activity-log", "commercial-item", item?.id ?? ""],
    queryFn: () => listCommercialItemHistory(item?.id ?? ""),
    enabled: authReady && Boolean(item),
  });
  const { data: statusHistory = [] } = useQuery({
    queryKey: ["activity-log", "client-status", client?.id ?? ""],
    queryFn: () => listClientStatusHistory(client?.id ?? ""),
    enabled: authReady && Boolean(client),
  });
  const { data: allSalesOrders = [] } = useQuery({
    queryKey: ["sales-orders", "all"],
    queryFn: listSalesOrders,
    enabled: authReady,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });
  const { data: followUps = [] } = useQuery({
    queryKey: ["follow-ups", "commercial-document", item?.id ?? ""],
    queryFn: () => listFollowUpsForCommercialDocument(item?.id ?? ""),
    enabled: authReady && Boolean(item),
  });

  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentActorId,
    enabled: authReady,
  });

  // Manager/super_admin can edit any card; sales can only edit cards they
  // own — mirrors the ownership boundary RLS already enforces server-side.
  const canEdit =
    role === "manager" || role === "super_admin"
      ? true
      : role === "sales" && item?.ownerId === currentUserId;

  // Current values are already real (no override layer to merge anymore).
  const currentStage = item?.stage ?? "";
  const currentOwnerId = item?.ownerId ?? "";
  const currentStatus = client?.status ?? ("Prospect" as ClientStatus);

  const [stage, setStage] = useState(currentStage);
  const [nextDate, setNextDate] = useState(currentNext ?? "");
  const [nextAction, setNextAction] = useState("");
  const [taskMode, setTaskMode] = useState<"existing_task" | "create_task">(
    "create_task",
  );
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState<ClientStatus>(currentStatus);
  const [lostReason, setLostReason] = useState<QuotationLostReason | "">(
    item?.lostReason ?? "",
  );
  const [lostReasonDetail, setLostReasonDetail] = useState(
    item?.lostReasonDetail ?? "",
  );
  const [lostReasonDialogOpen, setLostReasonDialogOpen] = useState(false);

  // Reset form state when a different item opens.
  useEffect(() => {
    if (!open || !item || !client) return;
    setStage(currentStage);
    setNextDate(currentNext ?? "");
    setNextAction(`Follow-up stage ${currentStage}`);
    const activeTasks = activeCommercialTasks(tasks, item.id);
    setTaskMode(activeTasks.length > 0 ? "existing_task" : "create_task");
    setTaskId(activeTasks[0]?.id ?? "");
    setStatus(currentStatus);
    setLostReason(item.lostReason ?? "");
    setLostReasonDetail(item.lostReasonDetail ?? "");
    setLostReasonDialogOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, client?.id]);

  const linkedQuotations = useMemo(() => {
    if (!client || !item) return [];
    return allItems.filter(
      (c) => c.clientId === client.id && c.type === "Quotation",
    );
  }, [client, item, allItems]);

  const linkedOrders = useMemo(() => {
    if (!client) return [];
    return allSalesOrders.filter((o) => o.clientId === client.id);
  }, [client, allSalesOrders]);

  // Merged history timeline: commercial-item changes + client status changes
  // + persisted follow_up_logs for this commercial document.
  const timeline = useMemo(() => {
    type Ev = {
      at: string;
      kind: "item" | "status" | "followup";
      title: string;
      detail: string;
      by?: string;
    };
    const evs: Ev[] = [];
    for (const h of commercialHistory) {
      evs.push({
        at: h.at,
        kind: "item",
        title: h.title,
        detail: h.detail ?? "",
        by: h.actorName,
      });
    }
    for (const a of statusHistory) {
      evs.push({
        at: a.at,
        kind: "status",
        title: "Status klien diubah",
        detail: `${a.from} → ${a.to}${a.note ? ` — ${a.note}` : ""}`,
        by: a.byUserName,
      });
    }
    for (const f of followUps) {
      evs.push({
        at: f.createdAt,
        kind: "followup",
        title: `Follow-up (${f.method})`,
        detail: f.notes ?? "",
        by: profilesById[f.ownerId]?.name,
      });
    }
    return evs.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [commercialHistory, statusHistory, followUps, profilesById]);

  if (!item || !client) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg" />
      </Sheet>
    );
  }

  const dirty =
    stage !== currentStage ||
    (nextDate || "") !== (currentNext ?? "") ||
    (isLostReasonTracked(item.type, stage) &&
      ((lostReason || null) !== (item.lostReason ?? null) ||
        (lostReasonDetail.trim() || null) !== (item.lostReasonDetail ?? null)));
  const statusDirty = status !== currentStatus;
  const reasonPatch = activeLostReasonPatch({
    type: item.type,
    stage,
    lostReason: lostReason || null,
    lostReasonDetail,
  });
  const collectsLostReason = isLostReasonTracked(item.type, stage);
  const supportsLostReasonFields = item.type === "Quotation";

  function handleStageChange(nextStage: string) {
    if (!item) return;
    setStage(nextStage);
    if (isLostReasonTracked(item.type, nextStage)) {
      setLostReason(item.lostReason ?? "");
      setLostReasonDetail(item.lostReasonDetail ?? "");
      setLostReasonDialogOpen(true);
    }
  }

  async function saveChanges() {
    if (!item || !client) return;
    const changes: { field: string; from?: string; to?: string }[] = [];
    if (stage !== currentStage)
      changes.push({ field: "stage", from: currentStage, to: stage });
    const lostReasonError = validateQuotationLostReason({
      type: item.type,
      stage,
      lostReason: lostReason || null,
      lostReasonDetail,
    });
    if (lostReasonError) {
      setLostReasonDialogOpen(true);
      toast.error(lostReasonError);
      return;
    }
    if (
      supportsLostReasonFields &&
      reasonPatch.lostReason !== (item.lostReason ?? null)
    ) {
      changes.push({
        field: "lostReason",
        from: item.lostReason,
        to: reasonPatch.lostReason ?? undefined,
      });
    }
    if (
      supportsLostReasonFields &&
      reasonPatch.lostReasonDetail !== (item.lostReasonDetail ?? null)
    ) {
      changes.push({
        field: "lostReasonDetail",
        from: item.lostReasonDetail,
        to: reasonPatch.lostReasonDetail ?? undefined,
      });
    }
    const nd = nextDate || undefined;
    const cn = currentNext || undefined;
    if (nd !== cn) changes.push({ field: "nextActionDate", from: cn, to: nd });

    if (changes.length === 0) return;
    try {
      if (!nd) {
        throw new Error("Tanggal next action wajib untuk progress Task");
      }
      const command = buildExplicitFollowUpCommand(
        taskMode === "existing_task"
          ? { mode: "existing_task", taskId }
          : {
              mode: "create_task",
              createTaskTitle: `Follow-up · ${item.type} — ${client.name}`,
              taskDueDate: nd,
            },
        {
          nextAction,
          nextActionDate: nd,
          note: describeCommercialItemChanges(changes),
          method: "Phone",
          result: "Progress Update",
          fuDate: toLocalIsoDate(new Date()),
        },
      );
      if (stage !== currentStage) {
        await transitionCommercialStage({
          commercialDocumentId: item.id,
          expectedFromStage: currentStage,
          toStage: stage,
          lostReason: supportsLostReasonFields ? reasonPatch.lostReason : null,
          lostReasonDetail: supportsLostReasonFields
            ? reasonPatch.lostReasonDetail
            : null,
          ...command,
        });
      } else {
        await recordCommercialFollowUp({
          commercialDocumentId: item.id,
          ...command,
        });
      }
      await invalidateCommercialStageQueries(queryClient);
      toast.success("Pipeline card diperbarui", {
        description: changes
          .map((c) => FIELD_LABEL[c.field] ?? c.field)
          .join(", "),
      });
      if (stage === "Closed Won" && item.type === "Quotation") {
        onWonWithoutSo?.(item);
      }
    } catch (error) {
      toast.error("Gagal menyimpan perubahan", {
        description: getErrorMessage(error),
      });
    }
  }

  async function saveStatus() {
    if (!client || status === currentStatus) return;
    try {
      const fromStatus = client.status;
      await updateClientStatus(client.id, status);
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "client_status_change",
          ownerId: client.ownerId,
          actorId,
          clientId: client.id,
          title: `Status ${client.name} diubah ke ${status}`,
          detail: `${fromStatus} → ${status}`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success(`Status ${client.name} → ${status}`);
    } catch (error) {
      toast.error("Gagal mengubah status", {
        description: getErrorMessage(error),
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="px-1.5 py-0 text-[10px] font-normal"
            >
              {item.type}
            </Badge>
            <StatusBadge status={currentStatus} />
          </div>
          <SheetTitle className="pr-6 text-left text-base leading-snug">
            {client.name}
          </SheetTitle>
          <SheetDescription className="text-left text-xs">
            {item.description} ·{" "}
            <span className="tabular-nums font-medium text-foreground">
              {formatRupiahShort(item.estimatedValue)}
            </span>
          </SheetDescription>
          <div className="pt-1">
            <Link
              to="/clients/$clientId"
              params={{ clientId: client.id }}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Buka profil klien <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </SheetHeader>

        {/* Edit section */}
        <section className="mt-5 space-y-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Update cepat
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Stage</Label>
              <Select
                value={stage}
                onValueChange={handleStageChange}
                disabled={!canEdit}
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  data-testid="pipeline-drawer-stage-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Owner</Label>
              {/* Quotation ownership is read-only in this drawer. */}
              <div className="flex h-8 items-center rounded-md border bg-muted px-2.5 text-xs text-muted-foreground">
                {profilesById[currentOwnerId]?.name ?? "-"}
              </div>
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label className="text-[11px]">Next action date</Label>
              <Input
                type="date"
                value={nextDate}
                disabled={!canEdit}
                onChange={(e) => setNextDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label className="text-[11px]">Next action</Label>
              <Input
                value={nextAction}
                disabled={!canEdit}
                onChange={(e) => setNextAction(e.target.value)}
                className="h-8 text-xs"
                placeholder="cth. Follow-up hasil revisi quotation"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-[11px]">Task yang diprogress</Label>
              <Select
                value={taskMode}
                onValueChange={(value) =>
                  setTaskMode(value as "existing_task" | "create_task")
                }
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_task">Buat Task baru</SelectItem>
                  <SelectItem
                    value="existing_task"
                    disabled={
                      activeCommercialTasks(tasks, item.id).length === 0
                    }
                  >
                    Progress Task existing
                  </SelectItem>
                </SelectContent>
              </Select>
              {taskMode === "existing_task" && (
                <Select
                  value={taskId}
                  onValueChange={setTaskId}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Pilih Task aktif" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCommercialTasks(tasks, item.id).map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title} · {task.dueDate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {collectsLostReason && (
            <div className="rounded-md border bg-background px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {lostReason || "Alasan closed lost belum diisi"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {lostReasonDetail || "Detail alasan opsional"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  disabled={!canEdit}
                  onClick={() => setLostReasonDialogOpen(true)}
                >
                  Isi alasan
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {dirty && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  setStage(currentStage);
                  setNextDate(currentNext ?? "");
                  setLostReason(item.lostReason ?? "");
                  setLostReasonDetail(item.lostReasonDetail ?? "");
                  setLostReasonDialogOpen(false);
                }}
              >
                Reset
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={!canEdit || !dirty}
              onClick={() => void saveChanges()}
            >
              Simpan perubahan
            </Button>
          </div>

          <div className="flex flex-col gap-1 border-t pt-3">
            <Label className="text-[11px]">Status klien</Label>
            <div className="flex gap-2">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ClientStatus)}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!canEdit || !statusDirty}
                onClick={() => void saveStatus()}
              >
                Terapkan
              </Button>
            </div>
          </div>
        </section>

        <Dialog
          open={lostReasonDialogOpen}
          onOpenChange={setLostReasonDialogOpen}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Alasan closed lost</DialogTitle>
              <DialogDescription>
                Pilih alasan sebelum menyimpan stage Closed Lost.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="drawer-lost-reason">Alasan</Label>
                <Select
                  value={lostReason}
                  onValueChange={(value) =>
                    setLostReason(value as QuotationLostReason)
                  }
                >
                  <SelectTrigger
                    id="drawer-lost-reason"
                    data-testid="pipeline-drawer-lost-reason-select"
                  >
                    <SelectValue placeholder="Pilih alasan closed lost" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTATION_LOST_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="drawer-lost-reason-detail">
                  Detail alasan
                  {lostReason === "Lainnya" ? " (wajib)" : " (opsional)"}
                </Label>
                <Textarea
                  id="drawer-lost-reason-detail"
                  value={lostReasonDetail}
                  onChange={(event) => setLostReasonDetail(event.target.value)}
                  placeholder={
                    lostReason === "Lainnya"
                      ? "Jelaskan alasan lainnya"
                      : "Tambahkan konteks bila diperlukan"
                  }
                  className="min-h-24"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (!item.lostReason) {
                    setStage(currentStage);
                    setLostReason("");
                    setLostReasonDetail("");
                  }
                  setLostReasonDialogOpen(false);
                }}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const error = validateQuotationLostReason({
                    type: item.type,
                    stage,
                    lostReason: lostReason || null,
                    lostReasonDetail,
                  });
                  if (error) {
                    toast.error(error);
                    return;
                  }
                  setLostReasonDialogOpen(false);
                }}
              >
                Simpan alasan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Linked documents */}
        <section className="mt-5 space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Dokumen terhubung
          </p>
          <DocGroup
            icon={FileText}
            label="Quotations"
            items={linkedQuotations.map((q) => ({
              key: q.id,
              primary: q.description,
              secondary: `${q.stage} · ${formatDateShort(q.updatedAt)}`,
              value: formatRupiahShort(q.estimatedValue),
            }))}
          />
          <DocGroup
            icon={Package}
            label="Sales orders"
            items={linkedOrders.map((o) => ({
              key: o.id,
              primary: o.soNumber,
              secondary: `${o.source} · ${formatDateShort(o.date)}`,
              value: o.value !== null ? formatRupiahShort(o.value) : "FOC",
            }))}
          />
        </section>

        {/* History timeline */}
        <section className="mt-5 space-y-2 pb-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Riwayat
          </p>
          {timeline.length === 0 ? (
            <div className="rounded-md border border-dashed py-4 text-center text-[11px] text-muted-foreground">
              Belum ada riwayat perubahan atau follow-up.
            </div>
          ) : (
            <ol className="relative border-l pl-4">
              {timeline.map((ev, i) => (
                <li key={i} className="mb-3 last:mb-0">
                  <span
                    className={cn(
                      "absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-background",
                      ev.kind === "item" && "bg-primary",
                      ev.kind === "status" && "bg-amber-500",
                      ev.kind === "followup" && "bg-emerald-500",
                    )}
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">
                        {ev.title}
                      </p>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {formatDateShort(ev.at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {ev.detail}
                    </p>
                    {ev.by && (
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        <User2 className="h-2.5 w-2.5" /> {ev.by}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Meta footer */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <User2 className="h-3 w-3" />{" "}
            {profilesById[currentOwnerId]?.name ?? "-"}
          </span>
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />{" "}
            {nextDate ? formatDateShort(nextDate) : "Tanpa next action"}
          </span>
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> {stage}
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DocGroup({
  icon: Icon,
  label,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: { key: string; primary: string; secondary: string; value: string }[];
}) {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
          Belum ada.
        </p>
      ) : (
        <ul className="divide-y">
          {items.slice(0, 6).map((it) => (
            <li
              key={it.key}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-foreground">{it.primary}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {it.secondary}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
                {it.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
