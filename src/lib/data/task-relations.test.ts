import { describe, expect, test } from "bun:test";
import type { Task } from "@/lib/domain";
import {
  activeClientTasks,
  activeCommercialTasks,
  clientRelatedTasks,
  commercialRelatedTasks,
} from "@/lib/data/task-relations";

const baseTask: Task = {
  id: "task-base",
  clientId: "client-1",
  ownerId: "sales-1",
  title: "Base",
  dueDate: "2026-07-27",
  method: "Phone",
  status: "Upcoming",
  workflowStatus: "Open",
  dueState: "Today",
  calendarIncomplete: false,
  category: "Follow-Up",
  priority: "Normal",
};

function task(patch: Partial<Task>): Task {
  return { ...baseTask, ...patch };
}

describe("task relation selectors", () => {
  test("keeps standalone tasks valid while Client Detail shows only client-related tasks", () => {
    const rows = [
      task({ id: "client-task", clientId: "client-1" }),
      task({ id: "standalone-task", clientId: undefined }),
      task({ id: "other-client-task", clientId: "client-2" }),
    ];

    expect(clientRelatedTasks(rows, "client-1").map((row) => row.id)).toEqual([
      "client-task",
    ]);
  });

  test("commercial detail uses explicit commercial links, not every client task", () => {
    const rows = [
      task({
        id: "commercial-document-task",
        clientId: "client-1",
        commercialDocumentId: "commercial-1",
      }),
      task({
        id: "commercial-item-task",
        clientId: "client-1",
        commercialItemId: "commercial-1",
      }),
      task({ id: "client-only-task", clientId: "client-1" }),
    ];

    expect(
      commercialRelatedTasks(rows, "commercial-1").map((row) => row.id),
    ).toEqual(["commercial-document-task", "commercial-item-task"]);
  });

  test("active selectors use workflow status and archive semantics", () => {
    const rows = [
      task({ id: "active", workflowStatus: "Waiting External" }),
      task({ id: "done", workflowStatus: "Done", dueState: null }),
      task({ id: "cancelled", workflowStatus: "Cancelled", dueState: null }),
      task({ id: "archived", archived: true }),
    ];

    expect(activeClientTasks(rows, "client-1").map((row) => row.id)).toEqual([
      "active",
    ]);
    expect(activeCommercialTasks(rows, "missing")).toEqual([]);
  });
});
