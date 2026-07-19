import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let logIds: { own: string; other: string };

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;

  const { data: own, error: ownError } = await adminClient
    .from("follow_up_logs")
    .insert({
      client_id: anyClient.id,
      owner_id: fixtures.sales.id,
      fu_date: "2026-07-17",
      method: "Phone",
      result: "Interested",
      notes: "Fixture own follow-up",
    })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("follow_up_logs")
    .insert({
      client_id: anyClient.id,
      owner_id: "22222222-2222-2222-2222-222222222222",
      fu_date: "2026-07-17",
      method: "Phone",
      result: "Interested",
      notes: "Fixture other follow-up",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  logIds = { own: own.id, other: other.id };
});

afterAll(async () => {
  await adminClient
    .from("follow_up_logs")
    .delete()
    .in("id", [logIds.own, logIds.other]);
  await deleteRoleFixtureUsers(fixtures);
});

describe("follow_up_logs RLS", () => {
  test("sales role sees only follow-up logs they own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("follow_up_logs").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(logIds.own);
    expect(ids).not.toContain(logIds.other);
  });

  test("manager role sees every follow-up log", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("follow_up_logs").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(logIds.own);
    expect(ids).toContain(logIds.other);
  });

  test("executive role sees every follow-up log but cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("follow_up_logs").select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const { data: anyClient } = await adminClient
      .from("clients")
      .select("id")
      .limit(1)
      .single();
    const { error: insertError } = await client.from("follow_up_logs").insert({
      client_id: anyClient!.id,
      owner_id: fixtures.executive.id,
      fu_date: "2026-07-17",
      method: "Phone",
      result: "Interested",
    });
    expect(insertError).not.toBeNull();
  });

  test("sales role cannot insert a follow-up log for someone else's owner_id", async () => {
    const client = await signInAs(fixtures.sales);
    const { data: anyClient } = await adminClient
      .from("clients")
      .select("id")
      .limit(1)
      .single();
    const { error: insertError } = await client.from("follow_up_logs").insert({
      client_id: anyClient!.id,
      owner_id: "22222222-2222-2222-2222-222222222222",
      fu_date: "2026-07-17",
      method: "Phone",
      result: "Interested",
    });
    expect(insertError).not.toBeNull();
  });

  test("no role can update or delete a follow-up log (append-only)", async () => {
    const client = await signInAs(fixtures.manager);
    const { data: updated, error: updateError } = await client
      .from("follow_up_logs")
      .update({ notes: "edited" })
      .eq("id", logIds.own)
      .select("id");
    if (updateError) {
      expect(updateError).not.toBeNull();
    } else {
      expect(updated).toHaveLength(0);
    }

    const { data: deleted, error: deleteError } = await client
      .from("follow_up_logs")
      .delete()
      .eq("id", logIds.own)
      .select("id");
    if (deleteError) {
      expect(deleteError).not.toBeNull();
    } else {
      expect(deleted).toHaveLength(0);
    }

    const { data: stillThere } = await adminClient
      .from("follow_up_logs")
      .select("id")
      .eq("id", logIds.own)
      .single();
    expect(stillThere?.id).toBe(logIds.own);
  });
});
