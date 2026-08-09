import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { createSalesOrder } from "./sales-orders";
import { getSalesOrdersMetrics } from "./sales-orders-metrics";

let fixtures: RoleFixtureUsers;
let clientId: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: `SO metrics fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;

  const authClient = await signInAs(fixtures.sales);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  await createSalesOrder({
    clientId,
    date: "2096-04-01",
    customerPoNumber: "PO-METRICS-1",
    type: "Regular",
    taxType: "PPN",
    source: "Existing / Repeat Order",
    numberMode: "Manual",
    manualSoNumber: "DSM-96SO931",
    items: [
      { productName: "Metrics item", qty: 1, uom: "Pcs", unitPrice: 7_000 },
    ],
  });
  await supabase.auth.signOut();
});

afterAll(async () => {
  await adminClient
    .from("activity_log")
    .delete()
    .eq("owner_id", fixtures.sales.id);
  await adminClient
    .from("sales_orders")
    .delete()
    .eq("owner_id", fixtures.sales.id);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

async function authenticateSales() {
  const authClient = await signInAs(fixtures.sales);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

describe("getSalesOrdersMetrics", () => {
  test("aggregates PPN total for the seeded order within its date range", async () => {
    await authenticateSales();
    const metrics = await getSalesOrdersMetrics({
      from: new Date(2096, 3, 1),
      to: new Date(2096, 3, 30),
      ownerId: fixtures.sales.id,
    });

    expect(metrics.ppnValue).toBeGreaterThanOrEqual(7_000);
    expect(metrics.totalCount).toBeGreaterThanOrEqual(1);
    await supabase.auth.signOut();
  });

  test("returns zero totals outside the date range", async () => {
    await authenticateSales();
    const metrics = await getSalesOrdersMetrics({
      from: new Date(2050, 0, 1),
      to: new Date(2050, 0, 31),
      ownerId: fixtures.sales.id,
    });

    expect(metrics.totalCount).toBe(0);
    expect(metrics.ppnValue).toBe(0);
    await supabase.auth.signOut();
  });

  // Security regression test: sales_orders_metrics() is security definer and
  // bypasses sales_orders RLS, so it must replicate RLS's owner scoping
  // itself instead of trusting the caller-supplied p_owner_id/ownerId. Before
  // this fix, a Sales caller omitting the owner filter (the default on the
  // Sales Orders page's filter bar) got back company-wide totals.
  test("a Sales caller omitting the owner filter still only sees their own totals, not company-wide", async () => {
    await authenticateSales();
    const noFilter = await getSalesOrdersMetrics({
      from: new Date(2096, 3, 1),
      to: new Date(2096, 3, 30),
    });
    const ownFilter = await getSalesOrdersMetrics({
      from: new Date(2096, 3, 1),
      to: new Date(2096, 3, 30),
      ownerId: fixtures.sales.id,
    });
    expect(noFilter.totalCount).toBe(ownFilter.totalCount);
    expect(noFilter.ppnValue).toBe(ownFilter.ppnValue);
    await supabase.auth.signOut();
  });

  test("a Sales caller requesting another owner's id is still forced back to their own totals", async () => {
    await authenticateSales();
    const requestedAsSomeoneElse = await getSalesOrdersMetrics({
      from: new Date(2096, 3, 1),
      to: new Date(2096, 3, 30),
      ownerId: fixtures.manager.id,
    });
    expect(requestedAsSomeoneElse.totalCount).toBeGreaterThanOrEqual(1);
    expect(requestedAsSomeoneElse.ppnValue).toBeGreaterThanOrEqual(7_000);
    await supabase.auth.signOut();
  });
});
