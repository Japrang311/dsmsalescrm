import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  jakartaDateDaysFromToday,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let users: RoleFixtureUsers;
const clientIds: string[] = [];
const documentIds: string[] = [];
const salesOrderIds: string[] = [];
let undatedId: string;
let overdueId: string;

const today = jakartaDateDaysFromToday(0);
const periodTo = jakartaDateDaysFromToday(30);
const overdueDate = jakartaDateDaysFromToday(-1);
const outsideDate = jakartaDateDaysFromToday(60);
const historicalFrom = jakartaDateDaysFromToday(-60);
const historicalTo = jakartaDateDaysFromToday(-31);

async function insertQuotation(input: {
  ownerId: string;
  clientId: string;
  stage: string;
  value: number;
  expectedCloseDate?: string | null;
  current?: boolean;
  deleted?: boolean;
}) {
  const number = `QUO-FC-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: today,
      quotation_number: number,
      quotation_base_number: number,
      stage: input.stage,
      lost_reason:
        input.stage === "Closed Lost" ? "Harga tidak kompetitif" : null,
      expected_close_date: input.expectedCloseDate ?? null,
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
      description: `Forecast fixture ${input.stage}`,
      qty: 1,
      uom: "Unit",
      unit_price: input.value,
      line_total: input.value,
      line_position: 1,
    });
  if (itemError) throw itemError;
  return data.id as string;
}

beforeAll(async () => {
  users = await createRoleFixtureUsers();
  for (const [name, ownerId] of [
    ["Forecast Sales", users.sales.id],
    ["Forecast Manager", users.manager.id],
  ] as const) {
    const { data, error } = await adminClient
      .from("clients")
      .insert({ name, owner_id: ownerId, source: "Referral" })
      .select("id")
      .single();
    if (error) throw error;
    clientIds.push(data.id);
  }

  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 1_000,
    expectedCloseDate: today,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Negotiation",
    value: 2_000,
    expectedCloseDate: periodTo,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Commit",
    value: 10_000,
    expectedCloseDate: periodTo,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Hot Prospect",
    value: 4_000,
    expectedCloseDate: today,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Hot Prospect",
    value: 4_000,
    expectedCloseDate: outsideDate,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Closed Lost",
    value: 5_000,
    expectedCloseDate: today,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Closed Won",
    value: 6_000,
    expectedCloseDate: today,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 7_000,
    expectedCloseDate: today,
    current: false,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 8_000,
    expectedCloseDate: today,
    deleted: true,
  });
  undatedId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 9_000,
  });
  overdueId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Negotiation",
    value: 3_000,
    expectedCloseDate: overdueDate,
  });
  await insertQuotation({
    ownerId: users.manager.id,
    clientId: clientIds[1],
    stage: "Quotes Sent",
    value: 100_000,
    expectedCloseDate: today,
  });

  for (const [ownerId, clientId, date, value] of [
    [users.sales.id, clientIds[0], today, 5_000],
    [users.sales.id, clientIds[0], outsideDate, 6_000],
    [users.manager.id, clientIds[1], today, 7_000],
  ] as const) {
    const { data, error } = await adminClient
      .from("sales_orders")
      .insert({
        so_number: `SO-FC-${crypto.randomUUID()}`,
        client_id: clientId,
        owner_id: ownerId,
        type: "Regular",
        tax_type: "PPN",
        source: "Existing / Repeat Order",
        date,
        total_value: value,
      })
      .select("id")
      .single();
    if (error) throw error;
    salesOrderIds.push(data.id);
  }
});

afterAll(async () => {
  await adminClient.from("sales_orders").delete().in("id", salesOrderIds);
  await adminClient
    .from("commercial_document_items")
    .delete()
    .in("commercial_document_id", documentIds);
  await adminClient.from("commercial_documents").delete().in("id", documentIds);
  await adminClient.from("clients").delete().in("id", clientIds);
  await deleteRoleFixtureUsers(users);
});

describe("crm_forecast_snapshot", () => {
  test("AC12 reconciles period SO and weighted open quotation drilldown", async () => {
    const caller = await signInAs(users.sales);
    const { data, error } = await caller.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
    });

    expect(error).toBeNull();
    expect(data.snapshotMode).toBe("current");
    expect(data.salesOrderValue).toBe(5_000);
    expect(data.openPipelineValue).toBe(13_400);
    expect(data.forecastValue).toBe(18_400);
    expect(data.page).toMatchObject({
      limit: 100,
      offset: 0,
      totalCount: 6,
      contributionValue: 13_400,
    });
    expect(
      data.items.filter((row: { contributes: boolean }) => row.contributes),
    ).toHaveLength(4);
    expect(
      data.items.reduce(
        (sum: number, row: { contributes: boolean; weightedValue: number }) =>
          sum + (row.contributes ? row.weightedValue : 0),
        0,
      ),
    ).toBe(data.openPipelineValue);
    expect(data.undated.count).toBe(1);
    expect(data.undated.totalValue).toBe(9_000);
    expect(data.overdue.count).toBe(1);
    expect(data.overdue.totalValue).toBe(3_000);
    expect(
      data.items.find(
        (row: { documentId: string }) => row.documentId === undatedId,
      )?.bucket,
    ).toBe("undated");
    expect(
      data.items.find(
        (row: { documentId: string }) => row.documentId === overdueId,
      )?.bucket,
    ).toBe("overdue");
  });

  test("drilldown pagination is stable without changing the server aggregate", async () => {
    const caller = await signInAs(users.sales);
    const first = await caller.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
      p_limit: 2,
      p_offset: 0,
    });
    const second = await caller.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
      p_limit: 2,
      p_offset: 2,
    });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data.openPipelineValue).toBe(13_400);
    expect(second.data.openPipelineValue).toBe(13_400);
    expect(first.data.page.totalCount).toBe(6);
    expect(second.data.page.totalCount).toBe(6);
    expect(first.data.items).toHaveLength(2);
    expect(second.data.items).toHaveLength(2);
    expect(
      first.data.items.some((row: { documentId: string }) =>
        second.data.items.some(
          (other: { documentId: string }) =>
            other.documentId === row.documentId,
        ),
      ),
    ).toBe(false);
  });

  test("AC12 excludes terminal, outside-period, superseded, deleted, and undated quotations", async () => {
    const caller = await signInAs(users.sales);
    const { data, error } = await caller.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
    });

    expect(error).toBeNull();
    expect(data.items.map((row: { stage: string }) => row.stage)).not.toContain(
      "Closed Won",
    );
    expect(data.items.map((row: { stage: string }) => row.stage)).not.toContain(
      "Closed Lost",
    );
    expect(
      data.items.find(
        (row: { documentId: string }) => row.documentId === undatedId,
      )?.contributes,
    ).toBe(false);
    expect(data.openPipelineValue).toBe(13_400);
  });

  test("historical period does not present the current pipeline as a past forecast", async () => {
    const caller = await signInAs(users.sales);
    const { data, error } = await caller.rpc("crm_forecast_snapshot", {
      p_from: historicalFrom,
      p_to: historicalTo,
    });

    expect(error).toBeNull();
    expect(data.snapshotMode).toBe("historical_unavailable");
    expect(data.openPipelineValue).toBeNull();
    expect(data.forecastValue).toBeNull();
    expect(data.items).toEqual([]);
  });

  test("RLS and owner filtering keep Sales on their own book", async () => {
    const sales = await signInAs(users.sales);
    const requestedOtherOwner = await sales.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
      p_owner_id: users.manager.id,
    });
    expect(requestedOtherOwner.error).toBeNull();
    expect(requestedOtherOwner.data.salesOrderValue).toBe(5_000);
    expect(requestedOtherOwner.data.openPipelineValue).toBe(13_400);
    expect(
      requestedOtherOwner.data.items.every(
        (row: { ownerId: string }) => row.ownerId === users.sales.id,
      ),
    ).toBe(true);

    const manager = await signInAs(users.manager);
    const filtered = await manager.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
      p_owner_id: users.sales.id,
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data.salesOrderValue).toBe(5_000);
    expect(filtered.data.openPipelineValue).toBe(13_400);
  });

  test("AC13 audited expected-date change moves the quotation out of the period bucket", async () => {
    const documentId = await insertQuotation({
      ownerId: users.sales.id,
      clientId: clientIds[0],
      stage: "Quotes Sent",
      value: 2_000,
      expectedCloseDate: today,
    });
    const { data: current, error: currentError } = await adminClient
      .from("commercial_documents")
      .select("updated_at")
      .eq("id", documentId)
      .single();
    if (currentError) throw currentError;

    const caller = await signInAs(users.sales);
    const before = await caller.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
    });
    expect(before.error).toBeNull();

    const requestId = crypto.randomUUID();
    const moved = await caller.rpc("set_quotation_expected_close_date", {
      p_document_id: documentId,
      p_expected_updated_at: current.updated_at,
      p_request_id: requestId,
      p_expected_close_date: outsideDate,
      p_reason: "Verifikasi perpindahan bucket forecast",
    });
    expect(moved.error).toBeNull();

    const after = await caller.rpc("crm_forecast_snapshot", {
      p_from: today,
      p_to: periodTo,
    });
    expect(after.error).toBeNull();
    expect(before.data.openPipelineValue - after.data.openPipelineValue).toBe(
      600,
    );
    expect(
      after.data.items.some(
        (row: { documentId: string }) => row.documentId === documentId,
      ),
    ).toBe(false);

    const event = await caller
      .from("commercial_expected_close_events")
      .select("old_expected_close_date,new_expected_close_date,request_id")
      .eq("commercial_document_id", documentId)
      .eq("request_id", requestId)
      .single();
    expect(event.error).toBeNull();
    expect(event.data).toMatchObject({
      old_expected_close_date: today,
      new_expected_close_date: outsideDate,
      request_id: requestId,
    });
  });
});
