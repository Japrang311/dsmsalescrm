import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";
let users: RoleFixtureUsers;
const clients: string[] = [];
const quotations: string[] = [];
const orders: string[] = [];
beforeAll(async () => {
  users = await createRoleFixtureUsers();
  for (let n = 0; n < 2; n++) {
    const { data, error } = await adminClient
      .from("clients")
      .insert({
        name: `Synthetic lineage ${n}`,
        owner_id: users.sales.id,
        source: "Referral",
      })
      .select("id")
      .single();
    if (error) throw error;
    clients.push(data.id);
  }
});
afterAll(async () => {
  await adminClient.from("activity_log").delete().in("sales_order_id", orders);
  await adminClient
    .from("sales_order_items")
    .delete()
    .in("sales_order_id", orders);
  await adminClient.from("sales_orders").delete().in("id", orders);
  await adminClient.from("commercial_documents").delete().in("id", quotations);
  await adminClient.from("clients").delete().in("id", clients);
  await deleteRoleFixtureUsers(users);
});
async function quotation(patch: Record<string, unknown> = {}) {
  const number = `SYN-QUO-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      type: "Quotation",
      client_id: clients[0],
      owner_id: users.sales.id,
      source_flow: "RFQ / New Product",
      stage: "Closed Won",
      document_date: "2026-02-01",
      quotation_number: number,
      quotation_base_number: number,
      is_current_revision: true,
      ...patch,
    })
    .select("id")
    .single();
  if (error) throw error;
  quotations.push(data.id);
  return data.id;
}
function args(quotationId: string | null) {
  return {
    p_client_id: clients[0],
    p_date: "2026-02-15",
    p_customer_po_number: "Synthetic PO",
    p_type: "Regular",
    p_tax_type: "PPN",
    p_prototype_status: null,
    p_source: "RFQ / New Product",
    p_number_mode: "Manual",
    p_manual_so_number: `SYN-${crypto.randomUUID()}`,
    p_backdate_reason: null,
    p_items: [
      { productName: "Synthetic", qty: 1, uom: "Unit", unitPrice: 1000 },
    ],
    p_source_commercial_document_id: quotationId,
  };
}
test("create rejects cross-client, non-Won, superseded, deleted and foreign-owner quotation", async () => {
  const caller = await signInAs(users.sales);
  for (const patch of [
    { client_id: clients[1] },
    { stage: "Quotes Sent" },
    { is_current_revision: false },
    { deleted_at: new Date().toISOString(), deleted_by: users.sales.id },
    { owner_id: users.manager.id },
  ]) {
    const id = await quotation(patch);
    const result = await caller.rpc("create_sales_order", args(id));
    if (result.data?.id) orders.push(result.data.id);
    expect(result.error).not.toBeNull();
  }
});
test("linked clients remain immutable on either side; direct repeat stays available", async () => {
  const caller = await signInAs(users.sales);
  const id = await quotation();
  const linked = await caller.rpc("create_sales_order", args(id));
  expect(linked.error).toBeNull();
  orders.push(linked.data.id);
  const correction = await caller.rpc("correct_sales_order_header", {
    p_id: linked.data.id,
    p_expected_updated_at: linked.data.updated_at,
    p_request_id: crypto.randomUUID(),
    p_patch: { client_id: clients[1] },
    p_reason: "Synthetic cross-client correction",
  });
  expect(correction.error?.message).toContain("LINKED_CLIENT_IMMUTABLE");
  const manipulated = await caller
    .from("commercial_documents")
    .update({ client_id: clients[1] })
    .eq("id", id);
  expect(manipulated.error).not.toBeNull();
  const direct = await caller.rpc("create_sales_order", args(null));
  expect(direct.error).toBeNull();
  orders.push(direct.data.id);
});
test("concurrent create/link does not reuse a deleted SO's unique link", async () => {
  const caller = await signInAs(users.sales);
  const id = await quotation();
  const results = await Promise.all([
    caller.rpc("create_sales_order", args(id)),
    caller.rpc("create_sales_order", args(id)),
  ]);
  for (const result of results)
    if (result.data?.id) orders.push(result.data.id);
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  const winner = results.find((result) => !result.error)!.data;
  const deleted = await caller.rpc("set_sales_order_deleted", {
    p_sales_order_id: winner.id,
    p_deleted: true,
  });
  expect(deleted.error).toBeNull();
  const retry = await caller.rpc("create_sales_order", args(id));
  expect(retry.error?.message).toContain("QUOTATION_ALREADY_HAS_SALES_ORDER");
});
