import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";
import { normalizeWonBacklogSnapshot } from "../../src/lib/data/won-backlog";

let users: RoleFixtureUsers;
const clientIds: string[] = [];
const documentIds: string[] = [];
const salesOrderIds: string[] = [];
let missingId: string;
let secondMissingId: string;
let linkedId: string;
let deletedLinkId: string;
let managerMissingId: string;
let linkedSalesOrderId: string;
let deletedSalesOrderId: string;

async function insertQuotation(input: {
  ownerId: string;
  clientId: string;
  value: number;
  stage?: string;
  current?: boolean;
  deleted?: boolean;
}) {
  const quotationNumber = `QUO-WON-BACKLOG-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-10-17",
      quotation_number: quotationNumber,
      quotation_base_number: quotationNumber,
      stage: input.stage ?? "Closed Won",
      lost_reason:
        input.stage === "Closed Lost" ? "Harga tidak kompetitif" : null,
      is_current_revision: input.current ?? true,
      deleted_at: input.deleted ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  documentIds.push(data.id);

  const { error: itemError } = await adminClient
    .from("commercial_document_items")
    .insert({
      commercial_document_id: data.id,
      description: "Won backlog fixture",
      qty: 1,
      uom: "Unit",
      unit_price: input.value,
      line_total: input.value,
      line_position: 1,
    });
  if (itemError) throw itemError;
  return data.id as string;
}

async function insertSalesOrder(input: {
  quotationId?: string;
  ownerId: string;
  clientId: string;
  deleted?: boolean;
}) {
  const { data, error } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: `SO-WON-BACKLOG-${crypto.randomUUID()}`,
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      date: "2026-10-17",
      total_value: 1,
      source_commercial_document_id: input.quotationId ?? null,
      deleted_at: input.deleted ? new Date().toISOString() : null,
      deleted_by: input.deleted ? input.ownerId : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  salesOrderIds.push(data.id);
  return data.id as string;
}

beforeAll(async () => {
  users = await createRoleFixtureUsers();
  const fixtureSuffix = crypto.randomUUID().slice(0, 8);
  for (const [name, ownerId] of [
    [`Won Backlog Sales ${fixtureSuffix}`, users.sales.id],
    [`Won Backlog Manager ${fixtureSuffix}`, users.manager.id],
  ] as const) {
    const { data, error } = await adminClient
      .from("clients")
      .insert({ name, owner_id: ownerId, source: "Referral" })
      .select("id")
      .single();
    if (error) throw error;
    clientIds.push(data.id);
  }

  missingId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 1_000,
  });
  secondMissingId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 2_000,
  });
  linkedId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 4_000,
  });
  deletedLinkId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 8_000,
  });
  managerMissingId = await insertQuotation({
    ownerId: users.manager.id,
    clientId: clientIds[1],
    value: 16_000,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 32_000,
    current: false,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 64_000,
    deleted: true,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    value: 128_000,
    stage: "Closed Lost",
  });

  linkedSalesOrderId = await insertSalesOrder({
    quotationId: linkedId,
    ownerId: users.sales.id,
    clientId: clientIds[0],
  });
  deletedSalesOrderId = await insertSalesOrder({
    quotationId: deletedLinkId,
    ownerId: users.sales.id,
    clientId: clientIds[0],
    deleted: true,
  });
});

afterAll(async () => {
  await adminClient
    .from("activity_log")
    .delete()
    .in("owner_id", [users.sales.id, users.manager.id]);
  await adminClient.from("sales_orders").delete().in("id", salesOrderIds);
  await adminClient
    .from("commercial_document_items")
    .delete()
    .in("commercial_document_id", documentIds);
  await adminClient.from("commercial_documents").delete().in("id", documentIds);
  await adminClient.from("clients").delete().in("id", clientIds);
  await deleteRoleFixtureUsers(users);
});

describe("crm_won_without_so_backlog", () => {
  test("AC14 returns exact totals independent from the requested page", async () => {
    const caller = await signInAs(users.sales);
    const first = await caller.rpc("crm_won_without_so_backlog", {
      p_limit: 1,
      p_offset: 0,
    });
    const second = await caller.rpc("crm_won_without_so_backlog", {
      p_limit: 1,
      p_offset: 1,
    });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const normalized = normalizeWonBacklogSnapshot(first.data);
    expect(normalized.totals).toEqual({
      exceptionCount: 3,
      exceptionValue: 11_000,
      missingCount: 2,
      missingValue: 3_000,
      deletedLinkCount: 1,
      deletedLinkValue: 8_000,
    });
    expect(second.data.totals).toEqual(first.data.totals);
    expect(first.data.page).toMatchObject({
      limit: 1,
      offset: 0,
      totalCount: 3,
    });
    expect(second.data.page).toMatchObject({
      limit: 1,
      offset: 1,
      totalCount: 3,
    });
    expect(first.data.items).toHaveLength(1);
    expect(second.data.items).toHaveLength(1);
    expect(first.data.items[0].documentId).not.toBe(
      second.data.items[0].documentId,
    );
  });

  test("AC14 returns requested card states without calling linked, deleted-link, or missing unknown", async () => {
    const caller = await signInAs(users.sales);
    const { data, error } = await caller.rpc("crm_won_without_so_backlog", {
      p_document_ids: [missingId, linkedId, deletedLinkId],
    });

    expect(error).toBeNull();
    expect(data.requestedStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentId: missingId, status: "missing" }),
        expect.objectContaining({
          documentId: linkedId,
          status: "linked",
          salesOrderId: linkedSalesOrderId,
        }),
        expect.objectContaining({
          documentId: deletedLinkId,
          status: "deleted_link",
          salesOrderId: deletedSalesOrderId,
        }),
      ]),
    );
  });

  test("RLS forces Sales to their own book while Manager can filter owners", async () => {
    const sales = await signInAs(users.sales);
    const forced = await sales.rpc("crm_won_without_so_backlog", {
      p_owner_id: users.manager.id,
      p_document_ids: [managerMissingId],
    });
    expect(forced.error).toBeNull();
    expect(forced.data.totals.exceptionCount).toBe(3);
    expect(
      forced.data.items.every(
        (row: { ownerId: string }) => row.ownerId === users.sales.id,
      ),
    ).toBe(true);
    expect(forced.data.requestedStates).toEqual([]);

    const manager = await signInAs(users.manager);
    const filtered = await manager.rpc("crm_won_without_so_backlog", {
      p_owner_id: users.manager.id,
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data.totals.exceptionCount).toBe(1);
    expect(filtered.data.items[0].documentId).toBe(managerMissingId);
  });

  test("soft-delete becomes a separate review exception and restore clears it", async () => {
    const caller = await signInAs(users.sales);
    const beforeRestore = await caller.rpc("crm_won_without_so_backlog", {
      p_document_ids: [deletedLinkId],
    });
    expect(beforeRestore.error).toBeNull();
    expect(beforeRestore.data.requestedStates[0].status).toBe("deleted_link");

    const restored = await caller.rpc("set_sales_order_deleted", {
      p_sales_order_id: deletedSalesOrderId,
      p_deleted: false,
    });
    expect(restored.error).toBeNull();
    const afterRestore = await caller.rpc("crm_won_without_so_backlog", {
      p_document_ids: [deletedLinkId],
    });
    expect(afterRestore.error).toBeNull();
    expect(afterRestore.data.requestedStates[0].status).toBe("linked");
    expect(afterRestore.data.totals.exceptionCount).toBe(2);

    const deletedAgain = await caller.rpc("set_sales_order_deleted", {
      p_sales_order_id: deletedSalesOrderId,
      p_deleted: true,
    });
    expect(deletedAgain.error).toBeNull();
  });

  test("linking an existing SO removes the missing exception after reload", async () => {
    const unlinkedSoId = await insertSalesOrder({
      ownerId: users.sales.id,
      clientId: clientIds[0],
    });

    const caller = await signInAs(users.sales);
    const before = await caller.rpc("crm_won_without_so_backlog", {
      p_document_ids: [secondMissingId],
    });
    expect(before.error).toBeNull();
    expect(before.data.requestedStates[0].status).toBe("missing");

    const linked = await caller.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: unlinkedSoId,
      p_quotation_id: secondMissingId,
    });
    expect(linked.error).toBeNull();
    const after = await caller.rpc("crm_won_without_so_backlog", {
      p_document_ids: [secondMissingId],
    });
    expect(after.error).toBeNull();
    expect(after.data.requestedStates[0].status).toBe("linked");
    expect(after.data.totals.exceptionCount).toBe(2);
  });

  test("anonymous direct API access is denied", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonymous = createClient(
      process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
      process.env.SUPABASE_ANON_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    );
    const result = await anonymous.rpc("crm_won_without_so_backlog");
    expect(result.error).not.toBeNull();
  });
});
