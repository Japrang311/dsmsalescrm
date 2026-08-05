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
import {
  createSalesOrder,
  deleteSalesOrder,
  getSalesOrder,
  listSalesOrders,
  listSalesOrdersPage,
  restoreSalesOrder,
} from "./sales-orders";

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
      numberMode: "Manual",
      manualSoNumber: "DSM-96SO901",
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

    expect(created.soNumber).toBe("DSM-96SO901");
    expect(created.customerPoNumber).toBe("PO-ADAPTER-PAID");
    expect(created.date).toBe("2096-02-18");
    expect(created.totalValue).toBe(25_000);
    expect(created.value).toBe(25_000);
    expect(created.items.map((item) => item.linePosition)).toEqual([1, 2]);

    const listed = await listSalesOrders();
    expect(listed.find((order) => order.id === created.id)?.items).toHaveLength(
      2,
    );

    await deleteSalesOrder(created.id);
    expect(await getSalesOrder(created.id)).toBeNull();
    const deleted = await getSalesOrder(created.id, { deleted: true });
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.deletedBy).toBe(fixtures.sales.id);
    expect(
      (await listSalesOrders()).some((order) => order.id === created.id),
    ).toBe(false);
    expect(
      (await listSalesOrders({ deleted: true })).some(
        (order) => order.id === created.id,
      ),
    ).toBe(true);

    await restoreSalesOrder(created.id);
    expect(await getSalesOrder(created.id)).not.toBeNull();
    expect(await getSalesOrder(created.id, { deleted: true })).toBeNull();

    const { data: activity, error: activityError } = await adminClient
      .from("activity_log")
      .select("kind, sales_order_id")
      .eq("sales_order_id", created.id)
      .in("kind", ["sales_order_deleted", "sales_order_restored"])
      .order("created_at");
    if (activityError) throw activityError;
    expect(activity).toEqual([
      { kind: "sales_order_deleted", sales_order_id: created.id },
      { kind: "sales_order_restored", sales_order_id: created.id },
    ]);
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
      numberMode: "Manual",
      manualSoNumber: "DSM-96PROTY901",
      items: [
        {
          productName: "Prototype bracket",
          description: "FOC sample",
          qty: 1,
          uom: "Unit",
        },
      ],
    });

    expect(created.soNumber).toBe("DSM-96PROTY901");
    expect(created.totalValue).toBeNull();
    expect(created.value).toBeNull();
    expect(created.items[0]).toMatchObject({
      productName: "Prototype bracket",
      unitPrice: null,
      lineTotal: null,
    });
    await supabase.auth.signOut();
  });

  test("pages active rows with server filters and no duplicate cursor rows", async () => {
    await authenticateSales();
    const created = [];
    const taxTypes = ["PPN", "Non-PPN", "PPN"] as const;
    for (let index = 0; index < taxTypes.length; index += 1) {
      const taxType = taxTypes[index];
      created.push(
        await createSalesOrder({
          clientId,
          date: `2096-03-0${index + 1}`,
          customerPoNumber: `PO-PAGE-${index + 1}`,
          type: "Regular",
          taxType,
          source: "Existing / Repeat Order",
          numberMode: "Manual",
          manualSoNumber: `DSM-96SO92${index + 1}`,
          items: [
            {
              productName: `Pagination item ${index + 1}`,
              qty: 1,
              uom: "Pcs",
              unitPrice: 1_000 + index,
            },
          ],
        }),
      );
    }

    const firstPage = await listSalesOrdersPage({
      filters: {
        from: new Date(2096, 2, 1),
        to: new Date(2096, 2, 31),
        taxType: "PPN",
      },
      page: { pageSize: 1 },
    });
    expect(firstPage.rows).toHaveLength(1);
    expect(firstPage.totalCount).toBe(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listSalesOrdersPage({
      filters: {
        from: new Date(2096, 2, 1),
        to: new Date(2096, 2, 31),
        taxType: "PPN",
      },
      page: { pageSize: 1, cursor: firstPage.nextCursor },
    });
    expect(secondPage.rows).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.rows[0].id).not.toBe(firstPage.rows[0].id);
    expect([firstPage.rows[0].id, secondPage.rows[0].id].sort()).toEqual(
      [created[0].id, created[2].id].sort(),
    );
    await supabase.auth.signOut();
  });

  test("pages by SO number descending regardless of insert order", async () => {
    await authenticateSales();
    // Inserted out of order on purpose: creation order is 941, 943, 942, so a
    // created_at-based sort would return 942 first. Imported production rows
    // share only a handful of created_at values, so SO number is the only
    // meaningful newest-first key.
    for (const soNumber of ["DSM-96SO941", "DSM-96SO943", "DSM-96SO942"]) {
      await createSalesOrder({
        clientId,
        date: "2096-05-01",
        customerPoNumber: `PO-ORDER-${soNumber}`,
        type: "Regular",
        taxType: "PPN",
        source: "Existing / Repeat Order",
        numberMode: "Manual",
        manualSoNumber: soNumber,
        items: [
          { productName: soNumber, qty: 1, uom: "Pcs", unitPrice: 1_000 },
        ],
      });
    }

    const filters = {
      from: new Date(2096, 4, 1),
      to: new Date(2096, 4, 31),
    };
    const firstPage = await listSalesOrdersPage({
      filters,
      page: { pageSize: 2 },
    });
    expect(firstPage.rows.map((row) => row.soNumber)).toEqual([
      "DSM-96SO943",
      "DSM-96SO942",
    ]);

    const secondPage = await listSalesOrdersPage({
      filters,
      page: { pageSize: 2, cursor: firstPage.nextCursor },
    });
    expect(secondPage.rows.map((row) => row.soNumber)).toEqual(["DSM-96SO941"]);
    expect(secondPage.nextCursor).toBeNull();
    await supabase.auth.signOut();
  });
});
