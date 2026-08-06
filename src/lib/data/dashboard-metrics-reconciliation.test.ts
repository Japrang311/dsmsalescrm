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
import { createTask, listTasks } from "./tasks";
import {
  revenueByTax,
  revenueBySource,
  prototypeSummary,
  waitingPoValue,
  activeCommercialCount,
  monthlyRevenueTrend,
  targetPerSales,
  isActiveTask,
  isTaskOverdueLike,
} from "./dashboard-selectors";
import {
  getSalesOrdersMonthlyTrend,
  getSalesOrdersOwnerYtd,
} from "./sales-orders-trend";
import {
  getSalesTaskClientMetrics,
  getTopCustomers,
  getRiskAlertCounts,
} from "./sales-performance-metrics";
import { NOW, CURRENT_YEAR, CURRENT_MONTH } from "@/lib/domain";

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

  // One open (due today) and one overdue (due 30 days ago) task, for the
  // sales_task_client_metrics / dashboard_risk_alert_counts reconciliation.
  await createTask({
    clientId,
    ownerId: fixtures.sales.id,
    title: "Recon open task",
    dueDate: isoDate(NOW),
    method: "Phone",
    priority: "Normal",
  });
  const overdueDate = new Date(NOW);
  overdueDate.setDate(overdueDate.getDate() - 30);
  await createTask({
    clientId,
    ownerId: fixtures.sales.id,
    title: "Recon overdue task",
    dueDate: isoDate(overdueDate),
    method: "Phone",
    priority: "Normal",
  });
});

afterAll(async () => {
  await adminClient.from("tasks").delete().eq("owner_id", fixtures.sales.id);
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

  test("sales_orders_monthly_trend's current-month bucket matches a full fetch summed by month", async () => {
    const orders = await listSalesOrders();
    const localCurrentMonthRevenue = orders
      .filter((o) => {
        const d = new Date(o.date);
        return (
          d.getFullYear() === CURRENT_YEAR && d.getMonth() + 1 === CURRENT_MONTH
        );
      })
      .reduce((s, o) => s + (o.value ?? 0), 0);

    const trend = await getSalesOrdersMonthlyTrend({
      ownerId: fixtures.sales.id,
    });
    const rpcCurrentMonth = trend.find((t) => t.month === CURRENT_MONTH);

    expect(rpcCurrentMonth?.revenue ?? 0).toBe(localCurrentMonthRevenue);

    // monthlyRevenueTrend's own revenue-per-month numbers must also match
    // the RPC's, proving the RPC-backed and pre-RPC selectors agree exactly.
    const localTrend = monthlyRevenueTrend(
      orders,
      "sales",
      fixtures.sales.id,
      {},
      [],
    );
    const localCurrent = localTrend.find((_, i) => i === CURRENT_MONTH - 1);
    expect(localCurrent?.revenue).toBe(rpcCurrentMonth?.revenue ?? 0);
  });

  test("sales_orders_owner_ytd matches a full fetch summed by owner", async () => {
    const orders = await listSalesOrders();
    const localOwnerRevenue = orders.reduce((s, o) => s + (o.value ?? 0), 0);

    const ownerYtd = await getSalesOrdersOwnerYtd({
      ownerId: fixtures.sales.id,
    });
    const rpcOwnerRevenue = ownerYtd.find(
      (o) => o.ownerId === fixtures.sales.id,
    )?.revenue;

    expect(rpcOwnerRevenue ?? 0).toBe(localOwnerRevenue);

    // targetPerSales's achievement must also match the RPC's revenue value
    // for the same owner, proving the RPC-backed and pre-RPC selectors agree.
    const localPerSales = targetPerSales(
      orders,
      [{ id: fixtures.sales.id, name: "Fixture Sales", initials: "FS" }],
      {},
    );
    expect(localPerSales[0]?.achievement).toBe(rpcOwnerRevenue ?? 0);
  });

  test("sales_task_client_metrics matches isActiveTask/isTaskOverdueLike/active-client counts over a full fetch", async () => {
    const tasks = await listTasks();
    const localOpen = tasks.filter(
      (t) => t.ownerId === fixtures.sales.id && isActiveTask(t),
    ).length;
    const localOverdue = tasks.filter(
      (t) => t.ownerId === fixtures.sales.id && isTaskOverdueLike(t),
    ).length;

    const metrics = await getSalesTaskClientMetrics({
      ownerId: fixtures.sales.id,
    });
    const row = metrics.find((m) => m.ownerId === fixtures.sales.id);

    expect(row?.openTasks ?? 0).toBe(localOpen);
    expect(row?.overdueTasks ?? 0).toBe(localOverdue);
    expect(row?.activeClients ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("sales_orders_top_customers ranks the fixture client with its full revenue total", async () => {
    const orders = await listSalesOrders();
    const expectedRevenue = orders
      .filter((o) => o.clientId === clientId)
      .reduce((s, o) => s + (o.value ?? 0), 0);

    const top = await getTopCustomers({ ownerId: fixtures.sales.id });
    const row = top.find((c) => c.clientId === clientId);

    expect(row?.revenue).toBe(expectedRevenue);
  });

  test("dashboard_risk_alert_counts' overdue_task_count matches isTaskOverdueLike over a full fetch", async () => {
    const tasks = await listTasks();
    const localOverdue = tasks.filter(
      (t) => t.ownerId === fixtures.sales.id && isTaskOverdueLike(t),
    ).length;

    const counts = await getRiskAlertCounts({ ownerId: fixtures.sales.id });

    expect(counts.overdueTaskCount).toBe(localOverdue);
    // Fixture's Commit-stage item (Rp9.000) is well under the 400 juta
    // "big pending PO" threshold, so it must not be counted.
    expect(counts.bigPendingCommitCount).toBe(0);
  });
});
