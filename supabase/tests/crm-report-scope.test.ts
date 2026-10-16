import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";
let users: RoleFixtureUsers;
const clients: string[] = [];
const orders: string[] = [];
beforeAll(async () => {
  users = await createRoleFixtureUsers();
  for (const name of ["Synthetic A", "Synthetic B"]) {
    const { data, error } = await adminClient
      .from("clients")
      .insert({ name, owner_id: users.sales.id, source: "Referral" })
      .select("id")
      .single();
    if (error) throw error;
    clients.push(data.id);
  }
  for (const [client, date, value] of [
    [0, "2026-01-15", 480_000_000],
    [0, "2026-02-28", 20_000_000],
    [1, "2026-02-01", 80_000_000],
    [0, "2025-12-31", 10_000_000],
  ] as const) {
    const { data, error } = await adminClient
      .from("sales_orders")
      .insert({
        so_number: `SYN-${crypto.randomUUID()}`,
        client_id: clients[client],
        owner_id: users.sales.id,
        type: "Regular",
        tax_type: "PPN",
        source: "Existing / Repeat Order",
        date,
        total_value: value,
      })
      .select("id")
      .single();
    if (error) throw error;
    orders.push(data.id);
  }
});
afterAll(async () => {
  await adminClient.from("sales_orders").delete().in("id", orders);
  await adminClient.from("clients").delete().in("id", clients);
  await deleteRoleFixtureUsers(users);
});
test("AC01 range numerator and denominator agree for every permitted role", async () => {
  for (const role of ["sales", "manager", "executive"] as const) {
    const caller = await signInAs(users[role]);
    const { data, error } = await caller.rpc("crm_report_metrics", {
      p_from: "2026-02-01",
      p_to: "2026-02-28",
      p_owner_id: users.sales.id,
    });
    expect(error).toBeNull();
    expect(data.total).toBe(100_000_000);
    expect(
      data.customers.find(
        (c: { clientId: string }) => c.clientId === clients[0],
      ).revenue / data.total,
    ).toBe(0.2);
    expect(data.owners[0].revenue).toBe(data.total);
  }
});
test("AC02 cross-year inclusive range and subset filters", async () => {
  const caller = await signInAs(users.sales);
  const { data, error } = await caller.rpc("crm_report_metrics", {
    p_from: "2025-12-31",
    p_to: "2026-02-28",
    p_client_id: clients[0],
  });
  expect(error).toBeNull();
  expect(data.total).toBe(510_000_000);
  expect(data.months.map((m: { period: string }) => m.period)).toEqual([
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
});
test("sales cannot select another owner's totals and reversed dates are rejected", async () => {
  const caller = await signInAs(users.sales);
  const own = await caller.rpc("crm_report_metrics", {
    p_from: "2026-02-01",
    p_to: "2026-02-28",
    p_owner_id: users.manager.id,
  });
  expect(own.error).toBeNull();
  expect(own.data.total).toBe(100_000_000);
  const bad = await caller.rpc("crm_report_metrics", {
    p_from: "2026-03-01",
    p_to: "2026-02-01",
  });
  expect(bad.error?.message).toContain("INVALID_METRIC_RANGE");
});
