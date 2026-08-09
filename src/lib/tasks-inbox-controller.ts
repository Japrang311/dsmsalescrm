import type { CommercialItem, Role, Task } from "@/lib/domain";
import { NOW } from "@/lib/domain";
import type { TaskListFilters } from "@/lib/data/tasks";

export type TasksInboxViewKey =
  "today" | "upcoming" | "overdue" | "completed" | "archived";
export type TasksInboxBucket = "overdue" | "today" | "week" | "later" | "done";
export type TasksInboxManagerMode = "my-tasks" | "team-exceptions";
export type TasksInboxAgendaView = "agenda" | "calendar";
export type TasksInboxMethodFilter = Task["method"] | "all";
export type TasksInboxPriorityFilter = Task["priority"] | "all";
export type TasksInboxCommercialFilter =
  CommercialItem["type"] | "none" | "all";
export type TasksInboxClientLookup = Record<
  string,
  { id: string; name: string }
>;
export type TasksInboxCommercialLookup = Record<string, CommercialItem>;

export const TASKS_INBOX_QUERY_KEYS = {
  activeTasks: ["tasks", "active"],
  currentActorId: ["profiles", "current-actor-id"],
  clientsAll: ["clients", "all"],
  owners: ["profiles", "owners"],
  salesTeam: ["profiles", "sales-team"],
  commercialItemsAll: ["commercial-items", "all"],
} as const;

export const TASKS_INBOX_INVALIDATION_PREFIXES = {
  defaultTaskMutation: [["tasks"], ["activity-log"]],
  waitingPoMove: [
    ["commercial-items"],
    ["commercial-documents"],
    ["tasks"],
    ["follow-ups"],
    ["activity-log"],
  ],
} as const;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function bucketForTask(task: Task): TasksInboxBucket {
  if (
    task.workflowStatus === "Done" ||
    task.workflowStatus === "Cancelled" ||
    task.dueState === null
  ) {
    return "done";
  }
  if (task.dueState === "Overdue" || task.dueState === "Escalated") {
    return "overdue";
  }
  if (task.dueState === "Today") return "today";
  if (task.dueState === "Upcoming") {
    const today = startOfDay(NOW);
    const due = startOfDay(new Date(task.dueDate));
    const weekEnd = today + 7 * 86_400_000;
    return due <= weekEnd ? "week" : "later";
  }
  const today = startOfDay(NOW);
  const due = startOfDay(new Date(task.dueDate));
  if (due < today) return "overdue";
  if (due === today) return "today";
  const weekEnd = today + 7 * 86_400_000;
  if (due <= weekEnd) return "week";
  return "later";
}

export function viewForTask(
  task: Task,
  archived = Boolean(task.archived),
): TasksInboxViewKey {
  if (archived) return "archived";
  const bucket = bucketForTask(task);
  if (bucket === "done") return "completed";
  if (bucket === "overdue") return "overdue";
  if (bucket === "today") return "today";
  return "upcoming";
}

export function filterTasksInboxRows(
  tasks: readonly Task[],
  input: {
    ownerId: string;
    method: TasksInboxMethodFilter;
    priority: TasksInboxPriorityFilter;
    commercialType: TasksInboxCommercialFilter;
    query: string;
    clientsById: TasksInboxClientLookup;
    commercialItems: readonly Pick<CommercialItem, "id" | "type">[];
  },
): Task[] {
  const q = input.query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (input.ownerId !== "all" && task.ownerId !== input.ownerId) return false;
    if (input.method !== "all" && task.method !== input.method) return false;
    if (input.priority !== "all" && task.priority !== input.priority) {
      return false;
    }
    if (input.commercialType !== "all") {
      if (input.commercialType === "none") {
        if (task.commercialItemId) return false;
      } else {
        const item = task.commercialItemId
          ? input.commercialItems.find((c) => c.id === task.commercialItemId)
          : undefined;
        if (!item || item.type !== input.commercialType) return false;
      }
    }
    if (q) {
      const client = task.clientId
        ? input.clientsById[task.clientId]
        : undefined;
      const hay = `${task.title} ${client?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function countTasksInboxViews(
  tasks: readonly Task[],
  input: { completedTotal: number; archivedTotal: number },
): Record<TasksInboxViewKey, number> {
  const counts: Record<TasksInboxViewKey, number> = {
    today: 0,
    upcoming: 0,
    overdue: 0,
    completed: 0,
    archived: 0,
  };
  for (const task of tasks) counts[viewForTask(task)]++;
  counts.completed = input.completedTotal;
  counts.archived = input.archivedTotal;
  return counts;
}

export function groupTasksInboxAgenda(
  tasks: readonly Task[],
): Record<TasksInboxBucket, Task[]> {
  const grouped: Record<TasksInboxBucket, Task[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    done: [],
  };
  for (const task of tasks) grouped[bucketForTask(task)].push(task);
  const byDate = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate);
  (Object.keys(grouped) as TasksInboxBucket[]).forEach((key) =>
    grouped[key].sort(byDate),
  );
  return grouped;
}

export function isTaskHistoryBlocked(input: {
  role: Role;
  managerTaskMode: TasksInboxManagerMode;
  ownerId: string;
  currentActorId?: string;
}): boolean {
  if (
    input.role === "executive" ||
    (input.role === "manager" && input.managerTaskMode === "team-exceptions")
  ) {
    return true;
  }
  if (
    input.role === "manager" &&
    input.managerTaskMode === "my-tasks" &&
    input.ownerId !== "all" &&
    input.ownerId !== input.currentActorId
  ) {
    return true;
  }
  return (
    input.role === "manager" &&
    input.managerTaskMode === "my-tasks" &&
    !input.currentActorId
  );
}

export function buildTaskHistoryFilters(input: {
  role: Role;
  managerTaskMode: TasksInboxManagerMode;
  ownerId: string;
  currentActorId?: string;
  method: TasksInboxMethodFilter;
  priority: TasksInboxPriorityFilter;
  commercialType: TasksInboxCommercialFilter;
  query: string;
  clients: readonly { id: string; name: string }[];
  commercialItems: readonly Pick<CommercialItem, "id" | "type">[];
}): TaskListFilters {
  const effectiveOwnerId =
    input.role === "manager" && input.managerTaskMode === "my-tasks"
      ? (input.ownerId !== "all" ? input.ownerId : input.currentActorId) ||
        undefined
      : input.ownerId !== "all"
        ? input.ownerId
        : undefined;
  const q = input.query.trim();
  const lowerQuery = q.toLowerCase();
  const clientIds = lowerQuery
    ? input.clients
        .filter((client) => client.name.toLowerCase().includes(lowerQuery))
        .map((client) => client.id)
    : undefined;
  const commercialItemIds =
    input.commercialType === "all"
      ? undefined
      : input.commercialType === "none"
        ? "none"
        : input.commercialItems
            .filter((item) => item.type === input.commercialType)
            .map((item) => item.id);

  return {
    ownerId: effectiveOwnerId,
    method: input.method !== "all" ? input.method : undefined,
    priority: input.priority !== "all" ? input.priority : undefined,
    search: q || undefined,
    clientIds,
    commercialItemIds,
  };
}

export function selectedTasksFromIds(
  selected: ReadonlySet<string>,
  tasks: readonly Task[],
): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return [...selected]
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task));
}

export function indexTasksInboxClients(
  clients: readonly { id: string; name: string }[],
): TasksInboxClientLookup {
  const map: TasksInboxClientLookup = {};
  for (const client of clients) map[client.id] = client;
  return map;
}

export function indexTasksInboxCommercialItems(
  commercialItems: readonly CommercialItem[],
): TasksInboxCommercialLookup {
  const map: TasksInboxCommercialLookup = {};
  for (const item of commercialItems) map[item.id] = item;
  return map;
}

export function indexTasksInboxTasks(
  tasks: readonly Task[],
): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]));
}
