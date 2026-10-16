import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

let fixtures: RoleFixtureUsers;
let otherFixtures: RoleFixtureUsers;
let clientId: string;
const documentIds: string[] = [];

async function insertQuotation(stage = "Negotiation") {
  const id = crypto.randomUUID();
  const { error } = await adminClient.from("commercial_documents").insert({
    id,
    client_id: clientId,
    owner_id: fixtures.sales.id,
    type: "Quotation",
    source_flow: "RFQ / New Product",
    document_date: "2026-10-16",
    quotation_number: `DSM-26QUO-${id.slice(0, 8)}`,
    quotation_base_number: `DSM-26QUO-${id.slice(0, 8)}`,
    stage,
  });
  if (error) throw error;
  documentIds.push(id);
  return id;
}

async function getDocument(id: string) {
  const { data, error } = await adminClient
    .from("commercial_documents")
    .select("id, stage, expected_close_date, updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  otherFixtures = await createRoleFixtureUsers({
    roleFixtures: [
      {
        email: "expected-close-other-sales@example.com",
        password: "test-password-123",
        role: "sales",
        name: "Other Expected Close Sales",
        initials: "OS",
      },
    ],
  });
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: `Expected close ${crypto.randomUUID()}`,
      status: "Prospect",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;
});

afterAll(async () => {
  await adminClient
    .from("activity_log")
    .delete()
    .in("commercial_document_id", documentIds);
  await adminClient
    .from("tasks")
    .delete()
    .in("commercial_document_id", documentIds);
  await adminClient
    .from("commercial_expected_close_events")
    .delete()
    .in("commercial_document_id", documentIds);
  await adminClient.from("commercial_documents").delete().in("id", documentIds);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
  await deleteRoleFixtureUsers(otherFixtures);
  await db.end();
});

describe("quotation expected close command", () => {
  test("keeps the field nullable without a fake legacy default", async () => {
    const documentId = await insertQuotation();
    const document = await getDocument(documentId);
    expect(document.expected_close_date).toBeNull();

    const [column] = await db`
      select attnotnull, pg_get_expr(adbin, adrelid) as default_expression
      from pg_attribute a
      left join pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.commercial_documents'::regclass
        and a.attname = 'expected_close_date'
    `;
    expect(column.attnotnull).toBe(false);
    expect(column.default_expression).toBeNull();
  });

  test("rejects a new Commit without a date through direct insert and stage RPC", async () => {
    const directId = crypto.randomUUID();
    const { error: insertError } = await adminClient
      .from("commercial_documents")
      .insert({
        id: directId,
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "Quotation",
        source_flow: "RFQ / New Product",
        document_date: "2026-10-16",
        quotation_number: `DSM-26QUO-${directId.slice(0, 8)}`,
        quotation_base_number: `DSM-26QUO-${directId.slice(0, 8)}`,
        stage: "Commit",
      });
    expect(insertError?.message).toContain(
      "EXPECTED_CLOSE_REQUIRED_FOR_COMMIT",
    );

    const documentId = await insertQuotation("Hot Prospect");
    const sales = await signInAs(fixtures.sales);
    const { error } = await sales.rpc("transition_commercial_stage", {
      p_commercial_document_id: documentId,
      p_expected_from_stage: "Hot Prospect",
      p_to_stage: "Commit",
      p_create_task_title: "Commit validation",
      p_task_due_date: "2026-10-17",
      p_next_action: "Wait for PO",
      p_next_action_date: "2026-10-18",
    });
    expect(error?.message).toContain("EXPECTED_CLOSE_REQUIRED_FOR_COMMIT");
    expect((await getDocument(documentId)).stage).toBe("Hot Prospect");
  });

  test("creates a Commit quotation when the transactional RPC receives a date", async () => {
    const sales = await signInAs(fixtures.sales);
    const { data, error } = await sales.rpc("create_quotation", {
      p_client_id: clientId,
      p_document_date: "2026-10-16",
      p_client_address: null,
      p_stage: "Commit",
      p_so_number: null,
      p_note: null,
      p_items: [
        {
          productName: "Commit with expected close",
          qty: 1,
          uom: "Unit",
          unitPrice: 1000,
        },
      ],
      p_next_action: "Wait for customer PO",
      p_next_action_date: "2026-10-17",
      p_expected_close_date: "2026-10-31",
    });
    expect(error).toBeNull();
    expect(data.expected_close_date).toBe("2026-10-31");
    documentIds.push(data.id);
  });

  test("revision inherits for legacy callers and confirms changes atomically", async () => {
    const documentId = await insertQuotation();
    const initial = await getDocument(documentId);
    const sales = await signInAs(fixtures.sales);
    const setDate = await sales.rpc("set_quotation_expected_close_date", {
      p_document_id: documentId,
      p_expected_updated_at: initial.updated_at,
      p_request_id: crypto.randomUUID(),
      p_expected_close_date: "2026-11-20",
      p_reason: "Prepare revision inheritance test",
    });
    expect(setDate.error).toBeNull();

    const revisionArgs = {
      p_document_date: "2026-10-17",
      p_client_address: null,
      p_so_number: null,
      p_note: null,
      p_items: [
        {
          productName: "Revision expected close item",
          qty: 1,
          uom: "Unit",
          unitPrice: 1000,
        },
      ],
      p_next_action: "Confirm revised quotation",
      p_next_action_date: "2026-10-18",
    };
    const inherited = await sales.rpc("revise_quotation", {
      p_document_id: documentId,
      ...revisionArgs,
    });
    expect(inherited.error).toBeNull();
    expect(inherited.data.expected_close_date).toBe("2026-11-20");
    documentIds.push(inherited.data.id);

    const cleared = await sales.rpc("revise_quotation", {
      p_document_id: inherited.data.id,
      ...revisionArgs,
      p_document_date: "2026-10-18",
      p_expected_close_date: null,
      p_expected_close_confirmed: true,
    });
    expect(cleared.error).toBeNull();
    expect(cleared.data.expected_close_date).toBeNull();
    documentIds.push(cleared.data.id);
  });

  test("writes old/new event, blocks direct bypass, and enforces RLS plus version", async () => {
    const documentId = await insertQuotation();
    const initial = await getDocument(documentId);
    const sales = await signInAs(fixtures.sales);
    const otherSales = await signInAs(otherFixtures.sales);

    const denied = await otherSales.rpc("set_quotation_expected_close_date", {
      p_document_id: documentId,
      p_expected_updated_at: initial.updated_at,
      p_request_id: crypto.randomUUID(),
      p_expected_close_date: "2026-11-12",
      p_reason: null,
    });
    expect(denied.error?.message).toContain("QUOTATION_OWNERSHIP_REQUIRED");

    const { error: bypassError } = await sales
      .from("commercial_documents")
      .update({ expected_close_date: "2026-11-11" })
      .eq("id", documentId);
    expect(bypassError).not.toBeNull();
    expect(
      bypassError?.message.includes("permission denied") ||
        bypassError?.message.includes("EXPECTED_CLOSE_COMMAND_REQUIRED"),
    ).toBe(true);

    const requestId = crypto.randomUUID();
    const changed = await sales.rpc("set_quotation_expected_close_date", {
      p_document_id: documentId,
      p_expected_updated_at: initial.updated_at,
      p_request_id: requestId,
      p_expected_close_date: "2026-11-12",
      p_reason: "Client confirmed procurement timing",
    });
    expect(changed.error).toBeNull();
    expect(changed.data.record.expected_close_date).toBe("2026-11-12");
    expect(changed.data.eventId).toBeTruthy();

    const { data: event, error: eventError } = await sales
      .from("commercial_expected_close_events")
      .select(
        "old_expected_close_date, new_expected_close_date, request_id, reason",
      )
      .eq("id", changed.data.eventId)
      .single();
    expect(eventError).toBeNull();
    expect(event).toEqual({
      old_expected_close_date: null,
      new_expected_close_date: "2026-11-12",
      request_id: requestId,
      reason: "Client confirmed procurement timing",
    });

    const hiddenEvent = await otherSales
      .from("commercial_expected_close_events")
      .select("id")
      .eq("id", changed.data.eventId)
      .maybeSingle();
    expect(hiddenEvent.error).toBeNull();
    expect(hiddenEvent.data).toBeNull();

    const stale = await sales.rpc("set_quotation_expected_close_date", {
      p_document_id: documentId,
      p_expected_updated_at: initial.updated_at,
      p_request_id: crypto.randomUUID(),
      p_expected_close_date: "2026-12-01",
      p_reason: null,
    });
    expect(stale.error?.message).toContain("STALE_VERSION");

    const { error: commitError } = await adminClient
      .from("commercial_documents")
      .update({ stage: "Commit" })
      .eq("id", documentId);
    expect(commitError).toBeNull();
    const cannotClearCommit = await sales.rpc(
      "set_quotation_expected_close_date",
      {
        p_document_id: documentId,
        p_expected_updated_at: changed.data.record.updated_at,
        p_request_id: crypto.randomUUID(),
        p_expected_close_date: null,
        p_reason: null,
      },
    );
    expect(cannotClearCommit.error?.message).toContain(
      "EXPECTED_CLOSE_REQUIRED_FOR_COMMIT",
    );
  });

  test("is retry-safe and one of two concurrent versions loses", async () => {
    const documentId = await insertQuotation();
    const initial = await getDocument(documentId);
    const sales = await signInAs(fixtures.sales);
    const requestId = crypto.randomUUID();
    const args = {
      p_document_id: documentId,
      p_expected_updated_at: initial.updated_at,
      p_request_id: requestId,
      p_expected_close_date: "2026-12-10",
      p_reason: null,
    };

    const first = await sales.rpc("set_quotation_expected_close_date", args);
    const retry = await sales.rpc("set_quotation_expected_close_date", args);
    expect(first.error).toBeNull();
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);

    const concurrentId = await insertQuotation();
    const concurrentVersion = (await getDocument(concurrentId)).updated_at;
    const [left, right] = await Promise.all([
      sales.rpc("set_quotation_expected_close_date", {
        ...args,
        p_document_id: concurrentId,
        p_expected_updated_at: concurrentVersion,
        p_request_id: crypto.randomUUID(),
        p_expected_close_date: "2027-01-10",
      }),
      sales.rpc("set_quotation_expected_close_date", {
        ...args,
        p_document_id: concurrentId,
        p_expected_updated_at: concurrentVersion,
        p_request_id: crypto.randomUUID(),
        p_expected_close_date: "2027-01-11",
      }),
    ]);
    expect(
      [left, right].filter((result) => result.error === null),
    ).toHaveLength(1);
    expect(
      [left, right].find((result) => result.error)?.error?.message,
    ).toContain("STALE_VERSION");
  });

  test("rolls back the date when event persistence fails", async () => {
    const documentId = await insertQuotation();
    const initial = await getDocument(documentId);
    const sales = await signInAs(fixtures.sales);

    try {
      await db`
        create or replace function private.zzz_fail_expected_close_event()
        returns trigger language plpgsql set search_path = '' as $$
        begin
          if new.reason = 'FORCE_EXPECTED_CLOSE_ROLLBACK' then
            raise exception 'forced expected close event failure';
          end if;
          return new;
        end $$
      `;
      await db`
        create trigger zzz_fail_expected_close_event
        before insert on public.commercial_expected_close_events
        for each row execute function private.zzz_fail_expected_close_event()
      `;

      const failed = await sales.rpc("set_quotation_expected_close_date", {
        p_document_id: documentId,
        p_expected_updated_at: initial.updated_at,
        p_request_id: crypto.randomUUID(),
        p_expected_close_date: "2026-12-20",
        p_reason: "FORCE_EXPECTED_CLOSE_ROLLBACK",
      });
      expect(failed.error?.message).toContain(
        "forced expected close event failure",
      );
      expect((await getDocument(documentId)).expected_close_date).toBeNull();
    } finally {
      await db`drop trigger if exists zzz_fail_expected_close_event on public.commercial_expected_close_events`;
      await db`drop function if exists private.zzz_fail_expected_close_event()`;
    }
  });
});
