import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let soIds: { own: string; other: string; foc: string };

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;

  const { data: own, error: ownError } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: "SO-FIXTURE-OWN",
      client_id: anyClient.id,
      owner_id: fixtures.sales.id,
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      total_value: 1000,
      date: "2026-07-17",
    })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: "SO-FIXTURE-OTHER",
      client_id: anyClient.id,
      owner_id: "22222222-2222-2222-2222-222222222222",
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      total_value: 2000,
      date: "2026-07-17",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  const { data: foc, error: focError } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: "SO-FIXTURE-FOC",
      client_id: anyClient.id,
      owner_id: fixtures.sales.id,
      type: "Prototype",
      prototype_status: "FOC",
      source: "Prototype FOC",
      total_value: null,
      date: "2026-07-17",
    })
    .select("id")
    .single();
  if (focError) throw focError;

  soIds = { own: own.id, other: other.id, foc: foc.id };
});

afterAll(async () => {
  if (soIds) {
    await adminClient
      .from("sales_orders")
      .delete()
      .in("id", [soIds.own, soIds.other, soIds.foc]);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("sales_orders RLS", () => {
  test("sales role sees only sales orders they own", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("sales_orders").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(soIds.own);
    expect(ids).toContain(soIds.foc);
    expect(ids).not.toContain(soIds.other);
  });

  test("manager role sees every sales order", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("sales_orders").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(soIds.own);
    expect(ids).toContain(soIds.other);
  });

  test("executive role sees every sales order but cannot write", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("sales_orders").select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(3);

    const { data: updated, error: updateError } = await client
      .from("sales_orders")
      .update({ tax_type: "Non-PPN" })
      .eq("id", soIds.own)
      .select("id");
    if (updateError) throw updateError;
    expect(updated).toHaveLength(0);
  });

  test("no role can delete a sales order (revenue records are never removed)", async () => {
    const client = await signInAs(fixtures.manager);
    const { error, count } = await client
      .from("sales_orders")
      .delete({ count: "exact" })
      .eq("id", soIds.own);
    if (!error) {
      expect(count).toBe(0);
    }
    const { data: stillThere } = await adminClient
      .from("sales_orders")
      .select("id")
      .eq("id", soIds.own)
      .single();
    expect(stillThere?.id).toBe(soIds.own);
  });

  test("database rejects a FOC row with a non-null total", async () => {
    const { error } = await adminClient.from("sales_orders").insert({
      so_number: "SO-FIXTURE-INVALID",
      client_id: (
        await adminClient.from("clients").select("id").limit(1).single()
      ).data!.id,
      owner_id: fixtures.sales.id,
      type: "Prototype",
      prototype_status: "FOC",
      source: "Prototype FOC",
      total_value: 500,
      date: "2026-07-17",
    });
    expect(error).not.toBeNull();
  });

  test("database rejects a non-FOC row with a null total", async () => {
    const { error } = await adminClient.from("sales_orders").insert({
      so_number: "SO-FIXTURE-INVALID-2",
      client_id: (
        await adminClient.from("clients").select("id").limit(1).single()
      ).data!.id,
      owner_id: fixtures.sales.id,
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      total_value: null,
      date: "2026-07-17",
    });
    expect(error).not.toBeNull();
  });

  test("revenue_recognized view excludes the FOC row but includes the paid ones", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("revenue_recognized")
      .select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(soIds.own);
    expect(ids).not.toContain(soIds.foc);
  });
});
