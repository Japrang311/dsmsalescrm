import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { createSalesOrder, listSalesOrders } from "./sales-orders";

let fixtures: RoleFixtureUsers;
let clientId: string;
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: `Sales order adapter ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;
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
  await db`
    delete from private.document_number_counters
    where year_code = 96 and series in ('SO', 'PROTY')
  `;
  await deleteRoleFixtureUsers(fixtures);
  await db.end();
});

async function authenticateSales() {
  const authClient = await signInAs(fixtures.sales);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

describe("normalized Sales Order adapter", () => {
  test("creates one paid header with ordered items and server total", async () => {
    await authenticateSales();
    const created = await createSalesOrder({
      clientId,
      date: "2096-02-18",
      customerPoNumber: "PO-ADAPTER-PAID",
      type: "Regular",
      taxType: "PPN",
      source: "Existing / Repeat Order",
      numberMode: "Auto",
      manualSoNumber: "",
      backdateReason: "",
      items: [
        {
          productName: "Housing",
          qty: 2,
          uom: "Pcs",
          unitPrice: 10_000,
        },
        {
          productName: "Fixture",
          description: "Assembly fixture",
          qty: 1,
          uom: "Set",
          unitPrice: 5_000,
        },
      ],
    });

    expect(created.soNumber).toMatch(/^DSM-96SO\d{3}$/);
    expect(created.customerPoNumber).toBe("PO-ADAPTER-PAID");
    expect(created.date).toBe("2096-02-18");
    expect(created.totalValue).toBe(25_000);
    expect(created.value).toBe(25_000);
    expect(created.items.map((item) => item.linePosition)).toEqual([1, 2]);

    const listed = await listSalesOrders();
    expect(listed.find((order) => order.id === created.id)?.items).toHaveLength(
      2,
    );
    await supabase.auth.signOut();
  });

  test("creates Prototype FOC with item rows and null money", async () => {
    await authenticateSales();
    const created = await createSalesOrder({
      clientId,
      date: "2096-02-19",
      customerPoNumber: "PO-ADAPTER-FOC",
      type: "Prototype",
      prototypeStatus: "FOC",
      source: "Prototype FOC",
      items: [
        {
          productName: "Prototype bracket",
          description: "FOC sample",
          qty: 1,
          uom: "Unit",
        },
      ],
    });

    expect(created.soNumber).toMatch(/^DSM-96PROTY\d{3}$/);
    expect(created.totalValue).toBeNull();
    expect(created.value).toBeNull();
    expect(created.items[0]).toMatchObject({
      productName: "Prototype bracket",
      unitPrice: null,
      lineTotal: null,
    });
    await supabase.auth.signOut();
  });
});
