import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const asOf = "2026-10-17";

let users: RoleFixtureUsers;
const clientIds: string[] = [];
const documentIds: string[] = [];
const activityIds: string[] = [];
const followUpIds: string[] = [];
let snoozeDocumentId: string;
let feedbackDocumentId: string;
let managerDocumentId: string;
let inactiveDocumentId: string;

async function insertClient(name: string, ownerId: string) {
  const { data, error } = await adminClient
    .from("clients")
    .insert({ name, owner_id: ownerId, source: "Referral" })
    .select("id")
    .single();
  if (error) throw error;
  clientIds.push(data.id);
  return data.id as string;
}

async function insertOverdueQuotation(clientId: string, ownerId: string) {
  const number = `QUO-ACTION-${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: ownerId,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-10-01",
      quotation_number: number,
      quotation_base_number: number,
      quotation_revision: 0,
      is_current_revision: true,
      stage: "Negotiation",
      expected_close_date: "2026-10-16",
    })
    .select("id")
    .single();
  if (error) throw error;
  documentIds.push(data.id);

  const { data: stageEvent, error: stageError } = await adminClient
    .from("activity_log")
    .insert({
      kind: "commercial_item_stage_change",
      owner_id: ownerId,
      actor_id: ownerId,
      client_id: clientId,
      commercial_document_id: data.id,
      title: "Stage -> Negotiation",
      detail: "Quotes Sent -> Negotiation",
      created_at: "2026-10-01T03:00:00Z",
      event_data: {
        schema_version: 1,
        from_stage: "Quotes Sent",
        to_stage: "Negotiation",
        effective_at: "2026-10-01T03:00:00Z",
      },
    })
    .select("id")
    .single();
  if (stageError) throw stageError;
  activityIds.push(stageEvent.id);
  return data.id as string;
}

async function getSignal(
  client: Awaited<ReturnType<typeof signInAs>>,
  id: string,
  date = asOf,
) {
  const { data, error } = await client.rpc("crm_action_signals", {
    p_as_of: date,
    p_limit: 100,
  });
  expect(error).toBeNull();
  return {
    snapshot: data,
    item: data.items.find(
      (candidate: { entityId: string; ruleId: string }) =>
        candidate.entityId === id &&
        candidate.ruleId === "expected_close_overdue",
    ),
  };
}

beforeAll(async () => {
  users = await createRoleFixtureUsers();
  const suffix = crypto.randomUUID().slice(0, 8);
  const salesClientId = await insertClient(
    `Signal Action Sales ${suffix}`,
    users.sales.id,
  );
  const managerClientId = await insertClient(
    `Signal Action Manager ${suffix}`,
    users.manager.id,
  );

  snoozeDocumentId = await insertOverdueQuotation(
    salesClientId,
    users.sales.id,
  );
  feedbackDocumentId = await insertOverdueQuotation(
    salesClientId,
    users.sales.id,
  );
  inactiveDocumentId = await insertOverdueQuotation(
    salesClientId,
    users.sales.id,
  );
  managerDocumentId = await insertOverdueQuotation(
    managerClientId,
    users.manager.id,
  );
});

afterAll(async () => {
  await adminClient
    .from("crm_action_signal_actions")
    .delete()
    .in("entity_id", documentIds);
  if (followUpIds.length) {
    await adminClient.from("follow_up_logs").delete().in("id", followUpIds);
  }
  if (activityIds.length) {
    await adminClient.from("activity_log").delete().in("id", activityIds);
  }
  if (users?.manager?.id) {
    await adminClient
      .from("activity_log")
      .delete()
      .eq("target_profile_id", users.manager.id)
      .eq("kind", "team_member_ownership_transferred");
  }
  if (documentIds.length) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .in("id", documentIds);
  }
  if (clientIds.length) {
    await adminClient.from("clients").delete().in("id", clientIds);
  }
  await deleteRoleFixtureUsers(users);
});

describe("CRM action-signal snooze and feedback", () => {
  test("persists an idempotent owner-scoped snooze without changing business status", async () => {
    const sales = await signInAs(users.sales);
    const requestId = crypto.randomUUID();
    const beforeDocument = await adminClient
      .from("commercial_documents")
      .select("stage")
      .eq("id", snoozeDocumentId)
      .single();
    const beforeClient = await adminClient
      .from("clients")
      .select("status")
      .eq("id", clientIds[0])
      .single();

    const result = await sales.rpc("record_crm_action_signal_action", {
      p_request_id: requestId,
      p_entity_id: snoozeDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "snooze",
      p_reason: "Menunggu jadwal keputusan pelanggan",
      p_snoozed_until: "2026-10-20",
      p_feedback: null,
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      entityId: snoozeDocumentId,
      ruleId: "expected_close_overdue",
      actionType: "snooze",
      ownerId: users.sales.id,
      actorId: users.sales.id,
      reason: "Menunggu jadwal keputusan pelanggan",
      snoozedUntil: "2026-10-20",
      ruleVersion: "d06-v1",
    });

    const replay = await sales.rpc("record_crm_action_signal_action", {
      p_request_id: requestId,
      p_entity_id: snoozeDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "snooze",
      p_reason: "Menunggu jadwal keputusan pelanggan",
      p_snoozed_until: "2026-10-20",
      p_feedback: null,
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(result.data);

    const mismatch = await sales.rpc("record_crm_action_signal_action", {
      p_request_id: requestId,
      p_entity_id: snoozeDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "snooze",
      p_reason: "Alasan berbeda",
      p_snoozed_until: "2026-10-20",
      p_feedback: null,
    });
    expect(mismatch.error?.message).toContain("REQUEST_PAYLOAD_MISMATCH");

    const rows = await adminClient
      .from("crm_action_signal_actions")
      .select("actor_id, owner_id, reason, snoozed_until")
      .eq("actor_id", users.sales.id)
      .eq("request_id", requestId);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([
      {
        actor_id: users.sales.id,
        owner_id: users.sales.id,
        reason: "Menunggu jadwal keputusan pelanggan",
        snoozed_until: "2026-10-20",
      },
    ]);

    const afterDocument = await adminClient
      .from("commercial_documents")
      .select("stage")
      .eq("id", snoozeDocumentId)
      .single();
    const afterClient = await adminClient
      .from("clients")
      .select("status")
      .eq("id", clientIds[0])
      .single();
    expect(afterDocument.data).toEqual(beforeDocument.data);
    expect(afterClient.data).toEqual(beforeClient.data);

    const directWrite = await sales.from("crm_action_signal_actions").insert({
      entity_id: snoozeDocumentId,
      rule_id: "expected_close_overdue",
      owner_id: users.sales.id,
      actor_id: users.sales.id,
      action_type: "snooze",
      reason: "Bypass",
      snoozed_until: "2026-10-20",
      rule_version: "d06-v1",
      request_id: crypto.randomUUID(),
    });
    expect(directWrite.error).not.toBeNull();
  });

  test("rejects a manipulated command for a rule that is not currently active", async () => {
    const sales = await signInAs(users.sales);
    const requestId = crypto.randomUUID();
    const result = await sales.rpc("record_crm_action_signal_action", {
      p_request_id: requestId,
      p_entity_id: feedbackDocumentId,
      p_rule_id: "won_without_so",
      p_action_type: "feedback",
      p_reason: "Manipulated inactive rule",
      p_snoozed_until: null,
      p_feedback: "relevant",
    });
    expect(result.error?.message).toContain("ACTION_SIGNAL_NOT_ACTIVE");
    const stored = await adminClient
      .from("crm_action_signal_actions")
      .select("id")
      .eq("request_id", requestId);
    expect(stored.data).toEqual([]);
  });

  test("keeps the snooze through its inclusive boundary and expires it the next day", async () => {
    const sales = await signInAs(users.sales);
    const onBoundary = await getSignal(sales, snoozeDocumentId, "2026-10-20");
    expect(onBoundary.item).toBeUndefined();
    expect(onBoundary.snapshot.totals.snoozedCount).toBe(1);

    const afterBoundary = await getSignal(
      sales,
      snoozeDocumentId,
      "2026-10-21",
    );
    expect(afterBoundary.item).toBeDefined();
    expect(afterBoundary.snapshot.totals.snoozedCount).toBe(0);
  });

  test("a new meaningful event resurfaces the signal before the snooze expires", async () => {
    const { data: followUp, error } = await adminClient
      .from("follow_up_logs")
      .insert({
        client_id: clientIds[0],
        commercial_document_id: snoozeDocumentId,
        owner_id: users.sales.id,
        fu_date: "2026-10-18",
        method: "Phone",
        result: "Interested",
        created_at: "2026-10-18T03:00:00Z",
      })
      .select("id")
      .single();
    if (error) throw error;
    followUpIds.push(followUp.id);

    const sales = await signInAs(users.sales);
    const resurfaced = await getSignal(sales, snoozeDocumentId, "2026-10-19");
    expect(resurfaced.item).toBeDefined();
    expect(resurfaced.snapshot.totals.snoozedCount).toBe(0);
  });

  test("stores latest feedback with actor, reason, and rule version without hiding the signal", async () => {
    const sales = await signInAs(users.sales);
    const relevant = await sales.rpc("record_crm_action_signal_action", {
      p_request_id: crypto.randomUUID(),
      p_entity_id: feedbackDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "feedback",
      p_reason: "Perlu dikejar minggu ini",
      p_snoozed_until: null,
      p_feedback: "relevant",
    });
    expect(relevant.error).toBeNull();

    const manager = await signInAs(users.manager);
    const notRelevant = await manager.rpc("record_crm_action_signal_action", {
      p_request_id: crypto.randomUUID(),
      p_entity_id: feedbackDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "feedback",
      p_reason: "Tanggal administratif, bukan komitmen pelanggan",
      p_snoozed_until: null,
      p_feedback: "not_relevant",
    });
    expect(notRelevant.error).toBeNull();
    expect(notRelevant.data.actorId).toBe(users.manager.id);
    expect(notRelevant.data.ownerId).toBe(users.sales.id);

    const signal = await getSignal(sales, feedbackDocumentId);
    expect(signal.item).toMatchObject({
      latestFeedback: "not_relevant",
      feedbackReason: "Tanggal administratif, bukan komitmen pelanggan",
      feedbackRuleVersion: "d06-v1",
    });
  });

  test("enforces role, owner, anonymous, and inactive-account write boundaries", async () => {
    const input = {
      p_request_id: crypto.randomUUID(),
      p_entity_id: managerDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "feedback",
      p_reason: "Boundary check",
      p_snoozed_until: null,
      p_feedback: "relevant",
    };

    const sales = await signInAs(users.sales);
    const crossOwner = await sales.rpc(
      "record_crm_action_signal_action",
      input,
    );
    expect(crossOwner.error?.code).toBe("42501");

    const executive = await signInAs(users.executive);
    const executiveWrite = await executive.rpc(
      "record_crm_action_signal_action",
      { ...input, p_request_id: crypto.randomUUID() },
    );
    expect(executiveWrite.error?.code).toBe("42501");

    const anonymous = createClient(
      process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
      process.env.SUPABASE_ANON_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    );
    const anonymousWrite = await anonymous.rpc(
      "record_crm_action_signal_action",
      { ...input, p_request_id: crypto.randomUUID() },
    );
    expect(anonymousWrite.error).not.toBeNull();

    const manager = await signInAs(users.manager);
    const managerWrite = await manager.rpc("record_crm_action_signal_action", {
      ...input,
      p_request_id: crypto.randomUUID(),
    });
    expect(managerWrite.error).toBeNull();

    const inactiveSales = await signInAs(users.sales);
    await adminClient
      .from("profiles")
      .update({ account_status: "inactive" })
      .eq("id", users.sales.id);
    try {
      const inactiveWrite = await inactiveSales.rpc(
        "record_crm_action_signal_action",
        {
          ...input,
          p_request_id: crypto.randomUUID(),
          p_entity_id: inactiveDocumentId,
        },
      );
      expect(inactiveWrite.error?.code).toBe("42501");
    } finally {
      await adminClient
        .from("profiles")
        .update({ account_status: "active" })
        .eq("id", users.sales.id);
    }
  });

  test("serializes concurrent retries and exposes action rows only through RLS scope", async () => {
    const sales = await signInAs(users.sales);
    const requestId = crypto.randomUUID();
    const input = {
      p_request_id: requestId,
      p_entity_id: inactiveDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "feedback",
      p_reason: "Concurrent retry",
      p_snoozed_until: null,
      p_feedback: "relevant",
    };
    const [left, right] = await Promise.all([
      sales.rpc("record_crm_action_signal_action", input),
      sales.rpc("record_crm_action_signal_action", input),
    ]);
    expect(left.error).toBeNull();
    expect(right.error).toBeNull();
    expect(right.data).toEqual(left.data);

    const stored = await adminClient
      .from("crm_action_signal_actions")
      .select("id")
      .eq("actor_id", users.sales.id)
      .eq("request_id", requestId);
    expect(stored.data).toHaveLength(1);

    const salesCrossOwner = await sales
      .from("crm_action_signal_actions")
      .select("id")
      .eq("entity_id", managerDocumentId);
    expect(salesCrossOwner.error).toBeNull();
    expect(salesCrossOwner.data).toEqual([]);

    const manager = await signInAs(users.manager);
    const managerRead = await manager
      .from("crm_action_signal_actions")
      .select("id")
      .eq("request_id", requestId);
    expect(managerRead.data).toHaveLength(1);

    const executive = await signInAs(users.executive);
    const executiveRead = await executive
      .from("crm_action_signal_actions")
      .select("id")
      .eq("request_id", requestId);
    expect(executiveRead.error).toBeNull();
    expect(executiveRead.data).toEqual([]);
  });

  test("rolls back the command row when persistence fails", async () => {
    const sales = await signInAs(users.sales);
    const requestId = crypto.randomUUID();
    try {
      await db`
        create or replace function private.zzz_fail_signal_action()
        returns trigger language plpgsql set search_path = '' as $$
        begin
          if new.reason = 'FORCE_SIGNAL_ACTION_ROLLBACK' then
            raise exception 'forced signal action failure';
          end if;
          return new;
        end $$
      `;
      await db`
        create trigger zzz_fail_signal_action
        before insert on public.crm_action_signal_actions
        for each row execute function private.zzz_fail_signal_action()
      `;

      const failed = await sales.rpc("record_crm_action_signal_action", {
        p_request_id: requestId,
        p_entity_id: feedbackDocumentId,
        p_rule_id: "expected_close_overdue",
        p_action_type: "feedback",
        p_reason: "FORCE_SIGNAL_ACTION_ROLLBACK",
        p_snoozed_until: null,
        p_feedback: "not_relevant",
      });
      expect(failed.error?.message).toContain("forced signal action failure");
      const stored = await adminClient
        .from("crm_action_signal_actions")
        .select("id")
        .eq("request_id", requestId);
      expect(stored.data).toEqual([]);
    } finally {
      await db`drop trigger if exists zzz_fail_signal_action on public.crm_action_signal_actions`;
      await db`drop function if exists private.zzz_fail_signal_action()`;
    }
  });

  test("ownership transfer invalidates the previous owner's snooze for the new owner", async () => {
    const manager = await signInAs(users.manager);
    const snooze = await manager.rpc("record_crm_action_signal_action", {
      p_request_id: crypto.randomUUID(),
      p_entity_id: managerDocumentId,
      p_rule_id: "expected_close_overdue",
      p_action_type: "snooze",
      p_reason: "Menunggu handover",
      p_snoozed_until: "2026-10-31",
      p_feedback: null,
    });
    expect(snooze.error).toBeNull();
    expect((await getSignal(manager, managerDocumentId)).item).toBeUndefined();

    const transfer = await adminClient.rpc("admin_transfer_active_ownership", {
      p_actor_id: users.super_admin.id,
      p_source_id: users.manager.id,
      p_destination_id: users.sales.id,
      p_reason: "Task 14 ownership-transfer verification",
    });
    expect(transfer.error).toBeNull();

    const sales = await signInAs(users.sales);
    expect((await getSignal(sales, managerDocumentId)).item).toBeDefined();
  });
});
