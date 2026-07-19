import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Undo2,
  ExternalLink,
  Inbox,
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  UserCog,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  FileText,
  Wrench,
  PackageCheck,
  PhoneCall,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/context/role-context";
import { NOW } from "@/lib/domain";
import type { Task, TaskStatus, CommercialItem } from "@/lib/domain";
import {
  listTasks,
  updateTask,
  createTask,
  describeTaskChanges,
} from "@/lib/data/tasks";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import {
  listCommercialItems,
  updateCommercialItem,
  describeCommercialItemChanges,
} from "@/lib/data/commercial-items";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { formatDateShort, formatRupiahShort } from "@/lib/format";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { LogFollowUpDialog } from "@/components/tasks/LogFollowUpDialog";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({
    meta: [
      { title: "Task & Follow-Up Inbox · DSM Sales Execution" },
      {
        name: "description",
        content:
          "Inbox terpusat untuk semua follow-up sales, dikelompokkan berdasarkan due date.",
      },
    ],
  }),
  component: TasksInboxPage,
});

const METHOD_ICON = {
  Phone,
  Email: Mail,
  WhatsApp: MessageSquare,
  Visit: MapPin,
  Meeting: Users,
} as const;

const METHOD_OPTIONS = [
  "all",
  "Phone",
  "Email",
  "WhatsApp",
  "Visit",
  "Meeting",
] as const;
const PRIORITY_OPTIONS = ["all", "High", "Normal", "Low"] as const;
const COMMERCIAL_OPTIONS = [
  "all",
  "RFQ",
  "Quotation",
  "Direct Order",
  "Prototype",
  "Customer PO",
  "Sales Order",
  "none",
] as const;

type ViewKey = "today" | "upcoming" | "overdue" | "completed" | "archived";

const VIEW_META: Record<
  ViewKey,
  { title: string; tone: string; icon: typeof Clock }
> = {
  today: { title: "Today", tone: "text-primary", icon: Clock },
  upcoming: { title: "Upcoming", tone: "text-foreground", icon: CalendarDays },
  overdue: { title: "Overdue", tone: "text-destructive", icon: AlertTriangle },
  completed: { title: "Completed", tone: "text-success", icon: CheckCircle2 },
  archived: { title: "Archived", tone: "text-muted-foreground", icon: Archive },
};

const BUCKET_META: Record<Bucket, { title: string; tone: string }> = {
  overdue: { title: "Overdue", tone: "text-destructive" },
  today: { title: "Hari ini", tone: "text-primary" },
  week: { title: "Minggu ini", tone: "text-foreground" },
  later: { title: "Nanti", tone: "text-muted-foreground" },
  done: { title: "Selesai", tone: "text-success" },
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Bucketize by due-date proximity relative to NOW. "week" & "later" both fold
// into the "upcoming" view; "done" folds into "completed".
type Bucket = "overdue" | "today" | "week" | "later" | "done";
function bucketFor(task: Task): Bucket {
  if (task.status === "Done") return "done";
  const today = startOfDay(NOW);
  const due = startOfDay(new Date(task.dueDate));
  if (due < today) return "overdue";
  if (due === today) return "today";
  const weekEnd = today + 7 * 86_400_000;
  if (due <= weekEnd) return "week";
  return "later";
}

function viewForTask(task: Task, archived: boolean): ViewKey {
  if (archived) return "archived";
  const b = bucketFor(task);
  if (b === "done") return "completed";
  if (b === "overdue") return "overdue";
  if (b === "today") return "today";
  return "upcoming";
}

// Advisory aging: how many days since the task became overdue, or until due.
function agingDays(task: Task) {
  const today = startOfDay(NOW);
  const due = startOfDay(new Date(task.dueDate));
  return Math.round((today - due) / 86_400_000);
}

type ClientLookup = Record<string, { id: string; name: string }>;
type ProfileLookup = Record<string, { name: string; initials: string }>;
type CommercialLookup = Record<string, CommercialItem>;

function TasksInboxPage() {
  const { role, authReady } = useRole();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
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
  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && role !== "sales",
  });
  const { data: commercialItems = [] } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const clientsById = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    for (const c of clientList) map[c.id] = { id: c.id, name: c.name };
    return map;
  }, [clientList]);
  const commercialItemsById = useMemo(() => {
    const map: CommercialLookup = {};
    for (const c of commercialItems) map[c.id] = c;
    return map;
  }, [commercialItems]);

  const canEdit = role !== "executive";

  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [method, setMethod] = useState<(typeof METHOD_OPTIONS)[number]>("all");
  const [priority, setPriority] =
    useState<(typeof PRIORITY_OPTIONS)[number]>("all");
  const [commercialType, setCommercialType] =
    useState<(typeof COMMERCIAL_OPTIONS)[number]>("all");
  const [activeView, setActiveView] = useState<ViewKey>("today");
  const [view, setView] = useState<"agenda" | "calendar">("agenda");
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(NOW.getFullYear(), NOW.getMonth(), 1),
  );
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [logFuTaskId, setLogFuTaskId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setBucketSelection = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // Filtered by common criteria (excluding view). Applied before view split so
  // per-view counts always reflect current filters.
  const commonFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (ownerId !== "all" && t.ownerId !== ownerId) return false;
      if (method !== "all" && t.method !== method) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (commercialType !== "all") {
        if (commercialType === "none") {
          if (t.commercialItemId) return false;
        } else {
          const ci = t.commercialItemId
            ? commercialItems.find((c) => c.id === t.commercialItemId)
            : undefined;
          if (!ci || ci.type !== commercialType) return false;
        }
      }
      if (q) {
        const client = clientsById[t.clientId];
        const hay = `${t.title} ${client?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    tasks,
    ownerId,
    method,
    priority,
    commercialType,
    query,
    clientsById,
    commercialItems,
  ]);

  const viewCounts = useMemo(() => {
    const c: Record<ViewKey, number> = {
      today: 0,
      upcoming: 0,
      overdue: 0,
      completed: 0,
      archived: 0,
    };
    for (const t of commonFiltered) c[viewForTask(t, Boolean(t.archived))]++;
    return c;
  }, [commonFiltered]);

  const filtered = useMemo(
    () =>
      commonFiltered.filter(
        (t) => viewForTask(t, Boolean(t.archived)) === activeView,
      ),
    [commonFiltered, activeView],
  );

  const grouped = useMemo(() => {
    const g: Record<Bucket, Task[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      done: [],
    };
    for (const t of filtered) g[bucketFor(t)].push(t);
    const byDate = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate);
    (Object.keys(g) as Bucket[]).forEach((k) => g[k].sort(byDate));
    return g;
  }, [filtered]);

  const logTaskEvent = async (
    t: Task,
    title: string,
    detail?: string,
  ): Promise<void> => {
    const actorId = await getCurrentActorId();
    if (!actorId) return;
    await logActivity({
      kind: "task_status_change",
      ownerId: t.ownerId,
      actorId,
      clientId: t.clientId,
      taskId: t.id,
      title,
      detail,
    });
  };

  const invalidateTasks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
  };

  const setStatus = async (t: Task, status: TaskStatus, title: string) => {
    try {
      await updateTask(t.id, { status });
      await logTaskEvent(t, title);
      await invalidateTasks();
    } catch (error) {
      toast.error("Gagal mengubah status task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDone = async (t: Task) => {
    try {
      await updateTask(t.id, { status: "Done" });
      await logTaskEvent(t, "Status → Done");
      await invalidateTasks();
      const client = clientsById[t.clientId];
      toast.success(`Task diselesaikan — ${client?.name ?? "Klien"}`, {
        description: t.title,
        action: {
          label: "Undo",
          onClick: () => void setStatus(t, "Today", "Status → Today (undo)"),
        },
      });
    } catch (error) {
      toast.error("Gagal menyelesaikan task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleSnooze = async (t: Task) => {
    const next = new Date(t.dueDate);
    next.setDate(next.getDate() + 1);
    const iso = next.toISOString().slice(0, 10);
    const nextStatus: TaskStatus =
      startOfDay(next) === startOfDay(NOW) ? "Today" : "Upcoming";
    const prevDueDate = t.dueDate;
    const prevStatus = t.status;
    try {
      await updateTask(t.id, { dueDate: iso, status: nextStatus });
      await logTaskEvent(t, `Ditunda +1 hari → ${formatDateShort(iso)}`);
      await invalidateTasks();
      toast(`Ditunda ke ${formatDateShort(iso)}`, {
        description: t.title,
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              try {
                await updateTask(t.id, {
                  dueDate: prevDueDate,
                  status: prevStatus,
                });
                await logTaskEvent(t, "Penundaan dibatalkan");
                await invalidateTasks();
              } catch (error) {
                toast.error("Gagal membatalkan penundaan", {
                  description:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            })(),
        },
      });
    } catch (error) {
      toast.error("Gagal menunda task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleUndo = (t: Task) => {
    void setStatus(t, "Today", "Status → Today (undo)");
    toast("Perubahan dibatalkan", { description: t.title });
  };

  const handleArchive = async (t: Task) => {
    try {
      await updateTask(t.id, { archived: true });
      await logTaskEvent(t, "Task diarsipkan");
      await invalidateTasks();
      toast("Task diarsipkan", {
        description: t.title,
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              try {
                await updateTask(t.id, { archived: false });
                await logTaskEvent(t, "Task dikembalikan dari arsip");
                await invalidateTasks();
              } catch (error) {
                toast.error("Gagal mengembalikan task", {
                  description:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
            })(),
        },
      });
    } catch (error) {
      toast.error("Gagal mengarsipkan task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleUnarchive = async (t: Task) => {
    try {
      await updateTask(t.id, { archived: false });
      await logTaskEvent(t, "Task dikembalikan dari arsip");
      await invalidateTasks();
      toast("Task dikembalikan ke inbox", { description: t.title });
    } catch (error) {
      toast.error("Gagal mengembalikan task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleCreateChildTask = async (
    t: Task,
    kind: "Quotation" | "Prototype",
  ) => {
    const client = clientsById[t.clientId];
    const due = new Date(NOW);
    due.setDate(due.getDate() + (kind === "Quotation" ? 2 : 3));
    const iso = due.toISOString().slice(0, 10);
    const nextStatus: TaskStatus =
      startOfDay(due) === startOfDay(NOW) ? "Today" : "Upcoming";
    try {
      const childTask = await createTask({
        clientId: t.clientId,
        commercialItemId: t.commercialItemId,
        ownerId: t.ownerId,
        title:
          kind === "Quotation" ? "Siapkan quotation" : "Koordinasi prototype",
        method: kind === "Quotation" ? "Email" : "Meeting",
        priority: "Normal",
        dueDate: iso,
        status: nextStatus,
      });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_created",
          ownerId: t.ownerId,
          actorId,
          clientId: t.clientId,
          taskId: childTask.id,
          title: `Task ${kind} dibuat`,
          detail: childTask.title,
        });
      }
      await invalidateTasks();
      toast.success(`Task ${kind} dibuat`, {
        description: `${client?.name ?? "Klien"} · due ${formatDateShort(iso)}`,
      });
    } catch (error) {
      toast.error(`Gagal membuat task ${kind}`, {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleMoveWaitingPO = async (t: Task) => {
    if (!t.commercialItemId) {
      toast.error("Task ini belum terhubung ke commercial item");
      return;
    }
    const ci = commercialItemsById[t.commercialItemId];
    if (!ci) {
      toast.error("Commercial item tidak ditemukan");
      return;
    }
    try {
      await updateCommercialItem(t.commercialItemId, { stage: "Waiting PO" });
      const changes = [{ field: "stage", from: ci.stage, to: "Waiting PO" }];
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "commercial_item_stage_change",
          ownerId: ci.ownerId,
          actorId,
          clientId: ci.clientId,
          commercialItemId: ci.id,
          title: `${ci.description} diperbarui`,
          detail: `${describeCommercialItemChanges(changes)} — dipindah dari task: ${t.title}`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Commercial item → Waiting PO", { description: t.title });
    } catch (error) {
      toast.error("Gagal memindahkan commercial item", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // -------------------------- Bulk actions --------------------------
  const selectedIdList = useMemo(
    () => tasks.filter((t) => selected.has(t.id)).map((t) => t.id),
    [tasks, selected],
  );
  const selectedTasks = useMemo(
    () => tasks.filter((t) => selected.has(t.id)),
    [tasks, selected],
  );

  const bulkDone = async () => {
    const targets = selectedTasks.filter((t) => bucketFor(t) !== "done");
    if (targets.length === 0) return;
    const snapshot = targets.map((t) => ({ id: t.id, status: t.status, t }));
    try {
      await Promise.all(
        targets.map(async (t) => {
          await updateTask(t.id, { status: "Done" });
          await logTaskEvent(t, "Status → Done (massal)");
        }),
      );
      await invalidateTasks();
      toast.success(`${targets.length} task ditandai Done`, {
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              await Promise.all(
                snapshot.map(({ id, status, t }) =>
                  updateTask(id, { status }).then(() =>
                    logTaskEvent(t, "Status dibatalkan (massal undo)"),
                  ),
                ),
              );
              await invalidateTasks();
            })(),
        },
      });
    } catch (error) {
      toast.error("Gagal menandai task selesai", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
    clearSelection();
  };

  const bulkSnooze = async () => {
    const targets = selectedTasks.filter((t) => bucketFor(t) !== "done");
    if (targets.length === 0) return;
    const snapshot = targets.map((t) => ({
      id: t.id,
      dueDate: t.dueDate,
      status: t.status,
      t,
    }));
    try {
      await Promise.all(
        targets.map(async (t) => {
          const next = new Date(t.dueDate);
          next.setDate(next.getDate() + 1);
          const iso = next.toISOString().slice(0, 10);
          const nextStatus: TaskStatus =
            startOfDay(next) === startOfDay(NOW) ? "Today" : "Upcoming";
          await updateTask(t.id, { dueDate: iso, status: nextStatus });
          await logTaskEvent(
            t,
            `Ditunda +1 hari → ${formatDateShort(iso)} (massal)`,
          );
        }),
      );
      await invalidateTasks();
      toast(`${targets.length} task ditunda +1 hari`, {
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              await Promise.all(
                snapshot.map(({ id, dueDate, status, t }) =>
                  updateTask(id, { dueDate, status }).then(() =>
                    logTaskEvent(t, "Penundaan dibatalkan (massal undo)"),
                  ),
                ),
              );
              await invalidateTasks();
            })(),
        },
      });
    } catch (error) {
      toast.error("Gagal menunda task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
    clearSelection();
  };

  const bulkChangeOwner = async (newOwnerId: string) => {
    const target = profilesById[newOwnerId];
    if (!target) return;
    const targets = selectedTasks.filter((t) => t.ownerId !== newOwnerId);
    if (targets.length === 0) return;
    const snapshot = targets.map((t) => ({ id: t.id, ownerId: t.ownerId, t }));
    try {
      await Promise.all(
        targets.map(async (t) => {
          const prevOwner = profilesById[t.ownerId];
          await updateTask(t.id, { ownerId: newOwnerId });
          await logTaskEvent(
            t,
            `Owner: ${prevOwner?.name ?? t.ownerId} → ${target.name}`,
          );
        }),
      );
      await invalidateTasks();
      toast(`Owner ${targets.length} task → ${target.name}`, {
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              await Promise.all(
                snapshot.map(({ id, ownerId, t }) =>
                  updateTask(id, { ownerId }).then(() =>
                    logTaskEvent(t, "Owner dibatalkan (massal undo)"),
                  ),
                ),
              );
              await invalidateTasks();
            })(),
        },
      });
    } catch (error) {
      toast.error("Gagal mengubah owner", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
    clearSelection();
  };

  const handleOpen = (t: Task) => setOpenTaskId(t.id);
  const openTask = openTaskId
    ? (tasks.find((t) => t.id === openTaskId) ?? null)
    : null;

  if (!authReady || tasksLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Loading tasks…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {role === "manager"
              ? "Team Tasks"
              : role === "sales"
                ? "My Tasks"
                : "Team Tasks (read-only)"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Task &amp; follow-up terhubung ke klien serta commercial item aktif.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => {
              if (v === "agenda" || v === "calendar") setView(v);
            }}
            className="rounded-md border bg-card p-0.5"
          >
            <ToggleGroupItem
              value="agenda"
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              <List className="h-3.5 w-3.5" /> Agenda
            </ToggleGroupItem>
            <ToggleGroupItem
              value="calendar"
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Kalender
            </ToggleGroupItem>
          </ToggleGroup>
          {canEdit && <CreateTaskDialog role={role} />}
        </div>
      </header>

      {/* View segmented control — Today / Upcoming / Overdue / Completed / Archived */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(VIEW_META) as ViewKey[]).map((v) => {
          const meta = VIEW_META[v];
          const Icon = meta.icon;
          const active = activeView === v;
          const isOverdue = v === "overdue";
          const count = viewCounts[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => setActiveView(v)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
                isOverdue && count > 0 && !active && "border-destructive/40",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md bg-muted",
                  meta.tone,
                  isOverdue &&
                    count > 0 &&
                    "bg-destructive/10 text-destructive",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {meta.title}
                </div>
                <div
                  className={cn(
                    "num text-lg font-semibold text-foreground",
                    isOverdue && count > 0 && "text-destructive",
                  )}
                >
                  {count}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Card className="border-border shadow-none">
        <CardContent className="flex flex-col gap-2 p-3 md:flex-row md:flex-wrap md:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari task atau nama klien…"
              className="h-9 pl-8"
            />
          </div>

          {role !== "sales" && (
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="h-9 w-full md:w-[180px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua owner</SelectItem>
                {salesTeam.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={method}
            onValueChange={(v) => setMethod(v as typeof method)}
          >
            <SelectTrigger className="h-9 w-full md:w-[150px]">
              <SelectValue placeholder="Metode" />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "all" ? "Semua metode" : m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as typeof priority)}
          >
            <SelectTrigger className="h-9 w-full md:w-[140px]">
              <SelectValue placeholder="Prioritas" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === "all" ? "Semua prioritas" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={commercialType}
            onValueChange={(v) => setCommercialType(v as typeof commercialType)}
          >
            <SelectTrigger className="h-9 w-full md:w-[170px]">
              <SelectValue placeholder="Commercial" />
            </SelectTrigger>
            <SelectContent>
              {COMMERCIAL_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "all"
                    ? "Semua tipe"
                    : c === "none"
                      ? "Tanpa commercial"
                      : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {view === "agenda" ? (
        <div className="flex flex-col gap-3">
          {(["overdue", "today", "week", "later", "done"] as Bucket[]).map(
            (b) => {
              const rows = grouped[b];
              if (rows.length === 0) return null;
              const meta = BUCKET_META[b];
              const ids = rows.map((r) => r.id);
              const allSelected =
                ids.length > 0 && ids.every((id) => selected.has(id));
              const someSelected =
                !allSelected && ids.some((id) => selected.has(id));
              return (
                <Card key={b} className="border-border shadow-none">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle
                      className={`flex items-center gap-2 text-sm font-semibold ${meta.tone}`}
                    >
                      <Checkbox
                        checked={
                          allSelected
                            ? true
                            : someSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(v) =>
                          setBucketSelection(ids, v === true)
                        }
                        aria-label={`Pilih semua ${meta.title}`}
                      />
                      {meta.title}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {rows.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-border">
                      {rows.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          isArchived={Boolean(task.archived)}
                          canEdit={canEdit}
                          onDone={handleDone}
                          onSnooze={handleSnooze}
                          onUndo={handleUndo}
                          onOpen={handleOpen}
                          onArchive={handleArchive}
                          onUnarchive={handleUnarchive}
                          onCreateChildTask={handleCreateChildTask}
                          onMoveWaitingPO={handleMoveWaitingPO}
                          onLogFollowUp={(t) => setLogFuTaskId(t.id)}
                          selected={selected.has(task.id)}
                          onToggleSelect={canEdit ? toggleSelected : undefined}
                          clientsById={clientsById}
                          profilesById={profilesById}
                          commercialItemsById={commercialItemsById}
                        />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            },
          )}

          {filtered.length === 0 && (
            <Card className="border-border shadow-none">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Inbox kosong
                </p>
                <p className="text-xs text-muted-foreground">
                  Tidak ada task yang cocok dengan filter saat ini.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <CalendarView
          tasks={filtered}
          month={calendarMonth}
          onPrev={() =>
            setCalendarMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
            )
          }
          onNext={() =>
            setCalendarMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
            )
          }
          onToday={() =>
            setCalendarMonth(new Date(NOW.getFullYear(), NOW.getMonth(), 1))
          }
          onDone={handleDone}
          onSnooze={handleSnooze}
          onUndo={handleUndo}
          onOpen={handleOpen}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onCreateChildTask={handleCreateChildTask}
          onMoveWaitingPO={handleMoveWaitingPO}
          onLogFollowUp={(t) => setLogFuTaskId(t.id)}
          canEdit={canEdit}
          selected={selected}
          onToggleSelect={toggleSelected}
          clientsById={clientsById}
          profilesById={profilesById}
          commercialItemsById={commercialItemsById}
        />
      )}
      <TaskDetailDrawer
        task={openTask}
        open={openTaskId !== null}
        onOpenChange={(o) => !o && setOpenTaskId(null)}
      />

      {(() => {
        const logTask = logFuTaskId
          ? tasks.find((t) => t.id === logFuTaskId)
          : null;
        if (!logTask) return null;
        return (
          <LogFollowUpDialog
            task={logTask}
            open={true}
            onOpenChange={(o) => !o && setLogFuTaskId(null)}
          />
        );
      })()}

      {selectedIdList.length > 0 && (
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
            <span className="text-xs font-medium text-foreground">
              <span className="num">{selectedIdList.length}</span> dipilih
            </span>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              onClick={() => void bulkDone()}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Done
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => void bulkSnooze()}
            >
              <Clock className="mr-1 h-4 w-4" /> Snooze +1
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <UserCog className="mr-1 h-4 w-4" /> Ubah owner
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Pindahkan ke
                </div>
                <div className="flex flex-col">
                  {salesTeam.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void bulkChangeOwner(m.id)}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
                    >
                      <span>{m.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {m.initials}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={clearSelection}
              title="Batalkan pilihan"
            >
              <X className="mr-1 h-4 w-4" /> Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  isArchived,
  canEdit,
  onDone,
  onSnooze,
  onUndo,
  onOpen,
  onArchive,
  onUnarchive,
  onCreateChildTask,
  onMoveWaitingPO,
  onLogFollowUp,
  selected = false,
  onToggleSelect,
  clientsById,
  profilesById,
  commercialItemsById,
}: {
  task: Task;
  isArchived: boolean;
  canEdit: boolean;
  onDone: (t: Task) => void;
  onSnooze: (t: Task) => void;
  onUndo: (t: Task) => void;
  onOpen: (t: Task) => void;
  onArchive: (t: Task) => void;
  onUnarchive: (t: Task) => void;
  onCreateChildTask: (t: Task, kind: "Quotation" | "Prototype") => void;
  onMoveWaitingPO: (t: Task) => void;
  onLogFollowUp: (t: Task) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  clientsById: ClientLookup;
  profilesById: ProfileLookup;
  commercialItemsById: CommercialLookup;
}) {
  const client = clientsById[task.clientId];
  const commercial = task.commercialItemId
    ? commercialItemsById[task.commercialItemId]
    : undefined;
  const owner = profilesById[task.ownerId];
  const Icon = METHOD_ICON[task.method];
  const isDone = bucketFor(task) === "done";
  const isOverdueRow = bucketFor(task) === "overdue";
  const aging = agingDays(task);

  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4",
        selected && "bg-primary-soft/40",
        isOverdueRow && !isDone && "border-l-2 border-destructive",
      )}
    >
      {onToggleSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(task.id)}
          aria-label={`Pilih task ${task.title}`}
          className="mt-0.5 self-start sm:self-center"
        />
      )}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {client ? (
              <Link
                to="/clients/$clientId"
                params={{ clientId: client.id }}
                className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {client.name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium text-foreground">
                Tanpa klien
              </span>
            )}
            {task.priority === "High" && (
              <Badge
                variant="outline"
                className="border-warning/40 bg-warning/10 text-[10px] font-medium text-warning"
              >
                High
              </Badge>
            )}
            {isDone && (
              <Badge
                variant="outline"
                className="border-success/40 bg-success/10 text-[10px] font-medium text-success"
              >
                Done
              </Badge>
            )}
            {isArchived && (
              <Badge
                variant="outline"
                className="border-border bg-muted text-[10px] font-medium text-muted-foreground"
              >
                Archived
              </Badge>
            )}
            {isOverdueRow && !isDone && aging > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-medium",
                  aging >= 7
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-warning/40 bg-warning/10 text-warning",
                )}
                title="Advisory SLA — hari sejak jatuh tempo"
              >
                +{aging}d overdue
              </Badge>
            )}
            {!isDone && !isOverdueRow && aging < 0 && (
              <span className="text-[10px] text-muted-foreground">
                dalam {Math.abs(aging)} hari
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {task.title}
            {commercial
              ? ` · ${commercial.type} · ${commercial.stage}`
              : " · tanpa commercial item"}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="text-right">
          {commercial ? (
            <div className="num text-sm font-medium text-foreground">
              {formatRupiahShort(commercial.estimatedValue)}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">—</div>
          )}
          <div className="text-[11px] text-muted-foreground">
            Due {formatDateShort(task.dueDate)}
            {owner ? ` · ${owner.initials}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title="Buka detail task"
            onClick={() => onOpen(task)}
          >
            <Info className="h-4 w-4" />
          </Button>
          {client && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Buka profil klien"
            >
              <Link to="/clients/$clientId" params={{ clientId: client.id }}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {canEdit &&
            !isArchived &&
            (isDone ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => onUndo(task)}
              >
                <Undo2 className="mr-1 h-4 w-4" /> Undo
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => onLogFollowUp(task)}
                  title="Log follow-up"
                >
                  <PhoneCall className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => onSnooze(task)}
                  title="Tunda +1 hari"
                >
                  <Clock className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={isOverdueRow ? "default" : "secondary"}
                  className="h-8"
                  onClick={() => onDone(task)}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Done
                </Button>
              </>
            ))}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Aksi cepat"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isArchived && !isDone && (
                  <>
                    <DropdownMenuItem onSelect={() => onLogFollowUp(task)}>
                      <PhoneCall className="mr-2 h-4 w-4" /> Log follow-up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onCreateChildTask(task, "Quotation")}
                    >
                      <FileText className="mr-2 h-4 w-4" /> Create Quotation
                      task
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onCreateChildTask(task, "Prototype")}
                    >
                      <Wrench className="mr-2 h-4 w-4" /> Create Prototype task
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onMoveWaitingPO(task)}
                      disabled={!task.commercialItemId}
                    >
                      <PackageCheck className="mr-2 h-4 w-4" /> Move to Waiting
                      PO
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {isArchived ? (
                  <DropdownMenuItem onSelect={() => onUnarchive(task)}>
                    <ArchiveRestore className="mr-2 h-4 w-4" /> Restore dari
                    arsip
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => onArchive(task)}>
                    <Archive className="mr-2 h-4 w-4" /> Arsipkan
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </li>
  );
}

const MONTH_ID = "id-ID";
const WEEKDAYS_ID = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarView({
  tasks,
  month,
  onPrev,
  onNext,
  onToday,
  onDone,
  onSnooze,
  onUndo,
  onOpen,
  onArchive,
  onUnarchive,
  onCreateChildTask,
  onMoveWaitingPO,
  onLogFollowUp,
  canEdit,
  selected,
  onToggleSelect,
  clientsById,
  profilesById,
  commercialItemsById,
}: {
  tasks: Task[];
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDone: (t: Task) => void;
  onSnooze: (t: Task) => void;
  onUndo: (t: Task) => void;
  onOpen: (t: Task) => void;
  onArchive: (t: Task) => void;
  onUnarchive: (t: Task) => void;
  onCreateChildTask: (t: Task, kind: "Quotation" | "Prototype") => void;
  onMoveWaitingPO: (t: Task) => void;
  onLogFollowUp: (t: Task) => void;
  canEdit: boolean;
  clientsById: ClientLookup;
  profilesById: ProfileLookup;
  commercialItemsById: CommercialLookup;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [selectedISO, setSelectedISO] = useState<string | null>(isoDay(NOW));

  // Build 6-week grid starting Monday
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Monday = 0
    const dow = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - dow);
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [month]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.dueDate.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    for (const list of m.values())
      list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return m;
  }, [tasks]);

  const todayISO = isoDay(NOW);
  const monthLabel = month.toLocaleDateString(MONTH_ID, {
    month: "long",
    year: "numeric",
  });

  const selectedTasks = selectedISO ? (tasksByDay.get(selectedISO) ?? []) : [];

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold capitalize text-foreground">
          {monthLabel}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={onPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={onToday}
          >
            Hari ini
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={onNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-3 pt-0">
        <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS_ID.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const iso = isoDay(d);
            const inMonth = d.getMonth() === month.getMonth();
            const isToday = iso === todayISO;
            const isSelected = iso === selectedISO;
            const dayTasks = tasksByDay.get(iso) ?? [];
            const overdue = dayTasks.some(
              (t) => t.status !== "Done" && iso < todayISO,
            );
            const done =
              dayTasks.length > 0 && dayTasks.every((t) => t.status === "Done");
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedISO(iso)}
                className={cn(
                  "group flex min-h-[68px] flex-col rounded-md border p-1 text-left transition-colors",
                  inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
                  isSelected && "border-primary ring-1 ring-primary",
                  !isSelected && "hover:border-primary/50",
                )}
              >
                <span
                  className={cn(
                    "num flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && inMonth && "text-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
                {dayTasks.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {dayTasks.slice(0, 2).map((t) => (
                      <span
                        key={t.id}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                          t.status === "Done"
                            ? "bg-success/10 text-success line-through"
                            : overdue
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary-soft text-primary",
                        )}
                      >
                        {t.title}
                      </span>
                    ))}
                    {dayTasks.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayTasks.length - 2}
                      </span>
                    )}
                  </div>
                )}
                {dayTasks.length === 0 && inMonth && (
                  <span className="mt-auto text-[10px] text-muted-foreground/40">
                    &nbsp;
                  </span>
                )}
                {done && dayTasks.length > 0 && (
                  <CheckCircle2 className="mt-auto h-3 w-3 self-end text-success" />
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              {selectedISO
                ? new Date(selectedISO).toLocaleDateString(MONTH_ID, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Pilih tanggal"}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {selectedTasks.length} task
            </span>
          </div>
          {selectedTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Tidak ada task pada tanggal ini.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {selectedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  isArchived={Boolean(t.archived)}
                  canEdit={canEdit}
                  onDone={onDone}
                  onSnooze={onSnooze}
                  onUndo={onUndo}
                  onOpen={onOpen}
                  onArchive={onArchive}
                  onUnarchive={onUnarchive}
                  onCreateChildTask={onCreateChildTask}
                  onMoveWaitingPO={onMoveWaitingPO}
                  onLogFollowUp={onLogFollowUp}
                  selected={selected.has(t.id)}
                  onToggleSelect={canEdit ? onToggleSelect : undefined}
                  clientsById={clientsById}
                  profilesById={profilesById}
                  commercialItemsById={commercialItemsById}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
