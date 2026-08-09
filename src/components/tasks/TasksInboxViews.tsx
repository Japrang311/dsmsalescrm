import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Info,
  Inbox,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  PackageCheck,
  Phone,
  PhoneCall,
  Undo2,
  Users,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { NOW, type Role, type Task } from "@/lib/domain";
import { formatDateShort, formatRupiahShort } from "@/lib/format";
import {
  bucketForTask,
  type TasksInboxBucket as Bucket,
  type TasksInboxClientLookup as ClientLookup,
  type TasksInboxCommercialLookup as CommercialLookup,
} from "@/lib/tasks-inbox-controller";
import { cn } from "@/lib/utils";

const TASKS_INBOX_BUCKET_META: Record<Bucket, { title: string; tone: string }> =
  {
    overdue: { title: "Overdue", tone: "text-destructive" },
    today: { title: "Hari ini", tone: "text-primary" },
    week: { title: "Minggu ini", tone: "text-foreground" },
    later: { title: "Nanti", tone: "text-muted-foreground" },
    done: { title: "Selesai", tone: "text-success" },
  };

type ProfileLookup = Record<
  string,
  { name: string; initials: string; role?: Role }
>;

type TaskActionProps = {
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
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  clientsById: ClientLookup;
  profilesById: ProfileLookup;
  commercialItemsById: CommercialLookup;
};

const METHOD_ICON = {
  Phone,
  Email: Mail,
  WhatsApp: MessageSquare,
  Visit: MapPin,
  Meeting: Users,
} as const;

// Advisory aging: how many days since the task became overdue, or until due.
function agingDays(task: Task) {
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const dueDate = new Date(task.dueDate);
  const due = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

export function TasksAgendaView({
  grouped,
  filteredCount,
  setBucketSelection,
  ...taskActions
}: TaskActionProps & {
  grouped: Record<Bucket, Task[]>;
  filteredCount: number;
  setBucketSelection: (ids: string[], on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {(["overdue", "today", "week", "later"] as Bucket[]).map((b) => {
        const rows = grouped[b];
        if (rows.length === 0) return null;
        const meta = TASKS_INBOX_BUCKET_META[b];
        const ids = rows.map((r) => r.id);
        const allSelected =
          ids.length > 0 && ids.every((id) => taskActions.selected.has(id));
        const someSelected =
          !allSelected && ids.some((id) => taskActions.selected.has(id));

        return (
          <Card key={b} className="border-border shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className={`flex items-center gap-2 text-sm font-semibold ${meta.tone}`}
              >
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={(v) => setBucketSelection(ids, v === true)}
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
                    {...taskActions}
                    selected={taskActions.selected.has(task.id)}
                    onToggleSelect={
                      taskActions.canEdit
                        ? taskActions.onToggleSelect
                        : undefined
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {filteredCount === 0 && (
        <EmptyState
          className="py-12"
          icon={Inbox}
          title="Inbox kosong"
          description="Tidak ada task yang cocok dengan filter saat ini."
        />
      )}
    </div>
  );
}

// Completed/Archived history: server-paginated (listTasksPage()), loaded in
// bounded pages and appended on scroll via an IntersectionObserver sentinel,
// same "load more on scroll" pattern as the Activity Log feed.
export function TaskHistorySection({
  title,
  tone,
  totalCount,
  rows,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  ...taskActions
}: TaskActionProps & {
  title: string;
  tone: string;
  totalCount: number;
  rows: Task[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting) && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Memuat riwayat…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        className="py-12"
        icon={Inbox}
        title="Belum ada riwayat"
        description="Tidak ada task yang cocok dengan filter saat ini."
      />
    );
  }

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle
          className={`flex items-center gap-2 text-sm font-semibold ${tone}`}
        >
          {title}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {totalCount}
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
              {...taskActions}
              selected={taskActions.selected.has(task.id)}
              onToggleSelect={
                taskActions.canEdit ? taskActions.onToggleSelect : undefined
              }
            />
          ))}
        </ul>
        <div ref={sentinelRef} className="h-px" />
        {isFetchingNextPage && (
          <div className="py-3 text-center text-xs text-muted-foreground">
            Memuat lebih banyak…
          </div>
        )}
        {!hasNextPage && (
          <div className="py-3 text-center text-[11px] text-muted-foreground">
            Semua task ditampilkan.
          </div>
        )}
      </CardContent>
    </Card>
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
}: Omit<TaskActionProps, "selected" | "onToggleSelect"> & {
  task: Task;
  isArchived: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const client = task.clientId ? clientsById[task.clientId] : undefined;
  const commercial = task.commercialItemId
    ? commercialItemsById[task.commercialItemId]
    : undefined;
  const owner = profilesById[task.ownerId];
  const Icon = METHOD_ICON[task.method];
  const isDone = bucketForTask(task) === "done";
  const isOverdueRow = bucketForTask(task) === "overdue";
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
                      <PackageCheck className="mr-2 h-4 w-4" /> Move to Commit
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

export function TasksCalendarView({
  tasks,
  month,
  onPrev,
  onNext,
  onToday,
  ...taskActions
}: TaskActionProps & {
  tasks: Task[];
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const [selectedISO, setSelectedISO] = useState<string | null>(isoDay(NOW));

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
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
              (t) =>
                t.workflowStatus !== "Done" &&
                t.workflowStatus !== "Cancelled" &&
                iso < todayISO,
            );
            const done =
              dayTasks.length > 0 &&
              dayTasks.every(
                (t) =>
                  t.workflowStatus === "Done" ||
                  t.workflowStatus === "Cancelled",
              );
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
                          t.workflowStatus === "Done" ||
                            t.workflowStatus === "Cancelled"
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
            <EmptyState description="Tidak ada task pada tanggal ini." />
          ) : (
            <ul className="divide-y divide-border">
              {selectedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isArchived={Boolean(task.archived)}
                  {...taskActions}
                  selected={taskActions.selected.has(task.id)}
                  onToggleSelect={
                    taskActions.canEdit ? taskActions.onToggleSelect : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
