import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { createSalesOrder } from "./sales-orders";
import { getSalesOrdersMetrics } from "./sales-orders-metrics";
import { getPipelineMetrics } from "./pipeline-metrics";
import { listSalesOrders } from "./sales-orders";
import { listCommercialItems } from "./commercial-items";
import {
  revenueByTax,
  revenueBySource,
  prototypeSummary,
  waitingPoValue,
  activeCommercialCount,
} from "./dashboard-selectors";
import { NOW, CURRENT_YEAR } from "@/lib/domain";

// Proves the Dashboard KPI row's RPC-aggregated totals (sales_orders_metrics
// + pipeline_metrics, Stage 3) reconcile exactly with the pre-RPC client-side
// selectors (dashboard-selectors.ts) computed from a full unbounded fetch of
// the same underlying rows. Task 3.5: "Add dashboard/report aggregate RPCs
// and reconcile totals."

let fixtures: RoleFixtureUsers;
let clientId: string;
let commitDocumentId: string;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Dashboard reconciliation fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const authClient = await signInAs(fixtures.sales);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  // One PPN "New Product" order, one Non-PPN "Existing" order, and one
  // Paid Prototype order, all dated today so they land inside both the
  // RPCs' [today, today] range and dashboard-selectors' CURRENT_YEAR window.
  await createSalesOrder({
    clientId,
    date: isoDate(NOW),
    customerPoNumber: "PO-RECON-1",
    type: "Regular",
    taxType: "PPN",
    source: "New Product",
    numberMode: "Manual",
    manualSoNumber: `DSM-RECON-${crypto.randomUUID().slice(0, 8)}`,
    items: [
      { productName: "Recon item A", qty: 1, uom: "Pcs", unitPrice: 5_000 },
    ],
  });
  await createSalesOrder({
    clientId,
    date: isoDate(NOW),
    customerPoNumber: "PO-RECON-2",
    type: "Regular",
    taxType: "Non-PPN",
    source: "Existing / Repeat Order",
    numberMode: "Manual",
    manualSoNumber: `DSM-RECON-${crypto.randomUUID().slice(0, 8)}`,
    items: [
      { productName: "Recon item B", qty: 1, uom: "Pcs", unitPrice: 3_000 },
    ],
  });
  await createSalesOrder({
    clientId,
    date: isoDate(NOW),
    customerPoNumber: "PO-RECON-3",
    type: "Prototype",
    prototypeStatus: "Paid",
    taxType: "PPN",
    source: "Prototype Paid",
    numberMode: "Manual",
    manualSoNumber: `DSM-RECON-${crypto.randomUUID().slice(0, 8)}`,
    items: [
      { productName: "Recon prototype", qty: 1, uom: "Pcs", unitPrice: 2_000 },
    ],
  });

  const { data: document, error: documentError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: isoDate(NOW),
      quotation_number: `QUO-RECON-${crypto.randomUUID()}`,
      quotation_base_number: `QUO-RECON-${crypto.randomUUID()}`,
      stage: "Commit",
      is_current_revision: true,
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  commitDocumentId = document.id;

  const { error: itemsError } = await adminClient
    .from("commercial_document_items")
    .insert({
      commercial_document_id: commitDocumentId,
      description: "Reconciliation Commit-stage line",
      qty: 1,
      uom: "Unit",
      unit_price: 9_000,
      line_total: 9_000,
      line_position: 1,
    });
  if (itemsError) throw itemsError;
});

afterAll(async () => {
  await adminClient
    .from("commercial_document_items")
    .delete()
    .eq("commercial_document_id", commitDocumentId);
  await adminClient
    .from("commercial_documents")
    .delete()
    .eq("id", commitDocumentId);
  await adminClient
    .from("activity_log")
    .delete()
    .eq("owner_id", fixtures.sales.id);
  await adminClient
    .from("sales_orders")
    .delete()
    .eq("owner_id", fixtures.sales.id);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
  await supabase.auth.signOut();
});

describe("Dashboard KPI RPC vs client-side selector reconciliation", () => {
  test("sales_orders_metrics matches revenueByTax/revenueBySource/prototypeSummary over a full fetch", async () => {
    const orders = await listSalesOrders();
    const localTax = revenueByTax(orders);
    const localSource = revenueBySource(orders);
    const localProto = prototypeSummary(orders);

    const rpc = await getSalesOrdersMetrics({
      from: new Date(CURRENT_YEAR, 0, 1),
      to: NOW,
      ownerId: fixtures.sales.id,
    });

    expect(rpc.ppnValue).toBe(localTax.ppn);
    expect(rpc.nonPpnValue).toBe(localTax.nonPpn);
    expect(rpc.newProductValue).toBe(localSource.newProduct);
    expect(rpc.existingValue).toBe(localSource.existing);
    expect(rpc.prototypePaidValue).toBe(localSource.prototypePaid);
    expect(rpc.prototypePaidValue).toBe(localProto.paidValue);
    expect(rpc.prototypePaidCount).toBe(localProto.paidCount);
    expect(rpc.focCount).toBe(localProto.focCount);
  });

  test("pipeline_metrics Commit stage matches waitingPoValue, totals.itemCount matches activeCommercialCount", async () => {
    const items = await listCommercialItems();
    const localWaitingPo = waitingPoValue(items);
    const localActiveCount = activeCommercialCount(items);

    const rpc = await getPipelineMetrics({ ownerId: fixtures.sales.id });
    const commitStage = rpc.stages.find((s) => s.stage === "Commit");

    expect(commitStage?.totalValue ?? 0).toBe(localWaitingPo);
    expect(rpc.totals.itemCount).toBe(localActiveCount);
  });
});
