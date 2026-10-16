import { afterAll, beforeAll, expect, test } from "bun:test";
import { SQL } from "bun";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";
const db = new SQL("postgres://postgres:postgres@127.0.0.1:54322/postgres");
let users: RoleFixtureUsers;
let otherSales: RoleFixtureUsers;
let clientId: string;
const ids: string[] = [];
beforeAll(async () => {
  users = await createRoleFixtureUsers();
  otherSales = await createRoleFixtureUsers({
    roleFixtures: [
      {
        email: "test-other-sales@example.com",
        password: "test-password-123",
        role: "sales",
        name: "Test Other Sales",
        initials: "TO",
      },
    ],
  });
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: "Synthetic correction",
      owner_id: users.sales.id,
      source: "Referral",
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;
});
afterAll(async () => {
  await db`drop trigger if exists crm_test_audit_failure on public.activity_log`;
  await db`drop function if exists private.crm_test_audit_failure()`;
  await adminClient.from("activity_log").delete().in("sales_order_id", ids);
  await adminClient
    .from("sales_order_items")
    .delete()
    .in("sales_order_id", ids);
  await adminClient.from("sales_orders").delete().in("id", ids);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(otherSales);
  await deleteRoleFixtureUsers(users);
  await db.close();
});
async function order() {
  const caller = await signInAs(users.sales);
  const { data, error } = await caller.rpc("create_sales_order", {
    p_client_id: clientId,
    p_date: "2026-02-15",
    p_customer_po_number: "SYN-PO",
    p_type: "Regular",
    p_tax_type: "PPN",
    p_prototype_status: null,
    p_source: "Existing / Repeat Order",
    p_number_mode: "Manual",
    p_manual_so_number: `SYN-${crypto.randomUUID()}`,
    p_backdate_reason: null,
    p_items: [
      { productName: "Synthetic", qty: 2, uom: "Unit", unitPrice: 1000 },
    ],
  });
  if (error) throw error;
  ids.push(data.id);
  return { caller, row: data };
}
test("direct authenticated correction cannot bypass command audit/version", async () => {
  const { caller, row } = await order();
  const result = await caller
    .from("sales_orders")
    .update({ customer_po_number: "BYPASS" })
    .eq("id", row.id);
  expect(result.error).not.toBeNull();
});

test("anonymous caller cannot execute a correction command", async () => {
  const { caller, row } = await order();
  await caller.auth.signOut();
  const result = await caller.rpc("correct_sales_order_header", {
    p_id: row.id,
    p_expected_updated_at: row.updated_at,
    p_request_id: crypto.randomUUID(),
    p_patch: { date: "2026-02-16" },
    p_reason: "Anonymous attempt",
  });
  expect(result.error).not.toBeNull();
});

test("item correction locks/version-checks parent, recomputes total, and replays", async () => {
  const { caller, row } = await order();
  const args = {
    p_id: row.id,
    p_expected_updated_at: row.updated_at,
    p_request_id: crypto.randomUUID(),
    p_operation: "update",
    p_item_id: row.items[0].id,
    p_item: {
      productName: "Synthetic edited",
      description: null,
      qty: 3,
      uom: "Unit",
      unitPrice: 2000,
    },
    p_reason: "Synthetic item correction",
  };
  const result = await caller.rpc("correct_sales_order_item", args);
  expect(result.error).toBeNull();
  expect(result.data.record.total_value).toBe(6000);
  expect(result.data.record.updated_at).not.toBe(row.updated_at);
  expect((await caller.rpc("correct_sales_order_item", args)).data).toEqual(
    result.data,
  );
  const stale = await caller.rpc("correct_sales_order_item", {
    ...args,
    p_request_id: crypto.randomUUID(),
  });
  expect(stale.error?.message).toContain("STALE_VERSION");
  const direct = await caller
    .from("sales_order_items")
    .update({ qty: 20 })
    .eq("id", row.items[0].id);
  expect(direct.error).not.toBeNull();
});

test("item audit failure rolls back item, parent total, and version", async () => {
  const { caller, row } = await order();
  await db.unsafe(
    `create function private.crm_test_audit_failure() returns trigger language plpgsql as $$ begin if new.sales_order_id='${row.id}'::uuid and new.kind='sales_order_item_change' then raise exception 'SYNTHETIC_AUDIT_FAILURE'; end if; return new; end $$; create trigger crm_test_audit_failure before insert on public.activity_log for each row execute function private.crm_test_audit_failure();`,
  );
  try {
    const result = await caller.rpc("correct_sales_order_item", {
      p_id: row.id,
      p_expected_updated_at: row.updated_at,
      p_request_id: crypto.randomUUID(),
      p_operation: "delete",
      p_item_id: row.items[0].id,
      p_item: {},
      p_reason: "Synthetic deletion",
    });
    expect(result.error?.message).toContain("SYNTHETIC_AUDIT_FAILURE");
    const saved = await caller
      .from("sales_orders")
      .select("total_value,updated_at,sales_order_items(*)")
      .eq("id", row.id)
      .single();
    expect(saved.data?.total_value).toBe(row.total_value);
    expect(saved.data?.updated_at).toBe(row.updated_at);
    expect(saved.data?.sales_order_items).toHaveLength(1);
  } finally {
    await db`drop trigger crm_test_audit_failure on public.activity_log`;
    await db`drop function private.crm_test_audit_failure()`;
  }
});
test("header command is versioned, replayable, audited, and no-op safe", async () => {
  const { caller, row } = await order();
  const args = {
    p_id: row.id,
    p_expected_updated_at: row.updated_at,
    p_request_id: crypto.randomUUID(),
    p_patch: { date: "2026-02-16" },
    p_reason: "Synthetic date correction",
  };
  const first = await caller.rpc("correct_sales_order_header", args);
  expect(first.error).toBeNull();
  expect(first.data.record.date).toBe("2026-02-16");
  expect(first.data.auditId).toBeTruthy();
  const replay = await caller.rpc("correct_sales_order_header", args);
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(first.data);
  const different = await caller.rpc("correct_sales_order_header", {
    ...args,
    p_patch: { date: "2026-02-17" },
  });
  expect(different.error?.message).toContain("REQUEST_PAYLOAD_MISMATCH");
  const stale = await caller.rpc("correct_sales_order_header", {
    ...args,
    p_request_id: crypto.randomUUID(),
  });
  expect(stale.error?.message).toContain("STALE_VERSION");
  const noop = await caller.rpc("correct_sales_order_header", {
    ...args,
    p_expected_updated_at: first.data.record.updated_at,
    p_request_id: crypto.randomUUID(),
  });
  expect(noop.error).toBeNull();
  expect(noop.data.auditId).toBeNull();
  const audit = await caller
    .from("activity_log")
    .select("actor_id,owner_id,event_data")
    .eq("id", first.data.auditId)
    .single();
  expect(audit.error).toBeNull();
  expect(audit.data?.actor_id).toBe(users.sales.id);
  expect(audit.data?.event_data.before.date).toBe(row.date);
  expect(audit.data?.event_data.after.date).toBe("2026-02-16");
});
test("concurrent header changes permit exactly one winner", async () => {
  const { caller, row } = await order();
  const args = {
    p_id: row.id,
    p_expected_updated_at: row.updated_at,
    p_patch: { date: "2026-02-16" },
    p_reason: "Synthetic concurrency",
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      caller.rpc("correct_sales_order_header", {
        ...args,
        p_request_id: crypto.randomUUID(),
      }),
    ),
  );
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error?.message).toContain(
    "STALE_VERSION",
  );
});
test("audit insertion failure rolls back header and version", async () => {
  const { caller, row } = await order();
  await db.unsafe(
    `create function private.crm_test_audit_failure() returns trigger language plpgsql as $$ begin if new.sales_order_id='${row.id}'::uuid and new.kind='sales_order_header_change' then raise exception 'SYNTHETIC_AUDIT_FAILURE'; end if; return new; end $$; create trigger crm_test_audit_failure before insert on public.activity_log for each row execute function private.crm_test_audit_failure();`,
  );
  try {
    const result = await caller.rpc("correct_sales_order_header", {
      p_id: row.id,
      p_expected_updated_at: row.updated_at,
      p_request_id: crypto.randomUUID(),
      p_patch: { date: "2026-02-16" },
      p_reason: "Synthetic rollback",
    });
    expect(result.error?.message).toContain("SYNTHETIC_AUDIT_FAILURE");
    const saved = await caller
      .from("sales_orders")
      .select("date,updated_at")
      .eq("id", row.id)
      .single();
    expect(saved.data).toEqual({ date: row.date, updated_at: row.updated_at });
  } finally {
    await db`drop trigger if exists crm_test_audit_failure on public.activity_log`;
    await db`drop function if exists private.crm_test_audit_failure()`;
  }
});
test("Executive and other-owner Sales cannot correct; Manager preserves actor and owner", async () => {
  const { row } = await order();
  const args = {
    p_id: row.id,
    p_expected_updated_at: row.updated_at,
    p_request_id: crypto.randomUUID(),
    p_patch: { date: "2026-02-16" },
    p_reason: "Synthetic manager correction",
  };
  const executive = await signInAs(users.executive);
  expect(
    (await executive.rpc("correct_sales_order_header", args)).error,
  ).not.toBeNull();
  const other = await signInAs(otherSales.sales);
  expect(
    (await other.rpc("correct_sales_order_header", args)).error,
  ).not.toBeNull();
  const manager = await signInAs(users.manager);
  const result = await manager.rpc("correct_sales_order_header", args);
  expect(result.error).toBeNull();
  expect(result.data.record.owner_id).toBe(users.sales.id);
  const audit = await manager
    .from("activity_log")
    .select("actor_id,owner_id")
    .eq("id", result.data.auditId)
    .single();
  expect(audit.data).toEqual({
    actor_id: users.manager.id,
    owner_id: users.sales.id,
  });
  expect(
    (
      await other
        .from("activity_log")
        .select("id")
        .eq("id", result.data.auditId)
    ).data,
  ).toEqual([]);
});
