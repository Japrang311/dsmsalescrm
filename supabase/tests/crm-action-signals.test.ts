import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let users: RoleFixtureUsers;
const clientIds: string[] = [];
const documentIds: string[] = [];
const salesOrderIds: string[] = [];
const activityIds: string[] = [];
const followUpIds: string[] = [];

const asOf = "2026-10-17";
let wonWithEventId: string;
let wonWithoutEventId: string;
let multiSignalId: string;
let insufficientId: string;
let managerOverdueId: string;
let unknownValueId: string;
const tiedSignalIds: string[] = [];

async function insertQuotation(input: {
  ownerId: string;
  clientId: string;
  stage: string;
  value: number | null;
  expectedCloseDate?: string | null;
  expiredDate?: string | null;
  current?: boolean;
  deleted?: boolean;
}) {
  const number = `QUO-SIGNAL-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-09-01",
      quotation_number: number,
      quotation_base_number: number,
      stage: input.stage,
      lost_reason:
        input.stage === "Closed Lost" ? "Harga tidak kompetitif" : null,
      expected_close_date: input.expectedCloseDate ?? null,
      quotation_expired_date: input.expiredDate ?? null,
      is_current_revision: input.current ?? true,
      deleted_at: input.deleted ? "2026-10-01T00:00:00Z" : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  documentIds.push(data.id);

  if (input.value !== null) {
    const { error: itemError } = await adminClient
      .from("commercial_document_items")
      .insert({
        commercial_document_id: data.id,
        description: "Action signal fixture",
        qty: 1,
        uom: "Unit",
        unit_price: input.value,
        line_total: input.value,
        line_position: 1,
      });
    if (itemError) throw itemError;
  }
  return data.id as string;
}

async function insertStageEvent(input: {
  documentId: string;
  ownerId: string;
  clientId: string;
  fromStage: string;
  toStage: string;
  createdAt: string;
  structured?: boolean;
}) {
  const { data, error } = await adminClient
    .from("activity_log")
    .insert({
      kind: "commercial_item_stage_change",
      owner_id: input.ownerId,
      actor_id: input.ownerId,
      client_id: input.clientId,
      commercial_document_id: input.documentId,
      title: `Stage -> ${input.toStage}`,
      detail: `${input.fromStage} -> ${input.toStage}`,
      created_at: input.createdAt,
      event_data: input.structured
        ? {
            schema_version: 1,
            from_stage: input.fromStage,
            to_stage: input.toStage,
            effective_at: input.createdAt,
          }
        : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  activityIds.push(data.id);
}

beforeAll(async () => {
  users = await createRoleFixtureUsers();
  const suffix = crypto.randomUUID().slice(0, 8);
  for (const [name, ownerId] of [
    [`Signal Sales ${suffix}`, users.sales.id],
    [`Signal Manager ${suffix}`, users.manager.id],
  ] as const) {
    const { data, error } = await adminClient
      .from("clients")
      .insert({ name, owner_id: ownerId, source: "Referral" })
      .select("id")
      .single();
    if (error) throw error;
    clientIds.push(data.id);
  }

  wonWithEventId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Closed Won",
    value: 9_000,
  });
  await insertStageEvent({
    documentId: wonWithEventId,
    ownerId: users.sales.id,
    clientId: clientIds[0],
    fromStage: "Commit",
    toStage: "Closed Won",
    createdAt: "2026-10-15T03:00:00Z",
    structured: true,
  });

  wonWithoutEventId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Closed Won",
    value: 8_000,
  });
  await insertStageEvent({
    documentId: wonWithoutEventId,
    ownerId: users.sales.id,
    clientId: clientIds[0],
    fromStage: "Commit",
    toStage: "Closed Won",
    createdAt: "2026-10-16T03:00:00Z",
    structured: false,
  });

  const linkedWonId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Closed Won",
    value: 7_000,
  });
  const { data: linkedSo, error: linkedSoError } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: `SO-SIGNAL-${crypto.randomUUID()}`,
      client_id: clientIds[0],
      owner_id: users.sales.id,
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      date: asOf,
      total_value: 7_000,
      source_commercial_document_id: linkedWonId,
    })
    .select("id")
    .single();
  if (linkedSoError) throw linkedSoError;
  salesOrderIds.push(linkedSo.id);

  multiSignalId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 5_000,
    expectedCloseDate: "2026-10-16",
    expiredDate: "2026-10-24",
  });
  await insertStageEvent({
    documentId: multiSignalId,
    ownerId: users.sales.id,
    clientId: clientIds[0],
    fromStage: "Negotiation",
    toStage: "Quotes Sent",
    createdAt: "2026-10-03T03:00:00Z",
    structured: true,
  });
  await adminClient
    .from("commercial_documents")
    .update({ updated_at: "2026-10-17T03:00:00Z" })
    .eq("id", multiSignalId);

  const dayThirteenId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Negotiation",
    value: 4_000,
    expiredDate: "2026-10-25",
  });
  const { data: followUp, error: followUpError } = await adminClient
    .from("follow_up_logs")
    .insert({
      client_id: clientIds[0],
      commercial_document_id: dayThirteenId,
      owner_id: users.sales.id,
      fu_date: "2026-10-04",
      method: "Phone",
      result: "Interested",
    })
    .select("id")
    .single();
  if (followUpError) throw followUpError;
  followUpIds.push(followUp.id);

  insufficientId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Hot Prospect",
    value: 3_000,
  });

  for (let index = 0; index < 2; index += 1) {
    const tiedId = await insertQuotation({
      ownerId: users.sales.id,
      clientId: clientIds[0],
      stage: "Negotiation",
      value: 4_500,
      expectedCloseDate: "2026-10-16",
    });
    tiedSignalIds.push(tiedId);
    const { data: tiedFollowUp, error: tiedFollowUpError } = await adminClient
      .from("follow_up_logs")
      .insert({
        client_id: clientIds[0],
        commercial_document_id: tiedId,
        owner_id: users.sales.id,
        fu_date: "2026-10-04",
        method: "Phone",
        result: "Interested",
      })
      .select("id")
      .single();
    if (tiedFollowUpError) throw tiedFollowUpError;
    followUpIds.push(tiedFollowUp.id);
  }

  unknownValueId = await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Negotiation",
    value: null,
    expectedCloseDate: "2026-10-16",
  });
  const { data: unknownValueFollowUp, error: unknownValueFollowUpError } =
    await adminClient
      .from("follow_up_logs")
      .insert({
        client_id: clientIds[0],
        commercial_document_id: unknownValueId,
        owner_id: users.sales.id,
        fu_date: "2026-10-04",
        method: "Phone",
        result: "Interested",
      })
      .select("id")
      .single();
  if (unknownValueFollowUpError) throw unknownValueFollowUpError;
  followUpIds.push(unknownValueFollowUp.id);

  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Closed Lost",
    value: 2_000,
    expectedCloseDate: "2026-10-01",
    expiredDate: "2026-10-01",
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 2_000,
    expectedCloseDate: "2026-10-01",
    current: false,
  });
  await insertQuotation({
    ownerId: users.sales.id,
    clientId: clientIds[0],
    stage: "Quotes Sent",
    value: 2_000,
    expectedCloseDate: "2026-10-01",
    deleted: true,
  });

  managerOverdueId = await insertQuotation({
    ownerId: users.manager.id,
    clientId: clientIds[1],
    stage: "Commit",
    value: 6_000,
    expectedCloseDate: "2026-10-16",
  });
});

afterAll(async () => {
  if (followUpIds.length) {
    await adminClient.from("follow_up_logs").delete().in("id", followUpIds);
  }
  if (activityIds.length) {
    await adminClient.from("activity_log").delete().in("id", activityIds);
  }
  if (salesOrderIds.length) {
    await adminClient.from("sales_orders").delete().in("id", salesOrderIds);
  }
  await adminClient
    .from("commercial_document_items")
    .delete()
    .in("commercial_document_id", documentIds);
  await adminClient.from("commercial_documents").delete().in("id", documentIds);
  await adminClient.from("clients").delete().in("id", clientIds);
  await deleteRoleFixtureUsers(users);
});

describe("crm_action_signals", () => {
  test("applies reasons, approved cutoffs, dedupe, and exact server counts", async () => {
    const sales = await signInAs(users.sales);
    const { data, error } = await sales.rpc("crm_action_signals", {
      p_as_of: asOf,
      p_limit: 50,
    });

    expect(error).toBeNull();
    expect(data.totals).toEqual({
      totalCount: 9,
      activeCount: 8,
      dataInsufficientCount: 1,
      incompleteEvidenceCount: 2,
      byRule: {
        won_without_so: 2,
        expected_close_overdue: 4,
        quotation_expiry_due: 1,
        deal_stagnant: 2,
      },
    });
    expect(data.page).toEqual({ limit: 50, returnedCount: 9 });
    expect(data.items).toHaveLength(9);
    expect(
      new Set(
        data.items.map(
          (item: { entityId: string; ruleId: string }) =>
            `${item.entityId}:${item.ruleId}`,
        ),
      ).size,
    ).toBe(9);
    expect(
      data.items.every((item: { reason: string }) => item.reason.length > 0),
    ).toBe(true);

    const multiRules = data.items
      .filter((item: { entityId: string }) => item.entityId === multiSignalId)
      .map((item: { ruleId: string }) => item.ruleId);
    expect(multiRules.sort()).toEqual([
      "deal_stagnant",
      "expected_close_overdue",
      "quotation_expiry_due",
    ]);
    expect(
      data.items.find(
        (item: { entityId: string; ruleId: string }) =>
          item.entityId === insufficientId && item.ruleId === "deal_stagnant",
      ),
    ).toMatchObject({
      state: "data_insufficient",
      baseDate: null,
      ageDays: null,
    });
    expect(
      data.items.find(
        (item: { entityId: string }) => item.entityId === unknownValueId,
      ),
    ).toMatchObject({ totalValue: null });
  });

  test("uses valid stage events for Won age and never falls back to updated_at or legacy text", async () => {
    const sales = await signInAs(users.sales);
    const { data, error } = await sales.rpc("crm_action_signals", {
      p_as_of: asOf,
      p_limit: 50,
    });
    expect(error).toBeNull();

    expect(
      data.items.find(
        (item: { entityId: string }) => item.entityId === wonWithEventId,
      ),
    ).toMatchObject({
      ruleId: "won_without_so",
      baseDate: "2026-10-15",
      ageDays: 2,
      dataState: "complete",
    });
    expect(
      data.items.find(
        (item: { entityId: string }) => item.entityId === wonWithoutEventId,
      ),
    ).toMatchObject({
      ruleId: "won_without_so",
      baseDate: null,
      ageDays: null,
      dataState: "data_insufficient",
    });
    expect(
      data.items.find(
        (item: { entityId: string; ruleId: string }) =>
          item.entityId === multiSignalId && item.ruleId === "deal_stagnant",
      ),
    ).toMatchObject({ baseDate: "2026-10-03", ageDays: 14 });
  });

  test("paginates with a stable keyset when priority, due date, and value tie", async () => {
    const sales = await signInAs(users.sales);
    const seen: string[] = [];
    let cursor: unknown = null;

    do {
      const { data, error } = await sales.rpc("crm_action_signals", {
        p_as_of: asOf,
        p_limit: 1,
        p_after: cursor,
      });
      expect(error).toBeNull();
      expect(data.totals.totalCount).toBe(9);
      expect(data.items.length).toBeLessThanOrEqual(1);
      if (data.items[0]) {
        seen.push(`${data.items[0].entityId}:${data.items[0].ruleId}`);
      }
      cursor = data.nextCursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(9);
    expect(new Set(seen).size).toBe(9);
    for (const entityId of tiedSignalIds) {
      expect(seen).toContain(`${entityId}:expected_close_overdue`);
    }
  });

  test("forces Sales owner scope while Manager can filter and Executive gets aggregates only", async () => {
    const sales = await signInAs(users.sales);
    const forced = await sales.rpc("crm_action_signals", {
      p_as_of: asOf,
      p_owner_id: users.manager.id,
    });
    expect(forced.error).toBeNull();
    expect(forced.data.totals.totalCount).toBe(9);
    expect(
      forced.data.items.every(
        (item: { ownerId: string }) => item.ownerId === users.sales.id,
      ),
    ).toBe(true);

    const manager = await signInAs(users.manager);
    const filtered = await manager.rpc("crm_action_signals", {
      p_as_of: asOf,
      p_owner_id: users.manager.id,
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data.totals.totalCount).toBe(2);
    expect(
      filtered.data.items.some(
        (item: { entityId: string }) => item.entityId === managerOverdueId,
      ),
    ).toBe(true);

    const companyAggregate = await manager.rpc("crm_action_signals", {
      p_as_of: asOf,
    });
    expect(companyAggregate.error).toBeNull();

    const executive = await signInAs(users.executive);
    const aggregateOnly = await executive.rpc("crm_action_signals", {
      p_as_of: asOf,
    });
    expect(aggregateOnly.error).toBeNull();
    expect(aggregateOnly.data.totals).toEqual(companyAggregate.data.totals);
    expect(aggregateOnly.data.items).toEqual([]);
    expect(aggregateOnly.data.nextCursor).toBeNull();
  });

  test("denies anonymous direct API access", async () => {
    const anonymous = createClient(
      process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
      process.env.SUPABASE_ANON_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    );
    const result = await anonymous.rpc("crm_action_signals", {
      p_as_of: asOf,
    });
    expect(result.error).not.toBeNull();
  });

  test("rejects malformed keyset cursors instead of returning an ambiguous page", async () => {
    const sales = await signInAs(users.sales);
    const result = await sales.rpc("crm_action_signals", {
      p_as_of: asOf,
      p_after: { priority: 1 },
    });
    expect(result.error?.message).toContain("INVALID_ACTION_SIGNAL_CURSOR");
    expect(result.data).toBeNull();
  });
});
