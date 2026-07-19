import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let itemIds: { own: string; other: string };

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;

  const { data: own, error: ownError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: anyClient.id,
      owner_id: fixtures.sales.id,
      type: "RFQ",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-17",
      rfq_number: `RFQ-FIXTURE-OWN-${crypto.randomUUID()}`,
      stage: "Client Request for Quotes",
    })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: anyClient.id,
      owner_id: "22222222-2222-2222-2222-222222222222",
      type: "RFQ",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-17",
      rfq_number: `RFQ-FIXTURE-OTHER-${crypto.randomUUID()}`,
      stage: "Client Request for Quotes",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  itemIds = { own: own.id, other: other.id };
});

afterAll(async () => {
  if (itemIds) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .in("id", [itemIds.own, itemIds.other]);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("commercial_documents RLS", () => {
  test("sales role sees only commercial items they own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("commercial_documents")
      .select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(itemIds.own);
    expect(ids).not.toContain(itemIds.other);
  });

  test("manager role sees every commercial item", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client
      .from("commercial_documents")
      .select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(itemIds.own);
    expect(ids).toContain(itemIds.other);
  });

  test("executive role sees every commercial item but cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client
      .from("commercial_documents")
      .select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const { data: updated, error: updateError } = await client
      .from("commercial_documents")
      .update({ stage: "Closed Lost" })
      .eq("id", itemIds.own)
      .select("id");
    if (updateError) throw updateError;
    expect(updated).toHaveLength(0);
  });

  test("sales role cannot update a commercial item they don't own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("commercial_documents")
      .update({ stage: "Closed Lost" })
      .eq("id", itemIds.other)
      .select("id");
    if (error) throw error;
    expect(data).toHaveLength(0);
  });

  test("no role can delete a commercial item (stage-based lifecycle, not hard delete)", async () => {
    const client = await signInAs(fixtures.manager);
    const { error, count } = await client
      .from("commercial_documents")
      .delete({ count: "exact" })
      .eq("id", itemIds.own);
    if (!error) {
      expect(count).toBe(0);
    }
    const { data: stillThere } = await adminClient
      .from("commercial_documents")
      .select("id")
      .eq("id", itemIds.own)
      .single();
    expect(stillThere?.id).toBe(itemIds.own);
  });
});
