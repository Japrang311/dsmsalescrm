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
        type: "RFQ",
        source_flow: "RFQ / New Product",
        document_date: "2026-07-18",
        rfq_number: `RFQ-TASK-${crypto.randomUUID().slice(0, 8)}`,
        stage: "Client Request for Quotes",
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
