import { describe, expect, test } from "bun:test";
import type { CommercialItem, Task } from "@/lib/domain";
import {
  TASKS_INBOX_INVALIDATION_PREFIXES,
  TASKS_INBOX_QUERY_KEYS,
  bucketForTask,
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
} from "@/lib/tasks-inbox-controller";

const clientsById = {
  "client-1": { id: "client-1", name: "PT Alpha" },
  "client-2": { id: "client-2", name: "CV Beta" },
} as const;

const commercialItems: CommercialItem[] = [
  commercialItem({ id: "quo-1", type: "Quotation" }),
  commercialItem({ id: "so-1", type: "Sales Order" }),
];

function task(patch: Partial<Task>): Task {
  return {
    id: "task-base",
    clientId: "client-1",
    ownerId: "owner-1",
    commercialItemId: "quo-1",
    title: "Follow up Alpha",
    dueDate: "2026-07-27",
    method: "Phone",
    workflowStatus: "Open",
    dueState: "Today",
    calendarIncomplete: false,
    category: "Follow-Up",
    priority: "Normal",
    ...patch,
  };
}

function commercialItem(patch: Partial<CommercialItem>): CommercialItem {
  return {
    id: "commercial-base",
    clientId: "client-1",
    ownerId: "owner-1",
    type: "Quotation",
    sourceFlow: "New Product",
    stage: "Quotes Sent",
    description: "Commercial item",
    estimatedValue: 1000,
    updatedAt: "2026-07-27",
    ...patch,
  };
}

describe("TasksInboxPage pure behavior", () => {
  test("maps due-state and archive semantics into stable inbox views", () => {
    expect(bucketForTask(task({ id: "today", dueState: "Today" }))).toBe(
      "today",
    );
    expect(viewForTask(task({ id: "escalated", dueState: "Escalated" }))).toBe(
      "overdue",
    );
    expect(
      viewForTask(
        task({
          id: "done",
          workflowStatus: "Done",
          dueState: null,
        }),
      ),
    ).toBe("completed");
    expect(viewForTask(task({ id: "archived", archived: true }))).toBe(
      "archived",
    );
  });

  test("filters by owner, method, priority, commercial type, and client-name search", () => {
    const rows = [
      task({ id: "match-alpha", title: "Call procurement" }),
      task({ id: "wrong-owner", ownerId: "owner-2" }),
      task({ id: "wrong-method", method: "Email" }),
      task({ id: "wrong-priority", priority: "Low" }),
      task({ id: "wrong-commercial", commercialItemId: "so-1" }),
      task({ id: "client-search-match", clientId: "client-2", title: "Visit" }),
      task({
        id: "without-commercial",
        commercialItemId: undefined,
        title: "Standalone",
      }),
    ];

    expect(
      filterTasksInboxRows(rows, {
        ownerId: "owner-1",
        method: "Phone",
        priority: "Normal",
        commercialType: "Quotation",
        query: "alpha",
        clientsById,
        commercialItems,
      }).map((row) => row.id),
    ).toEqual(["match-alpha"]);

    expect(
      filterTasksInboxRows(rows, {
        ownerId: "all",
        method: "all",
        priority: "all",
        commercialType: "none",
        query: "standalone",
        clientsById,
        commercialItems,
      }).map((row) => row.id),
    ).toEqual(["without-commercial"]);
  });

  test("counts views with server totals for history while grouping agenda rows by date", () => {
    const rows = [
      task({ id: "later", dueDate: "2026-08-20", dueState: "Upcoming" }),
      task({ id: "today-b", dueDate: "2026-07-27", dueState: "Today" }),
      task({ id: "today-a", dueDate: "2026-07-26", dueState: "Today" }),
      task({ id: "overdue", dueDate: "2026-07-20", dueState: "Overdue" }),
    ];

    expect(
      countTasksInboxViews(rows, {
        completedTotal: 7,
        archivedTotal: 3,
      }),
    ).toEqual({
      today: 2,
      upcoming: 1,
      overdue: 1,
      completed: 7,
      archived: 3,
    });
    expect(groupTasksInboxAgenda(rows).today.map((row) => row.id)).toEqual([
      "today-a",
      "today-b",
    ]);
  });

  test("builds completed/archived history filters with manager blocking semantics", () => {
    expect(
      isTaskHistoryBlocked({
        role: "manager",
        managerTaskMode: "team-exceptions",
        ownerId: "all",
        currentActorId: "manager-1",
      }),
    ).toBe(true);
    expect(
      isTaskHistoryBlocked({
        role: "manager",
        managerTaskMode: "my-tasks",
        ownerId: "owner-2",
        currentActorId: "manager-1",
      }),
    ).toBe(true);

    expect(
      buildTaskHistoryFilters({
        role: "manager",
        managerTaskMode: "my-tasks",
        ownerId: "all",
        currentActorId: "manager-1",
        method: "Phone",
        priority: "all",
        commercialType: "Sales Order",
        query: "Beta",
        clients: Object.values(clientsById),
        commercialItems,
      }),
    ).toEqual({
      ownerId: "manager-1",
      method: "Phone",
      search: "Beta",
      clientIds: ["client-2"],
      commercialItemIds: ["so-1"],
    });
  });

  test("resolves selected task ids from active and history rows without leaking unknown ids", () => {
    const active = task({ id: "active" });
    const completed = task({ id: "completed", workflowStatus: "Done" });

    expect(
      selectedTasksFromIds(new Set(["completed", "missing", "active"]), [
        active,
        completed,
      ]).map((row) => row.id),
    ).toEqual(["completed", "active"]);
  });

  test("indexes route lookup maps without changing row identity", () => {
    const commercial = commercialItem({ id: "commercial-1" });
    const row = task({ id: "task-1" });

    expect(indexTasksInboxClients(Object.values(clientsById))["client-1"]).toBe(
      clientsById["client-1"],
    );
    expect(indexTasksInboxCommercialItems([commercial])["commercial-1"]).toBe(
      commercial,
    );
    expect(indexTasksInboxTasks([row]).get("task-1")).toBe(row);
  });

  test("records exact query keys and invalidation prefixes used by the route", () => {
    expect(TASKS_INBOX_QUERY_KEYS.activeTasks).toEqual(["tasks", "active"]);
    expect(TASKS_INBOX_QUERY_KEYS.currentActorId).toEqual([
      "profiles",
      "current-actor-id",
    ]);
    expect(TASKS_INBOX_QUERY_KEYS.clientsAll).toEqual(["clients", "all"]);
    expect(TASKS_INBOX_QUERY_KEYS.owners).toEqual(["profiles", "owners"]);
    expect(TASKS_INBOX_QUERY_KEYS.salesTeam).toEqual([
      "profiles",
      "sales-team",
    ]);
    expect(TASKS_INBOX_QUERY_KEYS.commercialItemsAll).toEqual([
      "commercial-items",
      "all",
    ]);
    expect(TASKS_INBOX_INVALIDATION_PREFIXES.defaultTaskMutation).toEqual([
      ["tasks"],
      ["activity-log"],
    ]);
    expect(TASKS_INBOX_INVALIDATION_PREFIXES.waitingPoMove).toEqual([
      ["commercial-items"],
      ["commercial-documents"],
      ["tasks"],
      ["follow-ups"],
      ["activity-log"],
    ]);
  });
});
