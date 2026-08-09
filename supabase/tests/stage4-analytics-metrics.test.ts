// Integration coverage for the six Stage 4 Task 4.4 analytics RPCs
// (commercial_win_loss_metrics, commercial_lost_reason_metrics,
// commercial_cycle_time_metrics, commercial_stage_funnel_metrics,
// commercial_stage_dwell_metrics, commercial_analytics_coverage). Proves:
// role scoping (sales forced to own owner_id, manager unrestricted), period
// filters, empty data, legacy data (Quotations with no structured stage
// event), and invalid lineage (Sales Orders missing source_commercial_
// document_id / customer_po_date) are all handled without error and
// without inferring/backfilling anything.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import {
  adminClient,
  API_URL,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let fixtures: RoleFixtureUsers;
let clientId: string;
const documentIds: Record<string, string> = {};
const salesOrderIds: string[] = [];
const activityIds: string[] = [];

// Seeded local profile (Manager "Adhitya", see supabase/seed.sql) used the
// same way sales-orders.test.ts does: a real, always-present owner distinct
// from our random-per-run fixtures, to prove role scoping actually excludes
// someone else's data rather than just having nothing to exclude.
const OTHER_OWNER_ID = "22222222-2222-2222-2222-222222222222";

async function insertQuotation(row: {
  label: string;
  stage: string;
  documentDate: string;
  ownerId: string;
  lostReason?: string;
  lostReasonDetail?: string;
}): Promise<string> {
  const number = `QUO-S4-${row.label}-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: row.ownerId,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: row.documentDate,
      quotation_number: number,
      quotation_base_number: number,
      stage: row.stage,
      is_current_revision: true,
      lost_reason: row.lostReason ?? null,
      lost_reason_detail: row.lostReasonDetail ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertStageEvent(row: {
  documentId: string;
  ownerId: string;
  toStage: string;
  effectiveAt: string;
}) {
  const { data, error } = await adminClient
    .from("activity_log")
    .insert({
      kind: "commercial_item_stage_change",
      owner_id: row.ownerId,
      actor_id: row.ownerId,
      client_id: clientId,
      commercial_document_id: row.documentId,
      title: "Stage change (fixture)",
      detail: "fixture",
      event_data: {
        schema_version: 1,
        from_stage: "N/A",
        to_stage: row.toStage,
        effective_at: row.effectiveAt,
      },
    })
    .select("id")
    .single();
  if (error) throw error;
  activityIds.push(data.id as string);
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Stage 4 metrics fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  documentIds.won = await insertQuotation({
    label: "won",
    stage: "Closed Won",
    documentDate: "2026-01-10",
    ownerId: fixtures.sales.id,
  });
  documentIds.lostReason = await insertQuotation({
    label: "lost-reason",
    stage: "Closed Lost",
    documentDate: "2026-01-12",
    ownerId: fixtures.sales.id,
    lostReason: "Harga tidak kompetitif",
  });
  documentIds.lostLainnya = await insertQuotation({
    label: "lost-lainnya",
    stage: "Closed Lost",
    documentDate: "2026-01-14",
    ownerId: fixtures.sales.id,
    lostReason: "Lainnya",
    lostReasonDetail: "Sebab lain (fixture)",
  });
  // No activity_log event ever written for this one -- the "legacy data"
  // case: a Quotation whose entire stage history predates structured
  // logging (or was otherwise never captured). Must be silently absent
  // from funnel/dwell, and counted as excluded by the coverage RPC, never
  // folded into any stage or treated as zero dwell.
  documentIds.legacy = await insertQuotation({
    label: "legacy",
    stage: "Negotiation",
    documentDate: "2026-01-01",
    ownerId: fixtures.sales.id,
  });
  documentIds.otherOwner = await insertQuotation({
    label: "other-owner",
    stage: "Closed Won",
    documentDate: "2026-01-11",
    ownerId: OTHER_OWNER_ID,
  });

  await insertStageEvent({
    documentId: documentIds.won,
    ownerId: fixtures.sales.id,
    toStage: "Negotiation",
    effectiveAt: "2026-01-10T00:00:00Z",
  });
  await insertStageEvent({
    documentId: documentIds.won,
    ownerId: fixtures.sales.id,
    toStage: "Closed Won",
    effectiveAt: "2026-01-15T00:00:00Z",
  });
  await insertStageEvent({
    documentId: documentIds.lostReason,
    ownerId: fixtures.sales.id,
    toStage: "Closed Lost",
    effectiveAt: "2026-01-12T00:00:00Z",
  });
  await insertStageEvent({
    documentId: documentIds.lostLainnya,
    ownerId: fixtures.sales.id,
    toStage: "Closed Lost",
    effectiveAt: "2026-01-14T00:00:00Z",
  });
  await insertStageEvent({
    documentId: documentIds.otherOwner,
    ownerId: OTHER_OWNER_ID,
    toStage: "Closed Won",
    effectiveAt: "2026-01-11T00:00:00Z",
  });

  // Cycle-time fixtures: one fully-linked SO (both source_commercial_
  // document_id and customer_po_date present -- included in all three
  // legs), one linked-but-no-PO-date SO (included only in quote_to_so,
  // excluded from quote_to_po/po_to_so), one fully unlinked SO (the
  // "invalid lineage" case -- direct-create/repeat-order path, excluded
  // from every leg, never treated as zero days).
  const soRows = [
    {
      label: "linked-with-po",
      so_number: `SO-S4-LINKED-${crypto.randomUUID()}`,
      source_commercial_document_id: documentIds.won,
      customer_po_date: "2026-01-12",
      date: "2026-01-20",
    },
    {
      label: "linked-no-po",
      so_number: `SO-S4-NOPO-${crypto.randomUUID()}`,
      source_commercial_document_id: documentIds.lostReason,
      customer_po_date: null,
      date: "2026-01-25",
    },
    {
      label: "unlinked",
      so_number: `SO-S4-UNLINKED-${crypto.randomUUID()}`,
      source_commercial_document_id: null,
      customer_po_date: null,
      date: "2026-01-05",
    },
  ];
  for (const row of soRows) {
    const { data, error } = await adminClient
      .from("sales_orders")
      .insert({
        so_number: row.so_number,
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "Regular",
        tax_type: "PPN",
        source: "Existing / Repeat Order",
        total_value: 1000,
        date: row.date,
        source_commercial_document_id: row.source_commercial_document_id,
        customer_po_date: row.customer_po_date,
      })
      .select("id")
      .single();
    if (error) throw error;
    salesOrderIds.push(data.id as string);
  }
});

afterAll(async () => {
  await adminClient.from("activity_log").delete().in("id", activityIds);
  await adminClient.from("sales_orders").delete().in("id", salesOrderIds);
  await adminClient
    .from("commercial_documents")
    .delete()
    .in("id", Object.values(documentIds));
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("commercial_win_loss_metrics", () => {
  test("sales is scoped to own Quotations only", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient
      .rpc("commercial_win_loss_metrics")
      .single();
    if (error) throw error;
    const row = data as {
      won_count: number;
      lost_count: number;
      terminal_count: number;
      win_rate: number;
    };
    expect(row.won_count).toBe(1);
    expect(row.lost_count).toBe(2);
    expect(row.terminal_count).toBe(3);
    expect(row.win_rate).toBeCloseTo(1 / 3, 4);
  });

  test("manager sees company-wide totals including the other owner's Quotation", async () => {
    const managerClient = await signInAs(fixtures.manager);
    const { data, error } = await managerClient
      .rpc("commercial_win_loss_metrics", {
        p_client_id: clientId,
      })
      .single();
    if (error) throw error;
    const row = data as { won_count: number; terminal_count: number };
    expect(row.won_count).toBe(2);
    expect(row.terminal_count).toBe(4);
  });

  test("period filter excludes rows outside the window", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient
      .rpc("commercial_win_loss_metrics", {
        p_from: "2026-01-01",
        p_to: "2026-01-13",
      })
      .single();
    if (error) throw error;
    const row = data as { terminal_count: number; lost_count: number };
    // lostLainnya (2026-01-14) falls outside the window; the other two don't.
    expect(row.terminal_count).toBe(2);
    expect(row.lost_count).toBe(1);
  });

  test("empty data returns zero counts and a null win_rate, not an error", async () => {
    const executiveClient = await signInAs(fixtures.executive);
    const { data, error } = await executiveClient
      .rpc("commercial_win_loss_metrics", {
        p_owner_id: "00000000-0000-0000-0000-000000000000",
      })
      .single();
    if (error) throw error;
    const row = data as {
      terminal_count: number;
      won_count: number;
      win_rate: number | null;
    };
    expect(row.terminal_count).toBe(0);
    expect(row.won_count).toBe(0);
    expect(row.win_rate).toBeNull();
  });
});

describe("commercial_lost_reason_metrics", () => {
  test("groups Closed Lost Quotations by the existing lost_reason contract, scoped to sales owner", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient.rpc(
      "commercial_lost_reason_metrics",
    );
    if (error) throw error;
    const rows = data as { lost_reason: string; lost_count: number }[];
    const byReason = Object.fromEntries(
      rows.map((r) => [r.lost_reason, r.lost_count]),
    );
    expect(byReason["Harga tidak kompetitif"]).toBe(1);
    expect(byReason["Lainnya"]).toBe(1);
  });
});

describe("commercial_cycle_time_metrics", () => {
  test("excludes unlinked and PO-date-missing Sales Orders per leg, scoped to sales owner", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient.rpc(
      "commercial_cycle_time_metrics",
      { p_from: "2026-01-01", p_to: "2026-01-31" },
    );
    if (error) throw error;
    const rows = data as {
      leg: string;
      median_days: number | null;
      included_count: number;
      excluded_count: number;
    }[];
    const byLeg = Object.fromEntries(rows.map((r) => [r.leg, r]));

    expect(byLeg.quote_to_po.included_count).toBe(1);
    expect(byLeg.quote_to_po.excluded_count).toBe(2);
    expect(byLeg.quote_to_po.median_days).toBeCloseTo(2, 5);

    expect(byLeg.po_to_so.included_count).toBe(1);
    expect(byLeg.po_to_so.median_days).toBeCloseTo(8, 5);

    // quote_to_so only needs the lineage link, not a PO date -- the
    // "linked-no-po" SO qualifies here even though it's excluded above.
    expect(byLeg.quote_to_so.included_count).toBe(2);
    expect(byLeg.quote_to_so.excluded_count).toBe(1);
  });
});

describe("commercial_stage_funnel_metrics", () => {
  test("counts distinct documents entering each stage from structured events only, scoped to sales owner", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient.rpc(
      "commercial_stage_funnel_metrics",
    );
    if (error) throw error;
    const rows = data as { stage: string; entered_count: number }[];
    const byStage = Object.fromEntries(
      rows.map((r) => [r.stage, r.entered_count]),
    );
    expect(byStage["Negotiation"]).toBe(1);
    expect(byStage["Closed Won"]).toBe(1);
    expect(byStage["Closed Lost"]).toBe(2);
    // The legacy (no-event) Quotation contributes to no stage at all.
    const total = rows.reduce((sum, r) => sum + r.entered_count, 0);
    expect(total).toBe(4);
  });
});

describe("commercial_stage_dwell_metrics", () => {
  test("separates completed dwell (closed interval) from open dwell (still accruing), scoped to sales owner", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient.rpc(
      "commercial_stage_dwell_metrics",
    );
    if (error) throw error;
    const rows = data as {
      stage: string;
      completed_median_days: number | null;
      completed_count: number;
      open_median_days: number | null;
      open_count: number;
    }[];
    const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));

    // Negotiation -> Closed Won took exactly 5 days: a completed interval.
    expect(byStage["Negotiation"].completed_count).toBe(1);
    expect(byStage["Negotiation"].completed_median_days).toBeCloseTo(5, 5);
    expect(byStage["Negotiation"].open_count).toBe(0);

    // Closed Won/Closed Lost rows are each the last event for their
    // document (no next transition) -- open dwell, never completed.
    expect(byStage["Closed Won"].open_count).toBe(1);
    expect(byStage["Closed Won"].completed_count).toBe(0);
    expect(byStage["Closed Lost"].open_count).toBe(2);
  });
});

describe("commercial_analytics_coverage", () => {
  test("reports the legacy no-event Quotation as excluded for funnel/dwell, included elsewhere", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient.rpc(
      "commercial_analytics_coverage",
    );
    if (error) throw error;
    const rows = data as {
      metric_name: string;
      analytics_effective_from: string | null;
      included_count: number;
      excluded_count: number;
    }[];
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric_name, r]));

    expect(byMetric.win_loss.included_count).toBe(3);
    expect(byMetric.win_loss.excluded_count).toBe(0);

    // 4 Quotations total for this sales owner (won, lostReason, lostLainnya,
    // legacy); only the legacy one has zero structured events.
    expect(byMetric.funnel.included_count).toBe(3);
    expect(byMetric.funnel.excluded_count).toBe(1);
    expect(byMetric.funnel.analytics_effective_from).toBe("2026-08-05");
    expect(byMetric.dwell.excluded_count).toBe(1);

    expect(byMetric.cycle_time.included_count).toBe(1);
    expect(byMetric.cycle_time.excluded_count).toBe(2);
  });
});

describe("role gating", () => {
  test("a deactivated/null-role caller is rejected outright (fail-closed)", async () => {
    // anon has no profile at all -- current_user_role() resolves null.
    const anonClient = createClient(API_URL, ANON_KEY);
    const { error } = await anonClient.rpc("commercial_win_loss_metrics");
    expect(error).not.toBeNull();
  });
});
