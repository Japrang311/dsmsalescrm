import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Pencil,
  Save,
  Undo2,
} from "lucide-react";

import { getErrorMessage } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/context/role-context";
import {
  toLocalIsoDate,
  type Task,
  type TaskCategory,
  type TaskWorkflowStatus,
} from "@/lib/domain";
import { listClients, listOwners } from "@/lib/data/clients";
import { listCommercialItems } from "@/lib/data/commercial-items";
import { updateTask } from "@/lib/data/tasks";
import { recordTaskProgress } from "@/lib/data/task-progress";
import {
  getCurrentActorId,
  listTaskTimeline,
  logActivity,
} from "@/lib/data/activity-log";
import { formatDateShort, formatRupiahShort } from "@/lib/format";

const METHODS = ["Phone", "Email", "WhatsApp", "Visit", "Meeting"] as const;
const PRIORITIES = ["High", "Normal", "Low"] as const;
const CATEGORIES: TaskCategory[] = [
  "Project/Opportunity Planning",
  "Client Meeting/Visit",
  "Follow-Up",
  "Quotation",
  "Sales Order",
  "Internal/Admin",
  "Other",
];
const WORKFLOW_STATUSES: TaskWorkflowStatus[] = [
  "Open",
  "In Progress",
  "Waiting External",
  "Done",
  "Cancelled",
];
const ACTIVE_WORKFLOW_STATUSES: TaskWorkflowStatus[] = [
  "Open",
  "In Progress",
  "Waiting External",
];

export function TaskDetailDrawer({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { authReady } = useRole();
  const queryClient = useQueryClient();

  const { data: history = [] } = useQuery({
    queryKey: ["task-timeline", task?.id],
    queryFn: () => listTaskTimeline(task!.id),
    enabled: authReady && !!task,
  });

  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: profilesById = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: commercialItems = [] } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });

  const client = task
    ? clientList.find((c) => c.id === task.clientId)
    : undefined;
  const commercial = task?.commercialItemId
    ? commercialItems.find((c) => c.id === task.commercialItemId)
    : undefined;
  const owner = task ? profilesById[task.ownerId] : undefined;

  // Local editable form state, seeded from the current task. Split into
  // two groups matching the domain model's own split (spec §3.1-§3.2):
  // plain detail fields (title/dueDate/method/priority/category), saved
  // via updateTask(); and progress fields (workflowStatus/nextAction/
  // nextActionDate/cancellationReason/note), saved exclusively via
  // recordTaskProgress() -- the atomic RPC (Task 5/50), never a direct
  // multi-write (Task 6/51 acceptance criterion).
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState<Task["method"]>("Phone");
  const [priority, setPriority] = useState<Task["priority"]>("Normal");
  const [category, setCategory] = useState<TaskCategory>("Other");

  const [progressTarget, setProgressTarget] =
    useState<TaskWorkflowStatus>("Open");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [savingProgress, setSavingProgress] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDueDate(task.dueDate);
    setMethod(task.method);
    setPriority(task.priority);
    setCategory(task.category);
    setProgressTarget(task.workflowStatus);
    setNextAction(task.nextAction ?? "");
    setNextActionDate(task.nextActionDate ?? "");
    // Shows why an already-Cancelled Task was cancelled; starts empty for
    // any other workflowStatus so a fresh cancellation isn't pre-filled
    // with unrelated old text.
    setCancellationReason(
      task.workflowStatus === "Cancelled"
        ? (task.cancellationReason ?? "")
        : "",
    );
    setProgressNote("");
  }, [task?.id, open]);

  const detailDirty = useMemo(() => {
    if (!task) return false;
    return (
      title !== task.title ||
      dueDate !== task.dueDate ||
      method !== task.method ||
      priority !== task.priority ||
      category !== task.category
    );
  }, [task, title, dueDate, method, priority, category]);

  const isActiveTarget = ACTIVE_WORKFLOW_STATUSES.includes(progressTarget);
  const progressDirty = useMemo(() => {
    if (!task) return false;
    return (
      progressTarget !== task.workflowStatus ||
      nextAction !== (task.nextAction ?? "") ||
      nextActionDate !== (task.nextActionDate ?? "") ||
      progressNote.trim().length > 0
    );
  }, [task, progressTarget, nextAction, nextActionDate, progressNote]);

  if (!task) return null;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({
      queryKey: ["task-timeline", task.id],
    });
    await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
  };

  const commitSave = async () => {
    try {
      await updateTask(task.id, { title, dueDate, method, priority, category });
      await invalidate();
      toast.success("Perubahan tersimpan", { description: task.title });
    } catch (error) {
      toast.error("Gagal menyimpan perubahan", {
        description: getErrorMessage(error),
      });
    }
  };

  const submitProgress = async () => {
    if (isActiveTarget && (!nextAction.trim() || !nextActionDate)) {
      toast.error("Next action dan tanggal wajib diisi untuk status aktif");
      return;
    }
    if (progressTarget === "Cancelled" && !cancellationReason.trim()) {
      toast.error("Alasan pembatalan wajib diisi");
      return;
    }
    const targetChanged = progressTarget !== task.workflowStatus;
    setSavingProgress(true);
    try {
      await recordTaskProgress({
        taskId: task.id,
        nextAction: isActiveTarget ? nextAction.trim() : null,
        nextActionDate: isActiveTarget ? nextActionDate : null,
        note: progressNote.trim() || undefined,
        workflowStatusTarget: targetChanged ? progressTarget : undefined,
        cancellationReason:
          progressTarget === "Cancelled"
            ? cancellationReason.trim()
            : undefined,
      });
      setProgressNote("");
      // The RPC nulls out next_action/next_action_date server-side for a
      // non-active target (Done/Cancelled) -- resync local state to match,
      // since the useEffect that seeds this state only re-runs on
      // task.id/open changing, neither of which happens here.
      if (!isActiveTarget) {
        setNextAction("");
        setNextActionDate("");
      }
      await invalidate();
      toast.success(
        targetChanged ? `Status → ${progressTarget}` : "Progress dicatat",
        { description: task.title },
      );
    } catch (error) {
      toast.error("Gagal menyimpan progress", {
        description: getErrorMessage(error),
      });
    } finally {
      setSavingProgress(false);
    }
  };

  const markDone = async () => {
    try {
      await recordTaskProgress({
        taskId: task.id,
        nextAction: null,
        nextActionDate: null,
        workflowStatusTarget: "Done",
      });
      // Resync the Progress section's local state (see submitProgress's
      // equivalent comment -- same reason this doesn't happen on its own).
      setProgressTarget("Done");
      setNextAction("");
      setNextActionDate("");
      await invalidate();
      toast.success("Task diselesaikan", { description: task.title });
    } catch (error) {
      toast.error("Gagal menyelesaikan task", {
        description: getErrorMessage(error),
      });
    }
  };

  const quickSnooze = async (days: number) => {
    const next = new Date(task.dueDate);
    next.setDate(next.getDate() + days);
    const iso = toLocalIsoDate(next);
    const prev = dueDate;
    setDueDate(iso);
    try {
      await updateTask(task.id, { dueDate: iso });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_status_change",
          ownerId: task.ownerId,
          actorId,
          clientId: task.clientId,
          taskId: task.id,
          title: `Ditunda +${days} hari → ${formatDateShort(iso)}`,
        });
      }
      await invalidate();
      toast(`Ditunda ke ${formatDateShort(iso)}`, { description: task.title });
    } catch (error) {
      setDueDate(prev);
      toast.error("Gagal menunda task", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="space-y-2 border-b p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base font-semibold text-foreground">
                {title || "Task"}
              </SheetTitle>
              <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                {client ? (
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: client.id }}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {client.name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Tanpa klien</span>
                )}
                {commercial && (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="text-muted-foreground">
                      {commercial.type} · {commercial.stage} ·{" "}
                      <span className="num">
                        {formatRupiahShort(commercial.estimatedValue)}
                      </span>
                    </span>
                  </>
                )}
              </SheetDescription>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {task.workflowStatus !== "Done" &&
              task.workflowStatus !== "Cancelled" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={() => void markDone()}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Tandai selesai
                </Button>
              )}
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => void quickSnooze(1)}
            >
              <Clock className="mr-1 h-4 w-4" /> +1 hari
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => void quickSnooze(3)}
            >
              +3 hari
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => void quickSnooze(7)}
            >
              +7 hari
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Editable fields -- bordered as its own card since this section
              saves independently from Catat Progress below (see comment on
              the state above); the border keeps the two "Simpan" actions
              from reading as one form. */}
          <section className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" /> Detail task
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-title" className="text-xs">
                Judul
              </Label>
              <Input
                id="t-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-due" className="text-xs">
                  Due date
                </Label>
                <Input
                  id="t-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Metode</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as Task["method"])}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioritas</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as Task["priority"])}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as TaskCategory)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Owner: {owner?.name ?? "—"}
                {owner?.initials ? ` · ${owner.initials}` : ""}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {detailDirty ? (
                <span className="text-[11px] font-medium text-warning">
                  Ada perubahan belum disimpan
                </span>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => onOpenChange(false)}
                >
                  Tutup
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => void commitSave()}
                  disabled={!detailDirty}
                >
                  <Save className="mr-1 h-4 w-4" /> Simpan
                </Button>
              </div>
            </div>
          </section>

          <Separator className="my-4" />

          {/* Progress -- the only path that changes workflowStatus,
              nextAction, nextActionDate, or cancellationReason (spec §3.3,
              Task 6/51 acceptance criterion). Reopening a Done/Cancelled
              Task also goes through here, since it requires a fresh next
              action (spec §2.4a). Bordered as its own card -- see comment
              on the Detail task section above. */}
          <section className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Undo2 className="h-3.5 w-3.5" /> Catat progress
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Status kerja</Label>
              <Select
                value={progressTarget}
                onValueChange={(v) =>
                  setProgressTarget(v as TaskWorkflowStatus)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isActiveTarget && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-next-action" className="text-xs">
                    Next action
                  </Label>
                  <Input
                    id="t-next-action"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="Rencana lanjutan…"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-next-date" className="text-xs">
                    Tanggal next action
                  </Label>
                  <Input
                    id="t-next-date"
                    type="date"
                    value={nextActionDate}
                    onChange={(e) => setNextActionDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}

            {progressTarget === "Cancelled" && (
              <div className="space-y-1.5">
                <Label htmlFor="t-cancel-reason" className="text-xs">
                  Alasan pembatalan
                </Label>
                <Textarea
                  id="t-cancel-reason"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Alasan Task dibatalkan…"
                  className="min-h-[60px] text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="t-progress-note" className="text-xs">
                Catatan
              </Label>
              <Textarea
                id="t-progress-note"
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
                placeholder="Catatan follow-up, hasil call, kesepakatan…"
                className="min-h-[72px] text-sm"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              {progressDirty && !savingProgress ? (
                <span className="text-[11px] font-medium text-warning">
                  Ada perubahan belum disimpan
                </span>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => void submitProgress()}
                disabled={!progressDirty || savingProgress}
              >
                {savingProgress ? "Menyimpan…" : "Simpan progress"}
              </Button>
            </div>
          </section>

          <Separator className="my-4" />

          {/* History */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Riwayat
              <span className="ml-1 text-[11px] font-normal normal-case text-muted-foreground/70">
                {history.length} entri
              </span>
            </div>
            {history.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                Belum ada riwayat. Simpan perubahan atau catatan di atas untuk
                mulai membangun jejak audit.
              </p>
            ) : (
              <ol className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-md border border-border bg-card p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground">
                        {h.title}
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {new Date(h.at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {h.detail && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {h.detail}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {h.actorName} · {h.actorRole}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
