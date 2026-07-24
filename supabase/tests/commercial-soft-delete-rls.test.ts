import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

let fixtures: RoleFixtureUsers;
let clientId: string;
let salesCommercialId: string;
let managerCommercialId: string;
let salesOrderId: string;
let managerSalesOrderId: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Soft delete RLS ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const { data: commercialRows, error: commercialError } = await adminClient
    .from("commercial_documents")
    .insert([
      {
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "RFQ",
        source_flow: "RFQ / New Product",
        document_date: "2026-07-24",
        stage: "Client Request for Quotes",
      },
      {
        client_id: clientId,
        owner_id: fixtures.manager.id,
        type: "RFQ",
        source_flow: "RFQ / New Product",
        document_date: "2026-07-24",
        stage: "Client Request for Quotes",
      },
    ])
    .select("id, owner_id");
  if (commercialError) throw commercialError;
  salesCommercialId = commercialRows.find(
    (row) => row.owner_id === fixtures.sales.id,
  )!.id;
  managerCommercialId = commercialRows.find(
    (row) => row.owner_id === fixtures.manager.id,
  )!.id;

  const marker = crypto.randomUUID().slice(0, 8);
  const { data: orderRows, error: orderError } = await adminClient
    .from("sales_orders")
    .insert([
      {
        so_number: `SOFT-DELETE-SALES-${marker}`,
        customer_po_number: `PO-SALES-${marker}`,
        date: "2026-07-24",
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "Regular",
        tax_type: "PPN",
        source: "Existing / Repeat Order",
        number_mode: "Manual",
        total_value: 1_000,
      },
      {
        so_number: `SOFT-DELETE-MANAGER-${marker}`,
        customer_po_number: `PO-MANAGER-${marker}`,
        date: "2026-07-24",
        client_id: clientId,
        owner_id: fixtures.manager.id,
        type: "Regular",
        tax_type: "PPN",
        source: "Existing / Repeat Order",
        number_mode: "Manual",
        total_value: 1_000,
      },
    ])
    .select("id, owner_id");
  if (orderError) throw orderError;
  salesOrderId = orderRows.find(
    (row) => row.owner_id === fixtures.sales.id,
  )!.id;
  managerSalesOrderId = orderRows.find(
    (row) => row.owner_id === fixtures.manager.id,
  )!.id;
});

afterAll(async () => {
  if (fixtures) {
    await adminClient
      .from("activity_log")
      .delete()
      .in("owner_id", [fixtures.sales.id, fixtures.manager.id]);
    await adminClient
      .from("commercial_documents")
      .delete()
      .in("id", [salesCommercialId, managerCommercialId].filter(Boolean));
    await adminClient
      .from("sales_orders")
      .delete()
      .in("id", [salesOrderId, managerSalesOrderId].filter(Boolean));
    if (clientId) await adminClient.from("clients").delete().eq("id", clientId);
    await deleteRoleFixtureUsers(fixtures);
  }
  await db.end();
});

describe("commercial soft-delete schema and RLS", () => {
  test("adds deletion metadata and four activity kinds", async () => {
    const columns = await db`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('commercial_documents', 'sales_orders')
        and column_name in ('deleted_at', 'deleted_by')
      order by table_name, column_name
    `;
    expect(columns).toHaveLength(4);

    const enumRows = await db`
      select e.enumlabel
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'activity_kind'
        and e.enumlabel in (
          'commercial_document_deleted',
          'commercial_document_restored',
          'sales_order_deleted',
          'sales_order_restored'
        )
      order by e.enumlabel
    `;
    expect(enumRows.map((row: { enumlabel: string }) => row.enumlabel)).toEqual(
      [
        "commercial_document_deleted",
        "commercial_document_restored",
        "sales_order_deleted",
        "sales_order_restored",
      ],
    );
  });

  test("Sales can soft-delete and restore only their own rows", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const deletedAt = "2026-07-24T04:00:00.000Z";

    for (const [table, id] of [
      ["commercial_documents", salesCommercialId],
      ["sales_orders", salesOrderId],
    ] as const) {
      const ownDelete = await salesClient
        .from(table)
        .update({ deleted_at: deletedAt, deleted_by: fixtures.sales.id })
        .eq("id", id)
        .select("deleted_at, deleted_by")
        .single();
      expect(ownDelete.error).toBeNull();
      expect(new Date(ownDelete.data!.deleted_at).toISOString()).toBe(
        deletedAt,
      );
      expect(ownDelete.data!.deleted_by).toBe(fixtures.sales.id);

      const ownRestore = await salesClient
        .from(table)
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", id)
        .select("deleted_at, deleted_by")
        .single();
      expect(ownRestore.error).toBeNull();
      expect(ownRestore.data).toEqual({
        deleted_at: null,
        deleted_by: null,
      });
    }

    for (const [table, id] of [
      ["commercial_documents", managerCommercialId],
      ["sales_orders", managerSalesOrderId],
    ] as const) {
      const otherDelete = await salesClient
        .from(table)
        .update({ deleted_at: deletedAt, deleted_by: fixtures.sales.id })
        .eq("id", id)
        .select("id");
      expect(otherDelete.error).toBeNull();
      expect(otherDelete.data).toEqual([]);
    }
  });

  test("Manager and Super Admin can act company-wide; Executive cannot act", async () => {
    const deletedAt = "2026-07-24T05:00:00.000Z";

    for (const role of ["manager", "super_admin"] as const) {
      const client = await signInAs(fixtures[role]);
      for (const [table, id] of [
        ["commercial_documents", salesCommercialId],
        ["sales_orders", salesOrderId],
      ] as const) {
        const deletion = await client
          .from(table)
          .update({ deleted_at: deletedAt, deleted_by: fixtures[role].id })
          .eq("id", id)
          .select("id")
          .single();
        expect(deletion.error).toBeNull();

        const restoration = await client
          .from(table)
          .update({ deleted_at: null, deleted_by: null })
          .eq("id", id)
          .select("id")
          .single();
        expect(restoration.error).toBeNull();
      }
    }

    const executiveClient = await signInAs(fixtures.executive);
    for (const [table, id] of [
      ["commercial_documents", salesCommercialId],
      ["sales_orders", salesOrderId],
    ] as const) {
      const result = await executiveClient
        .from(table)
        .update({
          deleted_at: deletedAt,
          deleted_by: fixtures.executive.id,
        })
        .eq("id", id)
        .select("id");
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });
});
