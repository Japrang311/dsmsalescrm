import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import {
  evaluateRepeatOrderCadence,
  type RepeatOrderCadenceEvaluation,
} from "../../src/lib/repeat-order-cadence";
import { normalizeRepeatOrderSnapshot } from "../../src/lib/data/repeat-order-cadence";
import {
  API_URL,
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const asOfDate = "2026-11-20";

let users: RoleFixtureUsers;
const clientIds: string[] = [];
const salesOrderIds: string[] = [];
const authOnlyUserIds: string[] = [];
const feedbackIds: string[] = [];
let salesCadenceClientId: string;
let insufficientClientId: string;
let seasonalClientId: string;
let dormantClientId: string;

async function insertClient(input: {
  name: string;
  ownerId: string;
  status?: "Active Customer" | "Repeat Order" | "Dormant";
  createdAt: string;
}) {
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: input.name,
      owner_id: input.ownerId,
      status: input.status ?? "Active Customer",
      source: "Repeat",
      created_at: input.createdAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientIds.push(data.id);
  return data.id as string;
}

async function insertSalesOrder(input: {
  clientId: string;
  ownerId: string;
  date: string;
  value?: number;
  foc?: boolean;
  deleted?: boolean;
  source?: "RFQ / New Product" | "Existing / Repeat Order";
}) {
  const { data, error } = await adminClient
    .from("sales_orders")
    .insert({
      so_number: `SO-CADENCE-${crypto.randomUUID()}`,
      client_id: input.clientId,
      owner_id: input.ownerId,
      type: input.foc ? "Prototype" : "Regular",
      tax_type: input.foc ? null : "PPN",
      prototype_status: input.foc ? "FOC" : null,
      source: input.foc
        ? "Prototype FOC"
        : (input.source ?? "Existing / Repeat Order"),
      date: input.date,
      total_value: input.foc ? null : (input.value ?? 1_000),
      deleted_at: input.deleted ? "2026-10-01T00:00:00Z" : null,
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
  const suffix = crypto.randomUUID().slice(0, 8);
  salesCadenceClientId = await insertClient({
    name: `Cadence Transferred ${suffix}`,
    ownerId: users.manager.id,
    status: "Repeat Order",
    createdAt: "2020-01-01T00:00:00Z",
  });
  insufficientClientId = await insertClient({
    name: `Cadence Insufficient ${suffix}`,
    ownerId: users.sales.id,
    createdAt: "2026-07-01T00:00:00Z",
  });
  seasonalClientId = await insertClient({
    name: `Cadence Manager Secret ${suffix}`,
    ownerId: users.manager.id,
    createdAt: "2020-01-01T00:00:00Z",
  });
  dormantClientId = await insertClient({
    name: `Cadence Dormant ${suffix}`,
    ownerId: users.sales.id,
    status: "Dormant",
    createdAt: "2020-01-01T00:00:00Z",
  });

  for (const date of [
    "2025-10-17",
    "2026-06-01",
    "2026-07-01",
    "2026-07-31",
    "2026-07-31",
    "2026-09-29",
  ]) {
    await insertSalesOrder({
      clientId: salesCadenceClientId,
      ownerId: users.manager.id,
      date,
      source:
        date === "2026-07-01" ? "RFQ / New Product" : "Existing / Repeat Order",
    });
  }
  await insertSalesOrder({
    clientId: salesCadenceClientId,
    ownerId: users.manager.id,
    date: "2026-10-01",
    foc: true,
  });
  await insertSalesOrder({
    clientId: salesCadenceClientId,
    ownerId: users.manager.id,
    date: "2026-10-02",
    value: 0,
  });
  await insertSalesOrder({
    clientId: salesCadenceClientId,
    ownerId: users.manager.id,
    date: "2026-10-03",
    deleted: true,
  });
  await insertSalesOrder({
    clientId: salesCadenceClientId,
    ownerId: users.manager.id,
    date: "2026-11-21",
  });

  for (const date of ["2026-07-01", "2026-08-01", "2026-09-01"]) {
    await insertSalesOrder({
      clientId: insufficientClientId,
      ownerId: users.sales.id,
      date,
    });
  }
  for (const date of ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]) {
    await insertSalesOrder({
      clientId: seasonalClientId,
      ownerId: users.manager.id,
      date,
    });
  }
  for (const date of ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]) {
    await insertSalesOrder({
      clientId: dormantClientId,
      ownerId: users.sales.id,
      date,
    });
  }

  const { error: transferError } = await adminClient
    .from("clients")
    .update({ owner_id: users.sales.id })
    .eq("id", salesCadenceClientId);
  if (transferError) throw transferError;
});

afterAll(async () => {
  if (feedbackIds.length > 0) {
    await adminClient
      .from("crm_repeat_order_feedback")
      .delete()
      .in("id", feedbackIds);
  }
  await adminClient.from("sales_orders").delete().in("id", salesOrderIds);
  await adminClient.from("clients").delete().in("id", clientIds);
  for (const id of authOnlyUserIds) {
    await adminClient.auth.admin.deleteUser(id);
  }
  await deleteRoleFixtureUsers(users);
});

function expectMatchesPureEvaluation(
  item: Record<string, unknown>,
  expected: RepeatOrderCadenceEvaluation,
) {
  expect(item).toMatchObject({
    ruleVersion: expected.ruleVersion,
    historyWindowStartDate: expected.historyWindowStartDate,
    historyWindowEndDate: expected.historyWindowEndDate,
    historyObservedFrom: expected.historyObservedFrom,
    historyCoverage: expected.historyCoverage,
    sampleCount: expected.sampleCount,
    intervalCount: expected.intervalCount,
    lastOrderDate: expected.lastOrderDate,
    medianIntervalDays: expected.medianIntervalDays,
    daysSinceLastOrder: expected.daysSinceLastOrder,
    overdueThresholdDays: expected.overdueThresholdDays,
    overdueByDays: expected.overdueByDays,
    state: expected.state,
    reason: expected.reason,
  });
}

describe("crm_repeat_order_cadence", () => {
  test("AC18 reconciles the database aggregate with the pure D05 rule", async () => {
    const caller = await signInAs(users.sales);
    const { data, error } = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_limit: 1,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const snapshot = normalizeRepeatOrderSnapshot(data);
    expect(snapshot.totals).toEqual({
      candidateCount: 2,
      overdueCount: 1,
      onCadenceCount: 0,
      dataInsufficientCount: 1,
      partialHistoryCount: 1,
    });
    expect(snapshot.page).toEqual({
      limit: 1,
      offset: 0,
      returnedCount: 1,
      totalCount: 2,
    });
    expect(snapshot.items[0].clientId).toBe(salesCadenceClientId);
    expectMatchesPureEvaluation(
      snapshot.items[0],
      evaluateRepeatOrderCadence({
        asOfDate,
        historyObservedFrom: "2020-01-01",
        orderDates: [
          "2025-10-17",
          "2026-06-01",
          "2026-07-01",
          "2026-07-31",
          "2026-07-31",
          "2026-09-29",
          "2026-11-21",
        ],
      }),
    );

    const second = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_limit: 1,
      p_offset: 1,
    });
    expect(second.error).toBeNull();
    const secondPage = normalizeRepeatOrderSnapshot(second.data);
    expect(secondPage.totals).toEqual(snapshot.totals);
    expect(secondPage.items[0]).toMatchObject({
      clientId: insufficientClientId,
      state: "data_insufficient",
      sampleCount: 3,
      historyCoverage: "partial_window",
      medianIntervalDays: null,
      overdueThresholdDays: null,
    });
  });

  test("uses current client ownership without rewriting historical SO attribution", async () => {
    const caller = await signInAs(users.sales);
    const result = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
    });
    expect(result.error).toBeNull();
    expect(
      result.data.items.map((item: { clientId: string }) => item.clientId),
    ).toContain(salesCadenceClientId);

    const { data: historicalOrders, error } = await adminClient
      .from("sales_orders")
      .select("owner_id")
      .eq("client_id", salesCadenceClientId);
    expect(error).toBeNull();
    expect(
      historicalOrders?.every((row) => row.owner_id === users.manager.id),
    ).toBe(true);
  });

  test("AC19 prevents cross-owner client names and Sales Order numbers from leaking", async () => {
    const caller = await signInAs(users.sales);
    const { data, error } = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_owner_id: users.manager.id,
    });
    expect(error).toBeNull();
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("Cadence Manager Secret");
    expect(serialized).not.toContain("SO-CADENCE-");
    expect(
      data.items.every(
        (item: { ownerId: string }) => item.ownerId === users.sales.id,
      ),
    ).toBe(true);
  });

  test("manager filters current owners and Executive receives aggregates only", async () => {
    const manager = await signInAs(users.manager);
    const managerResult = await manager.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_owner_id: users.manager.id,
    });
    expect(managerResult.error).toBeNull();
    expect(managerResult.data.totals).toMatchObject({
      candidateCount: 1,
      onCadenceCount: 1,
    });
    expect(managerResult.data.items[0].clientId).toBe(seasonalClientId);

    const executive = await signInAs(users.executive);
    const executiveResult = await executive.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
    });
    expect(executiveResult.error).toBeNull();
    expect(executiveResult.data.totals.candidateCount).toBeGreaterThanOrEqual(
      3,
    );
    expect(executiveResult.data.items).toEqual([]);
    expect(executiveResult.data.page.returnedCount).toBe(0);
  });

  test("filters one client exactly without exposing a different owner", async () => {
    const caller = await signInAs(users.sales);
    const owned = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_client_id: salesCadenceClientId,
      p_limit: 1,
      p_offset: 0,
    });
    expect(owned.error).toBeNull();
    expect(owned.data.totals.candidateCount).toBe(1);
    expect(owned.data.items).toHaveLength(1);
    expect(owned.data.items[0].clientId).toBe(salesCadenceClientId);

    const crossOwner = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_client_id: seasonalClientId,
      p_limit: 1,
      p_offset: 0,
    });
    expect(crossOwner.error).toBeNull();
    expect(crossOwner.data.totals.candidateCount).toBe(0);
    expect(crossOwner.data.items).toEqual([]);
  });

  test("stores idempotent owner-scoped D05 feedback and annotates the signal", async () => {
    const caller = await signInAs(users.sales);
    const requestId = crypto.randomUUID();
    const input = {
      p_request_id: requestId,
      p_client_id: salesCadenceClientId,
      p_feedback: "relevant",
      p_reason: "Cadence sesuai pola pembelian fixture",
      p_as_of: asOfDate,
    };
    const [left, right] = await Promise.all([
      caller.rpc("record_crm_repeat_order_feedback", input),
      caller.rpc("record_crm_repeat_order_feedback", input),
    ]);
    expect(left.error).toBeNull();
    expect(right.error).toBeNull();
    expect(right.data).toEqual(left.data);
    feedbackIds.push(left.data.id);

    const snapshot = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_client_id: salesCadenceClientId,
      p_limit: 1,
      p_offset: 0,
    });
    expect(snapshot.error).toBeNull();
    expect(snapshot.data.items[0]).toMatchObject({
      clientId: salesCadenceClientId,
      latestFeedback: "relevant",
      feedbackReason: "Cadence sesuai pola pembelian fixture",
      feedbackRuleVersion: "d05-v1",
    });

    const mismatch = await caller.rpc("record_crm_repeat_order_feedback", {
      ...input,
      p_feedback: "not_relevant",
    });
    expect(mismatch.error?.message).toContain("REQUEST_PAYLOAD_MISMATCH");

    const direct = await caller.from("crm_repeat_order_feedback").insert({
      client_id: salesCadenceClientId,
      owner_id: users.sales.id,
      actor_id: users.sales.id,
      feedback: "relevant",
      reason: "Direct API must fail",
      request_id: crypto.randomUUID(),
    });
    expect(direct.error).toBeDefined();
  });

  test("rejects feedback from Executive, another owner, or a non-overdue cadence", async () => {
    const executive = await signInAs(users.executive);
    const executiveResult = await executive.rpc(
      "record_crm_repeat_order_feedback",
      {
        p_request_id: crypto.randomUUID(),
        p_client_id: salesCadenceClientId,
        p_feedback: "relevant",
        p_reason: "Executive cannot mutate",
        p_as_of: asOfDate,
      },
    );
    expect(executiveResult.error?.message).toContain(
      "ACTIVE_MUTATING_ROLE_REQUIRED",
    );

    const caller = await signInAs(users.sales);
    const crossOwner = await caller.rpc("record_crm_repeat_order_feedback", {
      p_request_id: crypto.randomUUID(),
      p_client_id: seasonalClientId,
      p_feedback: "not_relevant",
      p_reason: "Must not cross owner",
      p_as_of: asOfDate,
    });
    expect(crossOwner.error?.message).toContain("CLIENT_OWNERSHIP_REQUIRED");

    const notOverdue = await caller.rpc("record_crm_repeat_order_feedback", {
      p_request_id: crypto.randomUUID(),
      p_client_id: insufficientClientId,
      p_feedback: "not_relevant",
      p_reason: "Insufficient data is not a risk signal",
      p_as_of: asOfDate,
    });
    expect(notOverdue.error?.message).toContain(
      "REPEAT_ORDER_SIGNAL_NOT_OVERDUE",
    );
  });

  test("rolls back feedback when persistence fails", async () => {
    const caller = await signInAs(users.sales);
    const requestId = crypto.randomUUID();
    try {
      await db`
        create or replace function private.zzz_fail_repeat_order_feedback()
        returns trigger language plpgsql set search_path = '' as $$
        begin
          if new.reason = 'FORCE_REPEAT_FEEDBACK_ROLLBACK' then
            raise exception 'forced repeat feedback failure';
          end if;
          return new;
        end $$
      `;
      await db`
        create trigger zzz_fail_repeat_order_feedback
        before insert on public.crm_repeat_order_feedback
        for each row execute function private.zzz_fail_repeat_order_feedback()
      `;

      const failed = await caller.rpc("record_crm_repeat_order_feedback", {
        p_request_id: requestId,
        p_client_id: salesCadenceClientId,
        p_feedback: "not_relevant",
        p_reason: "FORCE_REPEAT_FEEDBACK_ROLLBACK",
        p_as_of: asOfDate,
      });
      expect(failed.error?.message).toContain("forced repeat feedback failure");

      const stored = await adminClient
        .from("crm_repeat_order_feedback")
        .select("id")
        .eq("request_id", requestId);
      expect(stored.error).toBeNull();
      expect(stored.data).toEqual([]);
    } finally {
      await db`drop trigger if exists zzz_fail_repeat_order_feedback on public.crm_repeat_order_feedback`;
      await db`drop function if exists private.zzz_fail_repeat_order_feedback()`;
    }
  });

  test("excludes Dormant by default but permits an explicit status review", async () => {
    const caller = await signInAs(users.sales);
    const defaultResult = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
    });
    expect(defaultResult.error).toBeNull();
    expect(
      defaultResult.data.items.map(
        (item: { clientId: string }) => item.clientId,
      ),
    ).not.toContain(dormantClientId);

    const reviewResult = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_client_status: "Dormant",
    });
    expect(reviewResult.error).toBeNull();
    expect(reviewResult.data.totals.candidateCount).toBe(1);
    expect(reviewResult.data.items[0]).toMatchObject({
      clientId: dormantClientId,
      clientStatus: "Dormant",
      state: "overdue",
    });
  });

  test("rejects anonymous callers and invalid pagination", async () => {
    const anonymous = createClient(API_URL, ANON_KEY);
    const anonymousResult = await anonymous.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
    });
    expect(anonymousResult.error).toBeDefined();

    const caller = await signInAs(users.sales);
    const invalidPage = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
      p_limit: 0,
    });
    expect(invalidPage.error?.message).toContain("INVALID_REPEAT_ORDER_PAGE");
  });

  test("fails closed for an authenticated caller without an active profile", async () => {
    const email = `cadence-no-profile+${crypto.randomUUID()}@local.dsm.test`;
    const password = `probe-${crypto.randomUUID()}`;
    const created = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    authOnlyUserIds.push(created.data.user.id);
    const caller = createClient(API_URL, ANON_KEY);
    const signedIn = await caller.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;

    const result = await caller.rpc("crm_repeat_order_cadence", {
      p_as_of: asOfDate,
    });
    expect(result.error?.message).toContain("ACTIVE_PROFILE_REQUIRED");
  });
});
