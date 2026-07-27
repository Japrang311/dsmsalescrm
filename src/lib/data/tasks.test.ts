// Exercises the real src/lib/data/tasks.ts module end-to-end against the
// local Supabase stack — proves the module itself works, not just the raw
// RLS mechanics (already covered by supabase/tests/tasks.test.ts).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import {
  listTasks,
  getTaskControlLoopMetrics,
  updateTask,
  createTask,
} from "./tasks";
import { recordTaskProgress } from "./task-progress";
import { supabase } from "@/lib/supabase";

let fixtures: RoleFixtureUsers;
let taskId: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;

  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: anyClient.id,
      owner_id: fixtures.sales.id,
      title: "Data-layer fixture task",
      due_date: "2026-07-17",
      method: "Phone",
    })
    .select("id")
    .single();
  if (error) throw error;
  taskId = data.id;
});

afterAll(async () => {
  await adminClient.from("activity_log").delete().eq("task_id", taskId);
  await adminClient.from("follow_up_logs").delete().eq("task_id", taskId);
  await adminClient.from("tasks").delete().eq("id", taskId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("src/lib/data/tasks.ts", () => {
  test("listTasks() returns only the signed-in sales user's own tasks", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const tasks = await listTasks();
    expect(tasks.some((t) => t.id === taskId)).toBe(true);
    expect(tasks.every((t) => t.ownerId === session.user.id)).toBe(true);

    await supabase.auth.signOut();
  });

  // Sales Task Control Loop Task 6 / project-tracker Task 51 — proves
  // listTasks() surfaces workflowStatus and dueState as separate fields
  // (Task 6 acceptance criterion), computed via the same TypeScript
  // mirror business-calendar.test.ts already proved identical to the
  // database function, not read from a stored column.
  test("listTasks() exposes workflowStatus, dueState, and category separately from the legacy status", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const tasks = await listTasks();
    const fixture = tasks.find((t) => t.id === taskId);
    expect(fixture?.workflowStatus).toBe("Open");
    expect(fixture?.category).toBe("Other");
    // Fixture due_date is 2026-07-17, well in the past relative to any
    // real test run date -- an active, never-progressed Task is Overdue.
    expect(["Overdue", "Escalated"]).toContain(fixture?.dueState ?? "");
    expect(typeof fixture?.calendarIncomplete).toBe("boolean");

    await supabase.auth.signOut();
  });

  test("getTaskControlLoopMetrics() maps aggregate Task counts for manager dashboards", async () => {
    const fixtureClient = await signInAs(fixtures.manager);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const metrics = await getTaskControlLoopMetrics();
    expect(metrics.totalTasks).toBeGreaterThan(0);
    expect(metrics.activeTasks).toBeGreaterThanOrEqual(0);
    expect(metrics.todayTasks).toBeGreaterThanOrEqual(0);
    expect(
      metrics.overdueTasks + metrics.escalatedTasks,
    ).toBeGreaterThanOrEqual(0);

    await supabase.auth.signOut();
  });

  test("getTaskControlLoopMetrics() is not available to Sales", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    await expect(getTaskControlLoopMetrics()).rejects.toThrow(
      "task_control_loop_metrics is not available",
    );

    await supabase.auth.signOut();
  });

  test("recordTaskProgress() persists a real workflow status change", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const updated = await recordTaskProgress({
      taskId,
      nextAction: null,
      nextActionDate: null,
      workflowStatusTarget: "Done",
    });
    expect(updated.workflowStatus).toBe("Done");

    const { data: fromDb } = await adminClient
      .from("tasks")
      .select("workflow_status")
      .eq("id", taskId)
      .single();
    expect(fromDb?.workflow_status).toBe("Done");

    await adminClient
      .from("tasks")
      .update({
        workflow_status: "Open",
        next_action: "Continue test fixture",
        next_action_date: "2026-08-01",
      })
      .eq("id", taskId);

    await supabase.auth.signOut();
  });

  test("updateTask() persists an archived flag", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const updated = await updateTask(taskId, { archived: true });
    expect(updated.archived).toBe(true);

    const { data: fromDb } = await adminClient
      .from("tasks")
      .select("archived")
      .eq("id", taskId)
      .single();
    expect(fromDb?.archived).toBe(true);

    await supabase.auth.signOut();
  });

  // Sales Task Control Loop Task 7 / project-tracker Task 52 — category is
  // a plain correction field (updateTask()), not a progress field.
  test("updateTask() persists a category correction", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const updated = await updateTask(taskId, { category: "Quotation" });
    expect(updated.category).toBe("Quotation");

    const { data: fromDb } = await adminClient
      .from("tasks")
      .select("category")
      .eq("id", taskId)
      .single();
    expect(fromDb?.category).toBe("Quotation");

    await supabase.auth.signOut();
  });

  test("createTask() returns workflow status and derived due state without legacy status", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const { data: anyClient } = await adminClient
      .from("clients")
      .select("id")
      .limit(1)
      .single();

    let createdId: string | undefined;
    try {
      const created = await createTask({
        clientId: anyClient!.id,
        ownerId: session.user.id,
        title: "Characterization: past-due task stays Upcoming",
        dueDate: "2020-01-01",
        method: "Phone",
        priority: "Normal",
      });
      createdId = created.id;
      expect(created.workflowStatus).toBe("Open");
      expect(["Overdue", "Escalated"]).toContain(created.dueState ?? "");

      const { data: fromDb } = await adminClient
        .from("tasks")
        .select("workflow_status")
        .eq("id", created.id)
        .single();
      expect(fromDb?.workflow_status).toBe("Open");
    } finally {
      if (createdId) {
        await adminClient.from("tasks").delete().eq("id", createdId);
      }
      await supabase.auth.signOut();
    }
  });

  // Sales Task Control Loop Task 7 / project-tracker Task 52 — "A Task
  // may omit Client and commercial document but always has an eligible
  // owner, category, title, workflow state" (acceptance criterion).
  test("createTask() persists a Task with no Client and an explicit category", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    let createdId: string | undefined;
    try {
      const created = await createTask({
        ownerId: session.user.id,
        title: "Standalone task without a Client",
        dueDate: "2026-08-01",
        method: "Phone",
        priority: "Normal",
        category: "Internal/Admin",
      });
      createdId = created.id;
      expect(created.clientId).toBeUndefined();
      expect(created.category).toBe("Internal/Admin");
      expect(created.workflowStatus).toBe("Open");

      const { data: fromDb } = await adminClient
        .from("tasks")
        .select("client_id, category, workflow_status")
        .eq("id", created.id)
        .single();
      expect(fromDb?.client_id).toBeNull();
      expect(fromDb?.category).toBe("Internal/Admin");
      expect(fromDb?.workflow_status).toBe("Open");
    } finally {
      if (createdId) {
        await adminClient.from("tasks").delete().eq("id", createdId);
      }
      await supabase.auth.signOut();
    }
  });

  test("createTask() persists a normalized commercialDocumentId link", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const { data: anyClient } = await adminClient
      .from("clients")
      .select("id")
      .limit(1)
      .single();

    const { data: fixtureDocument, error: documentError } = await adminClient
      .from("commercial_documents")
      .insert({
        client_id: anyClient!.id,
        owner_id: session.user.id,
        type: "Quotation",
        source_flow: "RFQ / New Product",
        document_date: "2026-07-18",
        stage: "Quotes Sent",
      })
      .select("id")
      .single();
    if (documentError) throw documentError;

    let createdId: string | undefined;
    try {
      const created = await createTask({
        clientId: anyClient!.id,
        ownerId: session.user.id,
        commercialDocumentId: fixtureDocument.id,
        title: "Data-layer fixture linked task",
        dueDate: "2026-07-18",
        method: "Email",
        priority: "Normal",
      });
      createdId = created.id;
      expect(created.commercialDocumentId).toBe(fixtureDocument.id);
    } finally {
      if (createdId) {
        await adminClient.from("tasks").delete().eq("id", createdId);
      }
      await adminClient
        .from("commercial_documents")
        .delete()
        .eq("id", fixtureDocument.id);
      await supabase.auth.signOut();
    }
  });
});
