import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
const clientIds: string[] = [];
const quotationIds: string[] = [];
const salesOrderIds: string[] = [];

async function createClient(ownerId: string): Promise<string> {
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: `Manual link client ${crypto.randomUUID()}`,
      source: "Referral",
      owner_id: ownerId,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientIds.push(data.id);
  return data.id;
}

async function createQuotation(input: {
  clientId: string;
  ownerId: string;
  stage?: string;
  current?: boolean;
  deleted?: boolean;
}): Promise<string> {
  const number = `QUO-LINK-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2098-09-30",
      quotation_number: number,
      quotation_base_number: number,
      stage: input.stage ?? "Closed Won",
      is_current_revision: input.current ?? true,
      deleted_at: input.deleted ? new Date().toISOString() : null,
      deleted_by: input.deleted ? input.ownerId : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  quotationIds.push(data.id);
  return data.id;
}

async function createSalesOrder(input: {
  clientId: string;
  ownerId: string;
  sourceCommercialDocumentId?: string;
  deleted?: boolean;
}): Promise<string> {
  const { data, error } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: `SO-LINK-${crypto.randomUUID()}`,
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      total_value: 1000,
      date: "2098-09-30",
      source_commercial_document_id: input.sourceCommercialDocumentId ?? null,
      deleted_at: input.deleted ? new Date().toISOString() : null,
      deleted_by: input.deleted ? input.ownerId : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  salesOrderIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
});

afterAll(async () => {
  if (salesOrderIds.length > 0) {
    await adminClient
      .from("activity_log")
      .delete()
      .in("sales_order_id", salesOrderIds);
    await adminClient.from("sales_orders").delete().in("id", salesOrderIds);
  }
  if (quotationIds.length > 0) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .in("id", quotationIds);
  }
  if (clientIds.length > 0) {
    await adminClient.from("clients").delete().in("id", clientIds);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("link_sales_order_to_quotation", () => {
  test("sales links an owned released SO to an owned same-client Closed Won quotation and writes an audit event", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesOrderId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const { data, error } = await salesClient.rpc(
      "link_sales_order_to_quotation",
      {
        p_sales_order_id: salesOrderId,
        p_quotation_id: quotationId,
      },
    );

    expect(error).toBeNull();
    expect(data.source_commercial_document_id).toBe(quotationId);

    const { data: audit, error: auditError } = await adminClient
      .from("activity_log")
      .select("kind, commercial_document_id, sales_order_id, title")
      .eq("sales_order_id", salesOrderId)
      .eq("kind", "sales_order_header_change")
      .single();
    if (auditError) throw auditError;
    expect(audit.commercial_document_id).toBe(quotationId);
    expect(audit.title).toBe("Quotation dihubungkan ke Sales Order");
  });

  test("manager can link records owned by another active sales user", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesOrderId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const managerClient = await signInAs(fixtures.manager);

    const { error } = await managerClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: salesOrderId,
      p_quotation_id: quotationId,
    });

    expect(error).toBeNull();
  });

  test("executive cannot create a manual link", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesOrderId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const executiveClient = await signInAs(fixtures.executive);

    const { error } = await executiveClient.rpc(
      "link_sales_order_to_quotation",
      {
        p_sales_order_id: salesOrderId,
        p_quotation_id: quotationId,
      },
    );

    expect(error?.message).toContain("ACTIVE_MUTATING_ROLE_REQUIRED");
  });

  test("sales cannot link records owned by another user", async () => {
    const clientId = await createClient(fixtures.manager.id);
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.manager.id,
    });
    const salesOrderId = await createSalesOrder({
      clientId,
      ownerId: fixtures.manager.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const { error } = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: salesOrderId,
      p_quotation_id: quotationId,
    });

    expect(error?.message).toContain("SALES_ORDER_OWNERSHIP_REQUIRED");
  });

  test("rejects a quotation belonging to a different client", async () => {
    const firstClientId = await createClient(fixtures.sales.id);
    const secondClientId = await createClient(fixtures.sales.id);
    const quotationId = await createQuotation({
      clientId: secondClientId,
      ownerId: fixtures.sales.id,
    });
    const salesOrderId = await createSalesOrder({
      clientId: firstClientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const { error } = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: salesOrderId,
      p_quotation_id: quotationId,
    });

    expect(error?.message).toContain("QUOTATION_CLIENT_MISMATCH");
  });

  test("rejects a quotation that is not Closed Won", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
      stage: "Commit",
    });
    const salesOrderId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const { error } = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: salesOrderId,
      p_quotation_id: quotationId,
    });

    expect(error?.message).toContain("CURRENT_CLOSED_WON_QUOTATION_REQUIRED");
  });

  test("rejects non-Quotation commercial documents and deleted Sales Orders", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const { data: directOrder, error: directOrderError } = await adminClient
      .from("commercial_documents")
      .insert({
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "Direct Order",
        source_flow: "Existing / Repeat Order",
        document_date: "2098-09-30",
        stage: "Closed Won",
      })
      .select("id")
      .single();
    if (directOrderError) throw directOrderError;
    quotationIds.push(directOrder.id);
    const activeSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const deletedSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
      deleted: true,
    });
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const wrongType = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: activeSoId,
      p_quotation_id: directOrder.id,
    });
    const deletedOrder = await salesClient.rpc(
      "link_sales_order_to_quotation",
      {
        p_sales_order_id: deletedSoId,
        p_quotation_id: quotationId,
      },
    );

    expect(wrongType.error?.message).toContain(
      "CURRENT_CLOSED_WON_QUOTATION_REQUIRED",
    );
    expect(deletedOrder.error?.message).toContain("SALES_ORDER_NOT_FOUND");
  });

  test("rejects superseded or soft-deleted quotations", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const supersededId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
      current: false,
    });
    const deletedId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
      deleted: true,
    });
    const firstSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const secondSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const superseded = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: firstSoId,
      p_quotation_id: supersededId,
    });
    const deleted = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: secondSoId,
      p_quotation_id: deletedId,
    });

    expect(superseded.error?.message).toContain(
      "CURRENT_CLOSED_WON_QUOTATION_REQUIRED",
    );
    expect(deleted.error?.message).toContain(
      "CURRENT_CLOSED_WON_QUOTATION_REQUIRED",
    );
  });

  test("rejects linking an SO or quotation that already has a canonical link", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const firstQuotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const secondQuotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const firstSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
      sourceCommercialDocumentId: firstQuotationId,
    });
    const secondSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const occupiedSo = await salesClient.rpc("link_sales_order_to_quotation", {
      p_sales_order_id: firstSoId,
      p_quotation_id: secondQuotationId,
    });
    const occupiedQuotation = await salesClient.rpc(
      "link_sales_order_to_quotation",
      {
        p_sales_order_id: secondSoId,
        p_quotation_id: firstQuotationId,
      },
    );

    expect(occupiedSo.error?.message).toContain("SALES_ORDER_ALREADY_LINKED");
    expect(occupiedQuotation.error?.message).toContain(
      "QUOTATION_ALREADY_HAS_SALES_ORDER",
    );
  });

  test("concurrent attempts cannot link one quotation to two Sales Orders", async () => {
    const clientId = await createClient(fixtures.sales.id);
    const quotationId = await createQuotation({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const firstSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const secondSoId = await createSalesOrder({
      clientId,
      ownerId: fixtures.sales.id,
    });
    const salesClient = await signInAs(fixtures.sales);

    const attempts = await Promise.all([
      salesClient.rpc("link_sales_order_to_quotation", {
        p_sales_order_id: firstSoId,
        p_quotation_id: quotationId,
      }),
      salesClient.rpc("link_sales_order_to_quotation", {
        p_sales_order_id: secondSoId,
        p_quotation_id: quotationId,
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.error === null)).toHaveLength(
      1,
    );
    expect(attempts.find((attempt) => attempt.error)?.error?.message).toContain(
      "QUOTATION_ALREADY_HAS_SALES_ORDER",
    );
  });
});
