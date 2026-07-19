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

  test("executive role sees every task but cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("tasks").select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const { data: updated, error: updateError } = await client
      .from("tasks")
      .update({ status: "Done" })
      .eq("id", taskIds.own)
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
