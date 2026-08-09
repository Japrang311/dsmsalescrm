import { supabase } from "@/lib/supabase";
import type { Task, TaskWorkflowStatus, TaskCategory } from "@/lib/domain";
import {
  computeTaskDueState,
  listBusinessCalendarHolidays,
  todayInJakarta,
} from "@/lib/data/business-calendar";
import {
  encodePageCursor,
  normalizeListPageInput,
  type ListPageInput,
} from "@/lib/pagination-contracts";

type TaskRow = {
  id: string;
  client_id: string | null;
  owner_id: string;
  commercial_item_id: string | null;
  commercial_document_id: string | null;
  title: string;
  due_date: string;
  method: Task["method"];
  workflow_status: TaskWorkflowStatus;
  category: TaskCategory;
  next_action: string | null;
  next_action_date: string | null;
  cancellation_reason: string | null;
  priority: Task["priority"];
  archived: boolean;
};

type TaskControlLoopMetricsRow = {
  total_tasks: number;
  active_tasks: number;
  upcoming_tasks: number;
  today_tasks: number;
  overdue_tasks: number;
  escalated_tasks: number;
  done_tasks: number;
  cancelled_tasks: number;
  archived_tasks: number;
  calendar_incomplete_tasks: number;
};

export type TaskControlLoopMetrics = {
  totalTasks: number;
  activeTasks: number;
  upcomingTasks: number;
  todayTasks: number;
  overdueTasks: number;
  escalatedTasks: number;
  doneTasks: number;
  cancelledTasks: number;
  archivedTasks: number;
  calendarIncompleteTasks: number;
};

function toTask(
  row: TaskRow,
  holidays: ReadonlySet<string>,
  asOf: string,
): Task {
  const { dueState, calendarIncomplete } = computeTaskDueState(
    row.due_date,
    row.workflow_status,
    holidays,
    asOf,
  );
  return {
    id: row.id,
    clientId: row.client_id ?? undefined,
    ownerId: row.owner_id,
    commercialItemId:
      row.commercial_document_id ?? row.commercial_item_id ?? undefined,
    commercialDocumentId: row.commercial_document_id ?? undefined,
    title: row.title,
    dueDate: row.due_date,
    method: row.method,
    workflowStatus: row.workflow_status,
    dueState,
    calendarIncomplete,
    category: row.category,
    nextAction: row.next_action ?? undefined,
    nextActionDate: row.next_action_date ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    priority: row.priority,
    archived: row.archived,
  };
}

// No role/userId parameter, same reasoning as listClients(): RLS already
// scopes the rows to whatever the logged-in user can see. dueState is
// computed here with the same TypeScript mirror Task 4 proved identical
// to the database function (business-calendar.test.ts), fed by one
// holiday-table fetch shared across every row -- not N+1 RPC calls.
export async function listTasks(): Promise<Task[]> {
  const [{ data, error }, holidays] = await Promise.all([
    supabase.from("tasks").select("*"),
    listBusinessCalendarHolidays(),
  ]);
  if (error) throw error;
  const asOf = todayInJakarta();
  return (data ?? []).map((row) => toTask(row, holidays, asOf));
}

// Same RLS reasoning as listTasks(), scoped to the "still open" working set
// (not archived, not Done/Cancelled) -- used by the Tasks Inbox page's
// Today/Upcoming/Overdue views, which never include Done/Cancelled/archived
// rows by construction (see bucketFor/viewForTask). Completed and Archived
// history is bounded/paginated separately via listTasksPage() so this fetch
// doesn't grow with historical task volume. Other callers needing the full
// history (Dashboard metrics, Pipeline/Client/Commercial follow-up context)
// keep using listTasks().
export async function listActiveTasks(): Promise<Task[]> {
  const [{ data, error }, holidays] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("archived", false)
      .neq("workflow_status", "Done")
      .neq("workflow_status", "Cancelled"),
    listBusinessCalendarHolidays(),
  ]);
  if (error) throw error;
  const asOf = todayInJakarta();
  return (data ?? []).map((row) => toTask(row, holidays, asOf));
}

export async function getTaskControlLoopMetrics(): Promise<TaskControlLoopMetrics> {
  const { data, error } = await supabase.rpc("task_control_loop_metrics");
  if (error) throw error;

  const [row] = (data ?? []) as TaskControlLoopMetricsRow[];
  return {
    totalTasks: row?.total_tasks ?? 0,
    activeTasks: row?.active_tasks ?? 0,
    upcomingTasks: row?.upcoming_tasks ?? 0,
    todayTasks: row?.today_tasks ?? 0,
    overdueTasks: row?.overdue_tasks ?? 0,
    escalatedTasks: row?.escalated_tasks ?? 0,
    doneTasks: row?.done_tasks ?? 0,
    cancelledTasks: row?.cancelled_tasks ?? 0,
    archivedTasks: row?.archived_tasks ?? 0,
    calendarIncompleteTasks: row?.calendar_incomplete_tasks ?? 0,
  };
}

export type TaskPatch = Partial<{
  title: string;
  dueDate: string;
  method: Task["method"];
  category: TaskCategory;
  priority: Task["priority"];
  ownerId: string;
  archived: boolean;
}>;

// workflowStatus, nextAction, nextActionDate, and cancellationReason are
// deliberately not patchable here (Task 6 acceptance criterion: "direct
// multi-write progress code is no longer exported for UI use") -- those
// go exclusively through recordTaskProgress() in
// src/lib/data/task-progress.ts, the one atomic RPC. category is a plain
// correction field (same tier as title/priority), not a progress field,
// so it stays here.
export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.method !== undefined) update.method = patch.method;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.ownerId !== undefined) update.owner_id = patch.ownerId;
  if (patch.archived !== undefined) update.archived = patch.archived;

  const [{ data, error }, holidays] = await Promise.all([
    supabase.from("tasks").update(update).eq("id", id).select("*").single(),
    listBusinessCalendarHolidays(),
  ]);
  if (error) throw error;
  return toTask(data, holidays, todayInJakarta());
}

export function describeTaskChanges(
  changes: { field: string; from?: string; to?: string }[],
): string {
  return changes
    .map((c) => `${c.field}: ${c.from ?? "-"} → ${c.to ?? "-"}`)
    .join(" · ");
}

export async function createTask(input: {
  clientId?: string;
  ownerId: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  title: string;
  dueDate: string;
  method: Task["method"];
  priority: Task["priority"];
  category?: TaskCategory;
}): Promise<Task> {
  const [{ data, error }, holidays] = await Promise.all([
    supabase
      .from("tasks")
      .insert({
        client_id: input.clientId ?? null,
        owner_id: input.ownerId,
        commercial_item_id: input.commercialItemId,
        commercial_document_id: input.commercialDocumentId,
        title: input.title,
        due_date: input.dueDate,
        method: input.method,
        priority: input.priority,
        ...(input.category !== undefined ? { category: input.category } : {}),
      })
      .select("*")
      .single(),
    listBusinessCalendarHolidays(),
  ]);
  if (error) throw error;
  return toTask(data, holidays, todayInJakarta());
}

// Backing the Tasks Inbox page's Completed/Archived history views. These two
// views are the only ones that grow without bound over time (Today/Upcoming/
// Overdue are self-limiting -- they only ever hold a team's current open
// follow-ups), so they're the ones that get server-side keyset pagination;
// see the Stage 3 pagination checklist decision. "completed" means not
// archived and workflow_status is Done/Cancelled (the same predicate the
// client-side bucketFor()/viewForTask() use); "archived" means archived =
// true regardless of status.
export type TaskHistoryView = "completed" | "archived";

export type TaskListFilters = {
  ownerId?: string;
  method?: Task["method"];
  priority?: Task["priority"];
  search?: string;
  // Resolved client-name matches for `search`, computed by the caller from
  // its already-loaded client list -- this module has no client table
  // knowledge of its own, same reasoning as other data modules keeping
  // cross-table joins out of their row shape.
  clientIds?: string[];
  // Resolved commercial-item matches for the UI's commercial-type filter;
  // "none" means "task has no linked commercial item at all".
  commercialItemIds?: string[] | "none";
};

export type TaskRowsPage = {
  rows: Task[];
  totalCount: number;
  nextCursor: string | null;
};

export async function listTasksPage(input: {
  view: TaskHistoryView;
  filters?: TaskListFilters;
  page?: ListPageInput;
}): Promise<TaskRowsPage> {
  const filters = input.filters ?? {};
  const page = normalizeListPageInput(input.page);

  let query = supabase
    .from("tasks")
    .select("*", { count: "exact" })
    .order("due_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(page.pageSize + 1);

  query =
    input.view === "completed"
      ? query.eq("archived", false).in("workflow_status", ["Done", "Cancelled"])
      : query.eq("archived", true);

  if (filters.ownerId) {
    query = query.eq("owner_id", filters.ownerId);
  }
  if (filters.method) {
    query = query.eq("method", filters.method);
  }
  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  if (filters.commercialItemIds === "none") {
    query = query
      .is("commercial_document_id", null)
      .is("commercial_item_id", null);
  } else if (
    filters.commercialItemIds &&
    filters.commercialItemIds.length > 0
  ) {
    const list = filters.commercialItemIds.join(",");
    query = query.or(
      `commercial_document_id.in.(${list}),commercial_item_id.in.(${list})`,
    );
  }

  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replaceAll("%", "\\%").replaceAll(",", "\\,");
    const clauses = [`title.ilike.%${escaped}%`];
    if (filters.clientIds && filters.clientIds.length > 0) {
      clauses.push(`client_id.in.(${filters.clientIds.join(",")})`);
    }
    query = query.or(clauses.join(","));
  }

  if (page.cursor) {
    query = query.or(
      `due_date.gt.${page.cursor.sortValue},and(due_date.eq.${page.cursor.sortValue},id.gt.${page.cursor.id})`,
    );
  }

  const [{ data, error, count }, holidays] = await Promise.all([
    query,
    listBusinessCalendarHolidays(),
  ]);
  if (error) throw error;

  const asOf = todayInJakarta();
  const rawRows = (data ?? []) as TaskRow[];
  const pageRows = rawRows.slice(0, page.pageSize);
  const lastRow = pageRows.at(-1);

  return {
    rows: pageRows.map((row) => toTask(row, holidays, asOf)),
    totalCount: count ?? pageRows.length,
    nextCursor:
      rawRows.length > page.pageSize && lastRow
        ? encodePageCursor({ sortValue: lastRow.due_date, id: lastRow.id })
        : null,
  };
}
