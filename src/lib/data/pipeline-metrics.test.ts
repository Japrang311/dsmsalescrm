import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { getPipelineMetrics } from "./pipeline-metrics";

let fixtures: RoleFixtureUsers;
let clientId: string;
let documentId: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Pipeline metrics fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const { data: document, error: documentError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-08-05",
      quotation_number: `QUO-PIPELINE-${crypto.randomUUID()}`,
      quotation_base_number: `QUO-PIPELINE-${crypto.randomUUID()}`,
      stage: "Quotes Sent",
      is_current_revision: true,
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  documentId = document.id;

  const { error: itemsError } = await adminClient
    .from("commercial_document_items")
    .insert({
      commercial_document_id: documentId,
      description: "Pipeline metrics fixture line",
      qty: 1,
      uom: "Unit",
      unit_price: 12_000,
      line_total: 12_000,
      line_position: 1,
    });
  if (itemsError) throw itemsError;

  const authClient = await signInAs(fixtures.sales);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
});

afterAll(async () => {
  await adminClient
    .from("commercial_document_items")
    .delete()
    .eq("commercial_document_id", documentId);
  await adminClient.from("commercial_documents").delete().eq("id", documentId);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("getPipelineMetrics", () => {
  test("returns stage-level metrics whose totals sum correctly", async () => {
    const metrics = await getPipelineMetrics();

    expect(metrics.stages.length).toBeGreaterThan(0);
    for (const stage of metrics.stages) {
      expect(stage).toHaveProperty("stage");
      expect(stage).toHaveProperty("itemCount");
      expect(stage).toHaveProperty("totalValue");
    }

    const expectedItemCount = metrics.stages.reduce(
      (s, x) => s + x.itemCount,
      0,
    );
    expect(metrics.totals.itemCount).toBe(expectedItemCount);

    const expectedTotalValue = metrics.stages.reduce(
      (s, x) => s + x.totalValue,
      0,
    );
    expect(metrics.totals.totalValue).toBe(expectedTotalValue);

    const decided = metrics.totals.wonCount + metrics.totals.lostCount;
    expect(metrics.totals.winRate).toBe(
      decided > 0 ? (metrics.totals.wonCount / decided) * 100 : 0,
    );
  });

  // A manager can legitimately filter by any owner (matches
  // commercial_documents_select RLS: manager/executive/super_admin see
  // every row). Re-authenticates as manager instead of reusing the sales
  // session from beforeAll, since Sales is now forced to its own owner_id
  // regardless of what it requests -- see the next test.
  test("filters by owner", async () => {
    const managerClient = await signInAs(fixtures.manager);
    const managerSession = (await managerClient.auth.getSession()).data
      .session!;
    await supabase.auth.setSession({
      access_token: managerSession.access_token,
      refresh_token: managerSession.refresh_token,
    });

    const filtered = await getPipelineMetrics({ ownerId: fixtures.sales.id });
    const seeded = filtered.stages.find((s) => s.stage === "Quotes Sent");
    expect(seeded?.itemCount).toBeGreaterThanOrEqual(1);

    const otherOwner = await getPipelineMetrics({
      ownerId: fixtures.executive.id,
    });
    const otherSeeded = otherOwner.stages.find(
      (s) => s.stage === "Quotes Sent",
    );
    expect(otherSeeded?.itemCount ?? 0).toBe(0);

    // Restore the sales session the rest of the file's beforeAll/afterAll
    // setup expects to still be active.
    const salesClient = await signInAs(fixtures.sales);
    const salesSession = (await salesClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: salesSession.access_token,
      refresh_token: salesSession.refresh_token,
    });
  });

  // Security regression test: pipeline_metrics() is security definer and
  // bypasses commercial_documents RLS, so it must replicate RLS's owner
  // scoping itself instead of trusting the caller-supplied p_owner_id. A
  // Sales-role caller passing someone else's ownerId must still only see
  // their own book of business, not the requested owner's.
  test("a Sales caller cannot see another owner's metrics by requesting a different ownerId", async () => {
    const requestedAsSomeoneElse = await getPipelineMetrics({
      ownerId: fixtures.manager.id,
    });
    const seeded = requestedAsSomeoneElse.stages.find(
      (s) => s.stage === "Quotes Sent",
    );
    // Still sees their own seeded item (owner filter was forced back to
    // themselves), not zero and not the manager's data.
    expect(seeded?.itemCount).toBeGreaterThanOrEqual(1);
  });
});
