import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  CheckCircle2,
  Clock,
  Inbox,
  CalendarDays,
  List,
  X,
  UserCog,
  Archive,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/context/role-context";
import { NOW, toLocalIsoDate } from "@/lib/domain";
import type { Task } from "@/lib/domain";
import { listActiveTasks, type TaskListFilters } from "@/lib/data/tasks";
import {
  filterExecutiveTaskExceptions,
  filterManagerMyTasks,
  filterManagerTeamExceptions,
} from "@/lib/data/task-exceptions";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import { listCommercialItems } from "@/lib/data/commercial-items";
import { getCurrentActorId } from "@/lib/data/activity-log";
import {
  archiveTasksInboxTask,
  bulkChangeTasksInboxOwner,
  bulkMarkTasksInboxDone,
  bulkSnoozeTasksInbox,
  confirmTasksInboxWaitingPoMove,
  createTasksInboxChildTask,
  markTasksInboxTaskDone,
  snoozeTasksInboxTask,
  unarchiveTasksInboxTask,
} from "@/lib/tasks-inbox-actions";
import { useTasksInboxHistory } from "@/lib/tasks-inbox-queries";
import {
  TASKS_INBOX_QUERY_KEYS,
  buildTaskHistoryFilters,
  countTasksInboxViews,
  filterTasksInboxRows,
  groupTasksInboxAgenda,
  indexTasksInboxClients,
  indexTasksInboxCommercialItems,
  indexTasksInboxTasks,
  isTaskHistoryBlocked,
  selectedTasksFromIds,
  viewForTask,
  type TasksInboxManagerMode as ManagerTaskMode,
  type TasksInboxViewKey as ViewKey,
} from "@/lib/tasks-inbox-controller";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { CalendarIncompleteWarning } from "@/components/tasks/CalendarIncompleteWarning";
import {
  TaskHistorySection,
  TasksAgendaView,
  TasksCalendarView,
} from "@/components/tasks/TasksInboxViews";
import {
  PipelineStageMoveDialog,
  type PendingPipelineMove,
} from "@/components/pipeline/PipelineStageMoveDialog";

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
  "Quotation",
  "Direct Order",
  "Prototype",
  "Customer PO",
  "Sales Order",
  "none",
] as const;

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

function TasksInboxPage() {
  const { role, authReady } = useRole();
  const queryClient = useQueryClient();

  const { data: activeTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: TASKS_INBOX_QUERY_KEYS.activeTasks,
    queryFn: listActiveTasks,
    enabled: authReady,
  });
  const { data: currentActorId } = useQuery({
    queryKey: TASKS_INBOX_QUERY_KEYS.currentActorId,
    queryFn: getCurrentActorId,
    enabled: authReady,
  });
  const { data: clientList = [] } = useQuery({
    queryKey: TASKS_INBOX_QUERY_KEYS.clientsAll,
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: profilesById = {} } = useQuery({
    queryKey: TASKS_INBOX_QUERY_KEYS.owners,
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: salesTeam = [] } = useQuery({
    queryKey: TASKS_INBOX_QUERY_KEYS.salesTeam,
    queryFn: listSalesTeamProfiles,
    enabled: authReady && role !== "sales",
  });
  const { data: commercialItems = [] } = useQuery({
    queryKey: TASKS_INBOX_QUERY_KEYS.commercialItemsAll,
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const clientsById = useMemo(
    () => indexTasksInboxClients(clientList),
    [clientList],
  );
  const commercialItemsById = useMemo(
    () => indexTasksInboxCommercialItems(commercialItems),
    [commercialItems],
  );

  const canEdit = role !== "executive";

  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [method, setMethod] = useState<(typeof METHOD_OPTIONS)[number]>("all");
  const [priority, setPriority] =
    useState<(typeof PRIORITY_OPTIONS)[number]>("all");
  const [commercialType, setCommercialType] =
    useState<(typeof COMMERCIAL_OPTIONS)[number]>("all");
  const [activeView, setActiveView] = useState<ViewKey>("today");
  const [managerTaskMode, setManagerTaskMode] =
    useState<ManagerTaskMode>("my-tasks");
  const [view, setView] = useState<"agenda" | "calendar">("agenda");
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(NOW.getFullYear(), NOW.getMonth(), 1),
  );
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // "Waiting PO" quick action -> Commit stage move. Stage 4 Task 4.3: this
  // used to write stage + an unstructured activity_log row directly,
  // bypassing transition_commercial_stage's structured event_data (broke
  // Stage 4 funnel/dwell coverage for this path). Reuses the same
  // confirmation dialog and RPC path Pipeline's drag-and-drop already uses.
  const [waitingPoMove, setWaitingPoMove] =
    useState<PendingPipelineMove | null>(null);
  const [waitingPoNextAction, setWaitingPoNextAction] = useState("");
  const [waitingPoNextDate, setWaitingPoNextDate] = useState("");
  const [waitingPoTaskMode, setWaitingPoTaskMode] = useState<
    "existing_task" | "create_task"
  >("existing_task");
  const [waitingPoTaskId, setWaitingPoTaskId] = useState("");

  // Completed/Archived are server-paginated in bounded pages, not a full
  // month's worth of history, so the month-grid Calendar view (which needs
  // every task in the visible month at once) doesn't apply to them.
  const isHistoryView = activeView === "completed" || activeView === "archived";
  useEffect(() => {
    if (isHistoryView && view === "calendar") setView("agenda");
  }, [isHistoryView, view]);

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

  useEffect(() => {
    setSelected(new Set());
    if (role === "manager" && managerTaskMode === "team-exceptions") {
      setActiveView("overdue");
    }
  }, [role, managerTaskMode]);

  const scopedTasks = useMemo(() => {
    if (role === "executive") {
      return filterExecutiveTaskExceptions(activeTasks, profilesById);
    }
    if (role !== "manager") return activeTasks;
    if (managerTaskMode === "team-exceptions") {
      return filterManagerTeamExceptions(activeTasks, profilesById);
    }
    return filterManagerMyTasks(activeTasks, currentActorId);
  }, [role, managerTaskMode, activeTasks, profilesById, currentActorId]);

  // Completed/Archived history views are server-paginated (see
  // listTasksPage() in lib/data/tasks.ts) instead of being sliced out of
  // activeTasks, which deliberately excludes them. filterExecutiveTaskExceptions
  // and filterManagerTeamExceptions both require archived=false and an active
  // workflow status, so executive exceptions and manager team-exceptions mode
  // can never show any Completed/Archived rows -- history fetching is skipped
  // entirely for those, matching what scopedTasks already implies.
  const historyBlocked = isTaskHistoryBlocked({
    role,
    managerTaskMode,
    ownerId,
    currentActorId,
  });

  const historyFilters = useMemo<TaskListFilters>(
    () =>
      buildTaskHistoryFilters({
        role,
        managerTaskMode,
        ownerId,
        currentActorId,
        method,
        priority,
        commercialType,
        query,
        clients: clientList,
        commercialItems,
      }),
    [
      role,
      managerTaskMode,
      ownerId,
      currentActorId,
      method,
      priority,
      commercialType,
      query,
      clientList,
      commercialItems,
    ],
  );

  const completedQuery = useTasksInboxHistory({
    view: "completed",
    filters: historyFilters,
    enabled: authReady && !historyBlocked,
  });
  const archivedQuery = useTasksInboxHistory({
    view: "archived",
    filters: historyFilters,
    enabled: authReady && !historyBlocked,
  });
  const completedRows = useMemo(
    () => (completedQuery.data?.pages ?? []).flatMap((p) => p.rows),
    [completedQuery.data],
  );
  const archivedRows = useMemo(
    () => (archivedQuery.data?.pages ?? []).flatMap((p) => p.rows),
    [archivedQuery.data],
  );
  const completedTotal = historyBlocked
    ? 0
    : (completedQuery.data?.pages[0]?.totalCount ?? 0);
  const archivedTotal = historyBlocked
    ? 0
    : (archivedQuery.data?.pages[0]?.totalCount ?? 0);

  const knownTasksById = useMemo(() => {
    return indexTasksInboxTasks([
      ...activeTasks,
      ...completedRows,
      ...archivedRows,
    ]);
  }, [activeTasks, completedRows, archivedRows]);

  // Filtered by common criteria (excluding view). Applied before view split so
  // per-view counts always reflect current filters.
  const commonFiltered = useMemo(() => {
    return filterTasksInboxRows(scopedTasks, {
      ownerId,
      method,
      priority,
      commercialType,
      query,
      clientsById,
      commercialItems,
    });
  }, [
    scopedTasks,
    ownerId,
    method,
    priority,
    commercialType,
    query,
    clientsById,
    commercialItems,
  ]);

  const viewCounts = useMemo(() => {
    return countTasksInboxViews(commonFiltered, {
      completedTotal,
      archivedTotal,
    });
  }, [commonFiltered, completedTotal, archivedTotal]);

  const filtered = useMemo(
    () =>
      commonFiltered.filter(
        (t) => viewForTask(t, Boolean(t.archived)) === activeView,
      ),
    [commonFiltered, activeView],
  );

  const grouped = useMemo(() => {
    return groupTasksInboxAgenda(filtered);
  }, [filtered]);

  const handleDone = async (t: Task) => {
    await markTasksInboxTaskDone({ task: t, queryClient, clientsById });
  };

  const handleSnooze = async (t: Task) => {
    await snoozeTasksInboxTask({ task: t, queryClient });
  };

  const handleUndo = (t: Task) => {
    setOpenTaskId(t.id);
    toast("Buka detail untuk mengaktifkan ulang task", {
      description: "Reopen wajib mengisi next action baru.",
    });
  };

  const handleArchive = async (t: Task) => {
    await archiveTasksInboxTask({ task: t, queryClient });
  };

  const handleUnarchive = async (t: Task) => {
    await unarchiveTasksInboxTask({ task: t, queryClient });
  };

  const handleCreateChildTask = async (
    t: Task,
    kind: "Quotation" | "Prototype",
  ) => {
    await createTasksInboxChildTask({
      task: t,
      kind,
      queryClient,
      clientsById,
    });
  };

  // "Waiting PO" isn't one of the 7 weighted stages (see
  // commercial-stages.ts) — it's the old pre-refactor name for what's now
  // "Commit", same mapping already applied to dashboard/report "waiting PO"
  // figures elsewhere. Opens the same next-action confirmation dialog
  // Pipeline's drag-and-drop uses, then moves through transition_commercial_
  // stage so the structured stage-event gets written (see comment on
  // waitingPoMove state above).
  const handleMoveWaitingPO = (t: Task) => {
    if (!t.commercialItemId) {
      toast.error("Task ini belum terhubung ke commercial item");
      return;
    }
    const ci = commercialItemsById[t.commercialItemId];
    if (!ci) {
      toast.error("Commercial item tidak ditemukan");
      return;
    }
    const client = clientsById[ci.clientId];
    setWaitingPoNextAction(`Follow-up stage Commit`);
    setWaitingPoNextDate(toLocalIsoDate(NOW));
    setWaitingPoTaskMode("existing_task");
    setWaitingPoTaskId(t.id);
    setWaitingPoMove({
      itemId: ci.id,
      fromStage: ci.stage,
      toStage: "Commit",
      clientName: client?.name ?? "-",
      currentNext: t.dueDate,
    });
  };

  async function confirmMoveWaitingPO() {
    if (!waitingPoMove) return;
    const moved = await confirmTasksInboxWaitingPoMove({
      waitingPoMove,
      waitingPoTaskMode,
      waitingPoTaskId,
      waitingPoNextAction,
      waitingPoNextDate,
      queryClient,
    });
    if (moved) {
      setWaitingPoMove(null);
    }
  }

  // -------------------------- Bulk actions --------------------------
  // Looks up across activeTasks + whatever history pages are loaded, not
  // just scopedTasks, so bulk actions still work on selected rows rendered
  // from the paginated Completed/Archived views.
  const selectedTasks = useMemo(
    () =>
      selectedTasksFromIds(selected, [
        ...activeTasks,
        ...completedRows,
        ...archivedRows,
      ]),
    [selected, activeTasks, completedRows, archivedRows],
  );
  const selectedIdList = useMemo(
    () => selectedTasks.map((t) => t.id),
    [selectedTasks],
  );

  const bulkDone = async () => {
    await bulkMarkTasksInboxDone({
      tasks: selectedTasks,
      queryClient,
      clearSelection,
    });
  };

  const bulkSnooze = async () => {
    await bulkSnoozeTasksInbox({
      tasks: selectedTasks,
      queryClient,
      clearSelection,
    });
  };

  const bulkChangeOwner = async (newOwnerId: string) => {
    await bulkChangeTasksInboxOwner({
      tasks: selectedTasks,
      newOwnerId,
      queryClient,
      profilesById,
      clearSelection,
    });
  };

  const handleOpen = (t: Task) => setOpenTaskId(t.id);
  const openTask = openTaskId ? (knownTasksById.get(openTaskId) ?? null) : null;
  const isManagerTeamExceptions =
    role === "manager" && managerTaskMode === "team-exceptions";
  const pageTitle =
    role === "manager"
      ? managerTaskMode === "team-exceptions"
        ? "Team Exceptions"
        : "My Tasks"
      : role === "executive"
        ? "Executive Exceptions"
        : role === "sales"
          ? "My Tasks"
          : "Team Tasks (read-only)";

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
            {pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isManagerTeamExceptions
              ? "Sales-owned task yang sudah melewati threshold eskalasi."
              : role === "executive"
                ? "Manager-owned task yang sudah tereskalasi. Detail bersifat read-only."
                : "Task & follow-up terhubung ke klien serta commercial item aktif."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {role === "manager" && (
            <ToggleGroup
              type="single"
              value={managerTaskMode}
              onValueChange={(v) => {
                if (v === "my-tasks" || v === "team-exceptions") {
                  setManagerTaskMode(v);
                }
              }}
              className="rounded-md border bg-card p-0.5"
            >
              <ToggleGroupItem
                value="my-tasks"
                className="h-8 gap-1.5 px-2.5 text-xs"
              >
                <Inbox className="h-3.5 w-3.5" /> My Tasks
              </ToggleGroupItem>
              <ToggleGroupItem
                value="team-exceptions"
                className="h-8 gap-1.5 px-2.5 text-xs data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Team Exceptions
                <span className="num rounded bg-muted px-1 text-[10px]">
                  {
                    filterManagerTeamExceptions(activeTasks, profilesById)
                      .length
                  }
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
          )}
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
              disabled={isHistoryView}
              title={
                isHistoryView
                  ? "Kalender tidak tersedia untuk Completed/Archived — riwayat dimuat bertahap, bukan sekaligus"
                  : undefined
              }
            >
              <CalendarDays className="h-3.5 w-3.5" /> Kalender
            </ToggleGroupItem>
          </ToggleGroup>
          {canEdit && <CreateTaskDialog role={role} />}
        </div>
      </header>

      <CalendarIncompleteWarning tasks={activeTasks} />

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
            <SelectTrigger className="h-9 w-full md:w-[170px]">
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

      {view === "agenda" && isHistoryView ? (
        <TaskHistorySection
          title={activeView === "completed" ? "Selesai" : "Diarsipkan"}
          tone={
            activeView === "completed"
              ? "text-success"
              : "text-muted-foreground"
          }
          totalCount={
            activeView === "completed" ? completedTotal : archivedTotal
          }
          rows={activeView === "completed" ? completedRows : archivedRows}
          isLoading={
            (activeView === "completed" ? completedQuery : archivedQuery)
              .isLoading
          }
          isFetchingNextPage={
            (activeView === "completed" ? completedQuery : archivedQuery)
              .isFetchingNextPage
          }
          hasNextPage={Boolean(
            (activeView === "completed" ? completedQuery : archivedQuery)
              .hasNextPage,
          )}
          onLoadMore={() =>
            void (
              activeView === "completed" ? completedQuery : archivedQuery
            ).fetchNextPage()
          }
          canEdit={canEdit}
          onDone={handleDone}
          onSnooze={handleSnooze}
          onUndo={handleUndo}
          onOpen={handleOpen}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onCreateChildTask={handleCreateChildTask}
          onMoveWaitingPO={handleMoveWaitingPO}
          onLogFollowUp={handleOpen}
          selected={selected}
          onToggleSelect={toggleSelected}
          clientsById={clientsById}
          profilesById={profilesById}
          commercialItemsById={commercialItemsById}
        />
      ) : view === "agenda" ? (
        <TasksAgendaView
          grouped={grouped}
          filteredCount={filtered.length}
          setBucketSelection={setBucketSelection}
          canEdit={canEdit}
          onDone={handleDone}
          onSnooze={handleSnooze}
          onUndo={handleUndo}
          onOpen={handleOpen}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onCreateChildTask={handleCreateChildTask}
          onMoveWaitingPO={handleMoveWaitingPO}
          onLogFollowUp={handleOpen}
          selected={selected}
          onToggleSelect={toggleSelected}
          clientsById={clientsById}
          profilesById={profilesById}
          commercialItemsById={commercialItemsById}
        />
      ) : (
        <TasksCalendarView
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
          onLogFollowUp={handleOpen}
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
      <PipelineStageMoveDialog
        pendingMove={waitingPoMove}
        pendingMoveItem={
          waitingPoMove ? commercialItemsById[waitingPoMove.itemId] : undefined
        }
        onOpenChange={(o) => !o && setWaitingPoMove(null)}
        tasks={activeTasks}
        nextActionInput={waitingPoNextAction}
        onNextActionInputChange={setWaitingPoNextAction}
        nextDateInput={waitingPoNextDate}
        onNextDateInputChange={setWaitingPoNextDate}
        taskMode={waitingPoTaskMode}
        onTaskModeChange={setWaitingPoTaskMode}
        taskIdInput={waitingPoTaskId}
        onTaskIdInputChange={setWaitingPoTaskId}
        collectsLostReason={false}
        lostReason=""
        onLostReasonChange={() => {}}
        lostReasonDetail=""
        onLostReasonDetailChange={() => {}}
        onCancel={() => setWaitingPoMove(null)}
        onConfirm={() => void confirmMoveWaitingPO()}
      />

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
            {!isManagerTeamExceptions && (
              <>
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
              </>
            )}
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
