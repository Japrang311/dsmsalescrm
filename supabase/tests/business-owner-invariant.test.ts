import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  type RoleFixtureUsers,
} from "./helpers";

let users: RoleFixtureUsers | undefined;
let baseClientId: string | undefined;
const cleanupRows: Array<{ table: string; id: string }> = [];

function fixtures(): RoleFixtureUsers {
  if (!users) throw new Error("Business-owner fixtures are unavailable");
  return users;
}

async function insertTracked(
  table: string,
  values: Record<string, unknown>,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const { data, error } = await adminClient
    .from(table)
    .insert(values)
    .select("id")
    .maybeSingle();
  if (data?.id) cleanupRows.push({ table, id: data.id });
  return { error };
}

async function postgresContainer(): Promise<string> {
  const process = Bun.spawn(["docker", "ps", "--format", "{{.Names}}"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`docker ps failed: ${stderr}`);
  const matches = stdout
    .trim()
    .split("\n")
    .filter((name) => name.startsWith("supabase_db_"));
  if (matches.length !== 1) {
    throw new Error(
      `Expected one local Supabase DB container, got ${matches.length}`,
    );
  }
  return matches[0];
}

function runPsql(container: string, sql: string) {
  return Bun.spawn(
    [
      "docker",
      "exec",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
}

async function resultOf(process: ReturnType<typeof runPsql>) {
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

beforeAll(async () => {
  users = await createRoleFixtureUsers();
  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: "Owner invariant base client",
      status: "Prospect",
      source: "Referral",
      owner_id: fixtures().sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  baseClientId = data.id;
});

afterAll(async () => {
  await adminClient
    .from("clients")
    .delete()
    .in("name", ["Concurrent invalid owner", "Concurrent reassignment source"]);
  for (const { table, id } of cleanupRows.reverse()) {
    await adminClient.from(table).delete().eq("id", id);
  }
  if (baseClientId)
    await adminClient.from("clients").delete().eq("id", baseClientId);
  if (users) {
    await adminClient
      .from("profiles")
      .update({ role: "manager", account_status: "active" })
      .eq("id", users.manager.id);
  }
  await deleteRoleFixtureUsers(users);
});

describe("active business-owner database invariant", () => {
  test("service_role cannot insert any business row for an Executive owner", async () => {
    const owner = fixtures().executive.id;
    const clientId = baseClientId!;
    const marker = crypto.randomUUID();
    const attempts = [
      [
        "clients",
        {
          name: "Invalid owner client",
          status: "Prospect",
          source: "Referral",
          owner_id: owner,
        },
      ],
      [
        "tasks",
        {
          client_id: clientId,
          owner_id: owner,
          title: "Invalid owner task",
          due_date: "2026-07-19",
          method: "Email",
          status: "Upcoming",
        },
      ],
      [
        "commercial_documents",
        {
          client_id: clientId,
          owner_id: owner,
          type: "RFQ",
          source_flow: "RFQ / New Product",
          document_date: "2026-07-19",
          rfq_number: `RFQ-OWNER-INVARIANT-${marker}`,
          stage: "RFQ Received",
        },
      ],
      [
        "sales_orders",
        {
          so_number: `SO-OWNER-INVARIANT-${marker}`,
          client_id: clientId,
          owner_id: owner,
          type: "Regular",
          tax_type: "PPN",
          source: "RFQ / New Product",
          total_value: 1000,
          date: "2026-07-19",
        },
      ],
      [
        "follow_up_logs",
        {
          client_id: clientId,
          owner_id: owner,
          fu_date: "2026-07-19",
          method: "Phone",
          result: "Interested",
        },
      ],
      [
        "targets",
        {
          sales_id: owner,
          year: 2099,
          month: 12,
          target: 1000,
        },
      ],
    ] as const;

    for (const [table, values] of attempts) {
      const { error } = await insertTracked(table, values);
      expect(error?.code, table).toBe("P0001");
      expect(error?.message, table).toContain("INVALID_BUSINESS_OWNER");
    }
  });

  test("an insert waiting behind demotion cannot commit with the demoted owner", async () => {
    const container = await postgresContainer();
    const target = fixtures().manager.id;
    const demotion = runPsql(
      container,
      `begin; update public.profiles set role = 'executive' where id = '${target}'; select pg_sleep(1); commit;`,
    );
    await Bun.sleep(150);
    const insert = runPsql(
      container,
      `begin; set local role service_role; insert into public.clients (name, status, source, owner_id) values ('Concurrent invalid owner', 'Prospect', 'Referral', '${target}'); commit;`,
    );

    const [demotionResult, insertResult] = await Promise.all([
      resultOf(demotion),
      resultOf(insert),
    ]);
    expect(demotionResult.exitCode).toBe(0);
    expect(insertResult.exitCode).not.toBe(0);
    expect(insertResult.stderr).toContain("INVALID_BUSINESS_OWNER");
  });

  test("a reassignment waiting behind deactivation cannot commit with the inactive owner", async () => {
    const container = await postgresContainer();
    const target = fixtures().manager.id;
    await adminClient
      .from("profiles")
      .update({ role: "manager", account_status: "active" })
      .eq("id", target);

    const { data: client, error } = await adminClient
      .from("clients")
      .insert({
        name: "Concurrent reassignment source",
        status: "Prospect",
        source: "Referral",
        owner_id: fixtures().sales.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    cleanupRows.push({ table: "clients", id: client.id });

    const deactivation = runPsql(
      container,
      `begin; update public.profiles set account_status = 'inactive' where id = '${target}'; select pg_sleep(1); commit;`,
    );
    await Bun.sleep(150);
    const reassignment = runPsql(
      container,
      `begin; set local role service_role; update public.clients set owner_id = '${target}' where id = '${client.id}'; commit;`,
    );

    const [deactivationResult, reassignmentResult] = await Promise.all([
      resultOf(deactivation),
      resultOf(reassignment),
    ]);
    expect(deactivationResult.exitCode).toBe(0);
    expect(reassignmentResult.exitCode).not.toBe(0);
    expect(reassignmentResult.stderr).toContain("INVALID_BUSINESS_OWNER");
  });
});
