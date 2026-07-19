import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let clientIds: { own: string; other: string };

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  // One client owned by the fixture "sales" user, one owned by someone else
  // entirely (a seeded team member) — this is what lets us prove a sales
  // login can see its own client but not a stranger's.
  const { data: own, error: ownError } = await adminClient
    .from("clients")
    .insert({
      name: "Fixture Own Client",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("clients")
    .insert({
      name: "Fixture Other Client",
      source: "Referral",
      owner_id: "22222222-2222-2222-2222-222222222222",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  clientIds = { own: own.id, other: other.id };
});

afterAll(async () => {
  await adminClient
    .from("clients")
    .delete()
    .in("id", [clientIds.own, clientIds.other]);
  await deleteRoleFixtureUsers(fixtures);
});

describe("clients RLS", () => {
  test("sales role sees only clients they own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("clients").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(clientIds.own);
    expect(ids).not.toContain(clientIds.other);
  });

  test("manager role sees every client", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("clients").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(clientIds.own);
    expect(ids).toContain(clientIds.other);
  });

  test("executive role sees every client but cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("clients").select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const { error: insertError } = await client.from("clients").insert({
      name: "Should Fail",
      source: "Referral",
      owner_id: fixtures.executive.id,
    });
    expect(insertError).not.toBeNull();
  });

  test("sales role cannot create a client owned by someone else", async () => {
    const client = await signInAs(fixtures.sales);
    const { error } = await client.from("clients").insert({
      name: "Should Fail",
      source: "Referral",
      owner_id: fixtures.manager.id,
    });
    expect(error).not.toBeNull();
  });

  test("sales role cannot update a client they don't own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("clients")
      .update({ status: "Lost" })
      .eq("id", clientIds.other)
      .select("id");
    if (error) throw error;
    // RLS silently filters out rows the policy doesn't match, rather than
    // erroring — so "no rows changed" is the correct signal, not an error.
    expect(data).toHaveLength(0);
  });

  test("no role can delete a client (archive-only policy, per PRD §9)", async () => {
    const client = await signInAs(fixtures.manager);
    const { error, count } = await client
      .from("clients")
      .delete({ count: "exact" })
      .eq("id", clientIds.own);
    // No DELETE policy exists at all, so this should either error or match
    // zero rows — never actually remove the row.
    if (!error) {
      expect(count).toBe(0);
    }
    const { data: stillThere } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", clientIds.own)
      .single();
    expect(stillThere?.id).toBe(clientIds.own);
  });
});
