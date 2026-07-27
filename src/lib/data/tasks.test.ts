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
import { listTasks, updateTaskStatus, updateTask, createTask } from "./tasks";
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

  test("updateTaskStatus() persists a real status change", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const updated = await updateTaskStatus(taskId, "Done");
    expect(updated.status).toBe("Done");

    const { data: fromDb } = await adminClient
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .single();
    expect(fromDb?.status).toBe("Done");

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

  // Characterization test (Sales Task Control Loop Task 2 / project-tracker
  // Task 47) — locks in CURRENT legacy behavior before Task 3/4 introduce a
  // derived due state. TaskStatus today is "Today" | "Overdue" | "Upcoming" |
  // "Done" (src/lib/domain.ts) — one stored enum mixing workflow state (Done)
  // with due-date proximity (Today/Overdue/Upcoming). createTask() always
  // defaults status to "Upcoming" (src/lib/data/tasks.ts:110) regardless of
  // dueDate, and nothing recomputes it later — a task created with a due
  // date in the past stays "Upcoming" forever unless a human explicitly
  // changes it (see src/routes/_app.tasks.tsx's bucketFor(), which computes
  // its own client-side due bucket from dueDate and ignores stored status
  // for that purpose). This is the exact gap Task 4's derived due-state
  // algorithm replaces — do not "fix" this test when it starts failing
  // post-Task-4; update it to assert the new derived behavior instead.
  test("createTask() defaults status to Upcoming even when dueDate is already in the past (status is not date-derived)", async () => {
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
      expect(created.status).toBe("Upcoming");

      const { data: fromDb } = await adminClient
        .from("tasks")
        .select("status")
        .eq("id", created.id)
        .single();
      expect(fromDb?.status).toBe("Upcoming");
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
