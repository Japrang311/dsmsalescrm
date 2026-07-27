import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let taskIds: { own: string; other: string };

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  // Reuse one of the seeded real clients as the FK target — tasks.client_id
  // is NOT NULL, and these fixture users don't own any client of their own.
  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;

  const { data: own, error: ownError } = await adminClient
    .from("tasks")
    .insert({
      client_id: anyClient.id,
      owner_id: fixtures.sales.id,
      title: "Fixture Own Task",
      due_date: "2026-07-17",
      method: "Phone",
    })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("tasks")
    .insert({
      client_id: anyClient.id,
      owner_id: "22222222-2222-2222-2222-222222222222",
      title: "Fixture Other Task",
      due_date: "2026-07-17",
      method: "Phone",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  taskIds = { own: own.id, other: other.id };
});

afterAll(async () => {
  await adminClient
    .from("tasks")
    .delete()
    .in("id", [taskIds.own, taskIds.other]);
  await deleteRoleFixtureUsers(fixtures);
});

describe("tasks RLS", () => {
  test("sales role sees only tasks they own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("tasks").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(taskIds.own);
    expect(ids).not.toContain(taskIds.other);
  });

  test("manager role sees every task", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("tasks").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(taskIds.own);
    expect(ids).toContain(taskIds.other);
  });

  test("executive role sees only qualifying Manager exception task detail and cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("tasks").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).not.toContain(taskIds.own);
    expect(ids).toContain(taskIds.other);

    const { data: updated, error: updateError } = await client
      .from("tasks")
      .update({ status: "Done" })
      .eq("id", taskIds.other)
      .select("id");
    if (updateError) throw updateError;
    // No UPDATE policy exists for executive at all, so RLS silently
    // matches zero rows rather than erroring — same pattern as clients.
    expect(updated).toHaveLength(0);
  });

  test("sales role cannot update a task they don't own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("tasks")
      .update({ status: "Done" })
      .eq("id", taskIds.other)
      .select("id");
    if (error) throw error;
    expect(data).toHaveLength(0);
  });

  test("no role can delete a task (status-based, not hard delete)", async () => {
    const client = await signInAs(fixtures.manager);
    const { error, count } = await client
      .from("tasks")
      .delete({ count: "exact" })
      .eq("id", taskIds.own);
    if (!error) {
      expect(count).toBe(0);
    }
    const { data: stillThere } = await adminClient
      .from("tasks")
      .select("id")
      .eq("id", taskIds.own)
      .single();
    expect(stillThere?.id).toBe(taskIds.own);
  });
});

// Sales Task Control Loop Task 3 (implementation-plan) / project-tracker
// Task 48 — contract tests for the new columns added by
// 20260727120000_add_task_control_loop_foundation.sql. The existing
// tasks_select/insert/update RLS policies are row-level and were not
// changed, so the same own-only/all/correction pattern from the tests
// above is expected to already cover these columns; these tests prove
// that's actually true rather than assumed.
describe("tasks new workflow columns (workflow_status/category/next_action)", () => {
  test("sales role can update their own task's new columns", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("tasks")
      .update({
        workflow_status: "In Progress",
        category: "Follow-Up",
        next_action: "Call back with pricing",
        next_action_date: "2026-08-01",
      })
      .eq("id", taskIds.own)
      .select("workflow_status, category, next_action, next_action_date");
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data![0].workflow_status).toBe("In Progress");
    expect(data![0].category).toBe("Follow-Up");
    expect(data![0].next_action).toBe("Call back with pricing");
    expect(data![0].next_action_date).toBe("2026-08-01");
  });

  test("sales role cannot update new columns on a task they don't own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("tasks")
      .update({ category: "Internal/Admin" })
      .eq("id", taskIds.other)
      .select("id");
    if (error) throw error;
    expect(data).toHaveLength(0);
  });

  test("manager role can update new columns on any task", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client
      .from("tasks")
      .update({ category: "Internal/Admin" })
      .eq("id", taskIds.other)
      .select("id, category");
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data![0].category).toBe("Internal/Admin");
  });

  test("cancellation_reason is required when workflow_status is Cancelled", async () => {
    const client = await signInAs(fixtures.sales);

    const { error: missingReasonError } = await client
      .from("tasks")
      .update({ workflow_status: "Cancelled" })
      .eq("id", taskIds.own);
    expect(missingReasonError?.code).toBe("23514");
    expect(missingReasonError?.message).toContain(
      "tasks_cancellation_reason_required",
    );

    const { data, error } = await client
      .from("tasks")
      .update({
        workflow_status: "Cancelled",
        cancellation_reason: "Client no longer interested",
      })
      .eq("id", taskIds.own)
      .select("workflow_status, cancellation_reason");
    if (error) throw error;
    expect(data![0].workflow_status).toBe("Cancelled");
    expect(data![0].cancellation_reason).toBe("Client no longer interested");

    // Restore to Open for any later test in this file relying on taskIds.own.
    await adminClient
      .from("tasks")
      .update({ workflow_status: "Open", cancellation_reason: null })
      .eq("id", taskIds.own);
  });

  test("client_id is nullable on new tasks", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client
      .from("tasks")
      .insert({
        client_id: null,
        owner_id: fixtures.sales.id,
        title: "Fixture task without a Client",
        due_date: "2026-07-17",
        method: "Phone",
      })
      .select("id, client_id")
      .single();
    if (error) throw error;
    expect(data.client_id).toBeNull();
    await adminClient.from("tasks").delete().eq("id", data.id);
  });
});
