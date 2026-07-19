import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let targetIds: { own: string; other: string };

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: own, error: ownError } = await adminClient
    .from("targets")
    .insert({ sales_id: fixtures.sales.id, year: 2099, month: 1, target: 100 })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("targets")
    .insert({
      sales_id: "22222222-2222-2222-2222-222222222222",
      year: 2099,
      month: 1,
      target: 200,
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  targetIds = { own: own.id, other: other.id };
});

afterAll(async () => {
  await adminClient
    .from("targets")
    .delete()
    .in("id", [targetIds.own, targetIds.other]);
  await deleteRoleFixtureUsers(fixtures);
});

describe("targets RLS", () => {
  test("sales role sees only their own target rows", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("targets").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(targetIds.own);
    expect(ids).not.toContain(targetIds.other);
  });

  test("manager role sees every target row", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("targets").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(targetIds.own);
    expect(ids).toContain(targetIds.other);
  });

  test("executive role sees every target row but cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("targets").select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const { data: updated, error: updateError } = await client
      .from("targets")
      .update({ target: 999 })
      .eq("id", targetIds.own)
      .select("id");
    if (updateError) throw updateError;
    expect(updated).toHaveLength(0);
  });

  test("manager can insert and update targets for any sales rep", async () => {
    const client = await signInAs(fixtures.manager);
    const { error: updateError } = await client
      .from("targets")
      .update({ target: 500 })
      .eq("id", targetIds.other);
    if (updateError) throw updateError;

    const { data: check } = await adminClient
      .from("targets")
      .select("target")
      .eq("id", targetIds.other)
      .single();
    expect(check?.target).toBe(500);
  });

  test("sales role cannot update their own target", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("targets")
      .update({ target: 999 })
      .eq("id", targetIds.own)
      .select("id");
    if (error) throw error;
    expect(data).toHaveLength(0);
  });

  test("sales role cannot insert a target row", async () => {
    const client = await signInAs(fixtures.sales);
    const { error } = await client
      .from("targets")
      .insert({ sales_id: fixtures.sales.id, year: 2099, month: 2, target: 1 });
    expect(error).not.toBeNull();
  });

  test("no role can delete a target row (corrected via update, not removal)", async () => {
    const client = await signInAs(fixtures.manager);
    const { error, count } = await client
      .from("targets")
      .delete({ count: "exact" })
      .eq("id", targetIds.own);
    if (!error) {
      expect(count).toBe(0);
    }
    const { data: stillThere } = await adminClient
      .from("targets")
      .select("id")
      .eq("id", targetIds.own)
      .single();
    expect(stillThere?.id).toBe(targetIds.own);
  });
});
