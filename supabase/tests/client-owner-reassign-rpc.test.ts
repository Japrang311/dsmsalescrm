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
const clientIds: string[] = [];
const activityIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
});

afterAll(async () => {
  await db`drop trigger if exists zzz_test_owner_reassign_activity_failure on public.activity_log`;
  await db`drop function if exists private.zzz_test_owner_reassign_activity_failure()`;

  if (activityIds.length > 0) {
    await adminClient.from("activity_log").delete().in("id", activityIds);
  }
  if (clientIds.length > 0) {
    await adminClient.from("clients").delete().in("id", clientIds);
  }
  await deleteRoleFixtureUsers(fixtures);
  await db.end();
});

async function insertClient() {
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: `Owner Reassign ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientIds.push(data.id);
  return data.id as string;
}

describe("reassign_client_owner", () => {
  test("updates owner and writes one structured client_owner_change audit row atomically", async () => {
    const clientId = await insertClient();
    const managerClient = await signInAs(fixtures.manager);

    const { error } = await managerClient.rpc("reassign_client_owner", {
      p_client_id: clientId,
      p_new_owner_id: fixtures.manager.id,
      p_note: "Territory handover",
    });
    expect(error).toBeNull();

    const { data: client } = await adminClient
      .from("clients")
      .select("owner_id")
      .eq("id", clientId)
      .single();
    expect(client?.owner_id).toBe(fixtures.manager.id);

    const { data: auditRows, error: auditError } = await adminClient
      .from("activity_log")
      .select(
        "id, kind, owner_id, actor_id, client_id, title, detail, event_data",
      )
      .eq("client_id", clientId)
      .eq("kind", "client_owner_change");
    expect(auditError).toBeNull();
    expect(auditRows).toHaveLength(1);

    const audit = auditRows![0];
    activityIds.push(audit.id);
    expect(audit).toMatchObject({
      kind: "client_owner_change",
      owner_id: fixtures.manager.id,
      actor_id: fixtures.manager.id,
      client_id: clientId,
      detail: "Territory handover",
    });
    expect(audit.title).toContain("direassign");
    expect(audit.event_data).toMatchObject({
      schema_version: 1,
      old_owner_id: fixtures.sales.id,
      new_owner_id: fixtures.manager.id,
      note: "Territory handover",
    });
    expect(typeof audit.event_data.effective_at).toBe("string");
  });

  test("rolls back owner update when owner-change audit insert fails", async () => {
    const clientId = await insertClient();
    const managerClient = await signInAs(fixtures.manager);

    try {
      await db`drop trigger if exists zzz_test_owner_reassign_activity_failure on public.activity_log`;
      await db`drop function if exists private.zzz_test_owner_reassign_activity_failure()`;
      await db`
        create or replace function private.zzz_test_owner_reassign_activity_failure()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.kind = 'client_owner_change'::public.activity_kind then
            raise exception 'forced owner reassign audit failure' using errcode = 'P0001';
          end if;
          return new;
        end;
        $$;
      `;
      await db`
        create trigger zzz_test_owner_reassign_activity_failure
        before insert on public.activity_log
        for each row execute function private.zzz_test_owner_reassign_activity_failure();
      `;

      const { error } = await managerClient.rpc("reassign_client_owner", {
        p_client_id: clientId,
        p_new_owner_id: fixtures.manager.id,
        p_note: "Force rollback",
      });
      expect(error?.code).toBe("P0001");

      const { data: client } = await adminClient
        .from("clients")
        .select("owner_id")
        .eq("id", clientId)
        .single();
      expect(client?.owner_id).toBe(fixtures.sales.id);
    } finally {
      await db`drop trigger if exists zzz_test_owner_reassign_activity_failure on public.activity_log`;
      await db`drop function if exists private.zzz_test_owner_reassign_activity_failure()`;
    }
  });
});
