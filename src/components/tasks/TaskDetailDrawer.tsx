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
  StickyNote,
  Undo2,
} from "lucide-react";

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
import type { Task, TaskStatus } from "@/lib/domain";
import { listClients, listOwners } from "@/lib/data/clients";
import { listCommercialItems } from "@/lib/data/commercial-items";
import { updateTask, describeTaskChanges } from "@/lib/data/tasks";
import {
  getCurrentActorId,
  listTaskHistory,
  logActivity,
} from "@/lib/data/activity-log";
import { formatDateShort, formatRupiahShort } from "@/lib/format";

const METHODS = ["Phone", "Email", "WhatsApp", "Visit", "Meeting"] as const;
const PRIORITIES = ["High", "Normal", "Low"] as const;
const STATUSES: TaskStatus[] = ["Today", "Upcoming", "Overdue", "Done"];

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
    queryKey: ["activity-log", "task", task?.id],
    queryFn: () => listTaskHistory(task!.id),
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

  // Local editable form state, seeded from the current task.
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState<Task["method"]>("Phone");
  const [priority, setPriority] = useState<Task["priority"]>("Normal");
  const [status, setStatus] = useState<TaskStatus>("Today");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDueDate(task.dueDate);
    setMethod(task.method);
    setPriority(task.priority);
    setStatus(task.status);
    setNote("");
  }, [task?.id, open]);

  const dirty = useMemo(() => {
    if (!task) return false;
    return (
      title !== task.title ||
      dueDate !== task.dueDate ||
      method !== task.method ||
      priority !== task.priority ||
      status !== task.status
    );
  }, [task, title, dueDate, method, priority, status]);

  if (!task) return null;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({
      queryKey: ["activity-log", "task", task.id],
    });
    await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
  };

  const commitSave = async () => {
    const changes: { field: string; from?: string; to?: string }[] = [];
    if (title !== task.title)
      changes.push({ field: "Judul", from: task.title, to: title });
    if (dueDate !== task.dueDate)
      changes.push({
        field: "Due date",
        from: formatDateShort(task.dueDate),
        to: formatDateShort(dueDate),
      });
    if (method !== task.method)
      changes.push({ field: "Metode", from: task.method, to: method });
    if (priority !== task.priority)
      changes.push({ field: "Prioritas", from: task.priority, to: priority });
    if (status !== task.status)
      changes.push({ field: "Status", from: task.status, to: status });

    try {
      await updateTask(task.id, { title, dueDate, method, priority, status });
      if (changes.length) {
        const actorId = await getCurrentActorId();
        if (actorId) {
          await logActivity({
            kind: "task_status_change",
            ownerId: task.ownerId,
            actorId,
            clientId: task.clientId,
            taskId: task.id,
            title: `${changes.length} perubahan`,
            detail: describeTaskChanges(changes),
          });
        }
      }
      await invalidate();
      toast.success("Perubahan tersimpan", { description: task.title });
    } catch (error) {
      toast.error("Gagal menyimpan perubahan", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const quickStatus = async (next: TaskStatus) => {
    const prev = status;
    setStatus(next);
    try {
      await updateTask(task.id, { status: next });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_status_change",
          ownerId: task.ownerId,
          actorId,
          clientId: task.clientId,
          taskId: task.id,
          title: `Status → ${next}`,
        });
      }
      await invalidate();
      toast.success(`Status → ${next}`, { description: task.title });
    } catch (error) {
      setStatus(prev);
      toast.error("Gagal mengubah status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const quickSnooze = async (days: number) => {
    const next = new Date(task.dueDate);
    next.setDate(next.getDate() + days);
    const iso = next.toISOString().slice(0, 10);
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
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addNote = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    try {
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_status_change",
          ownerId: task.ownerId,
          actorId,
          clientId: task.clientId,
          taskId: task.id,
          title: "Catatan ditambahkan",
          detail: trimmed,
        });
      }
      setNote("");
      await invalidate();
      toast.success("Catatan ditambahkan");
    } catch (error) {
      toast.error("Gagal menambah catatan", {
        description: error instanceof Error ? error.message : "Unknown error",
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
            {status !== "Done" ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => void quickStatus("Done")}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" /> Tandai selesai
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => void quickStatus("Today")}
              >
                <Undo2 className="mr-1 h-4 w-4" /> Buka kembali
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
          {/* Editable fields */}
          <section className="space-y-3">
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
                <Label className="text-xs">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as TaskStatus)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
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

            <div className="flex items-center justify-end gap-2 pt-1">
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
                disabled={!dirty}
              >
                <Save className="mr-1 h-4 w-4" /> Simpan
              </Button>
            </div>
          </section>

          <Separator className="my-4" />

          {/* Notes */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" /> Tambah catatan
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan follow-up, hasil call, kesepakatan…"
              className="min-h-[72px] text-sm"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => void addNote()}
                disabled={!note.trim()}
              >
                Simpan catatan
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
