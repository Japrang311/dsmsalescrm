import { describe, expect, test } from "bun:test";
import type { Task, TaskDueState, TaskWorkflowStatus } from "@/lib/domain";
import { computeTaskDueState } from "./business-calendar";
import {
  filterExecutiveTaskExceptions,
  filterManagerMyTasks,
  filterManagerTeamExceptions,
} from "./task-exceptions";

function task(
  id: string,
  ownerId: string,
  workflowStatus: TaskWorkflowStatus,
  dueState: TaskDueState,
  archived = false,
): Task {
  return {
    id,
    ownerId,
    title: id,
    dueDate: "2026-07-20",
    method: "Phone",
    workflowStatus,
    dueState,
    calendarIncomplete: false,
    category: "Follow-Up",
    priority: "Normal",
    archived,
  };
}

function dueState(
  dueDate: string,
  workflowStatus: TaskWorkflowStatus,
  asOf: string,
  holidays: string[] = [],
): TaskDueState {
  return computeTaskDueState(dueDate, workflowStatus, new Set(holidays), asOf)
    .dueState;
}

const ownersById = {
  "sales-1": { name: "Sales One", initials: "S1", role: "sales" },
  "sales-2": { name: "Sales Two", initials: "S2", role: "sales" },
  "manager-1": { name: "Manager One", initials: "M1", role: "manager" },
  "executive-1": { name: "Executive", initials: "EX", role: "executive" },
} as const;

describe("manager task selectors", () => {
  test("Manager My Tasks contains only Manager-owned Task records", () => {
    const tasks = [
      task("manager-owned-open", "manager-1", "Open", "Today"),
      task("manager-owned-escalated", "manager-1", "Open", "Escalated"),
      task("sales-owned-escalated", "sales-1", "Open", "Escalated"),
    ];

    expect(filterManagerMyTasks(tasks, "manager-1").map((t) => t.id)).toEqual([
      "manager-owned-open",
      "manager-owned-escalated",
    ]);
  });

  test("Team Exceptions contains only active Sales-owned escalated tasks", () => {
    const tasks = [
      task("pre-threshold", "sales-1", "Open", "Overdue"),
      task("threshold", "sales-1", "Open", "Escalated"),
      task(
        "waiting-external-threshold",
        "sales-2",
        "Waiting External",
        "Escalated",
      ),
      task("resolved", "sales-1", "Done", null),
      task("cancelled", "sales-1", "Cancelled", null),
      task("archived", "sales-1", "Open", "Escalated", true),
      task("manager-owned", "manager-1", "Open", "Escalated"),
      task("executive-owned", "executive-1", "Open", "Escalated"),
    ];

    expect(
      filterManagerTeamExceptions(tasks, ownersById).map((t) => t.id),
    ).toEqual(["threshold", "waiting-external-threshold"]);
  });

  test("Team Exceptions respects business-day holiday threshold from centralized due-state", () => {
    const holiday = "2026-07-21";
    const salesPreThreshold = task(
      "holiday-pre-threshold",
      "sales-1",
      "Open",
      dueState("2026-07-20", "Open", "2026-07-23", [holiday]),
    );
    const salesThreshold = task(
      "holiday-threshold",
      "sales-1",
      "Open",
      dueState("2026-07-20", "Open", "2026-07-24", [holiday]),
    );

    expect(salesPreThreshold.dueState).toBe("Overdue");
    expect(salesThreshold.dueState).toBe("Escalated");
    expect(
      filterManagerTeamExceptions(
        [salesPreThreshold, salesThreshold],
        ownersById,
      ).map((t) => t.id),
    ).toEqual(["holiday-threshold"]);
  });
});

describe("executive task selectors", () => {
  test("Executive Exceptions contains only active Manager-owned escalated tasks", () => {
    const tasks = [
      task("manager-threshold", "manager-1", "Open", "Escalated"),
      task(
        "manager-waiting-external",
        "manager-1",
        "Waiting External",
        "Escalated",
      ),
      task("manager-pre-threshold", "manager-1", "Open", "Overdue"),
      task("sales-threshold", "sales-1", "Open", "Escalated"),
      task("manager-done", "manager-1", "Done", null),
      task("manager-cancelled", "manager-1", "Cancelled", null),
      task("manager-archived", "manager-1", "Open", "Escalated", true),
    ];

    expect(
      filterExecutiveTaskExceptions(tasks, ownersById).map((t) => t.id),
    ).toEqual(["manager-threshold", "manager-waiting-external"]);
  });
});
