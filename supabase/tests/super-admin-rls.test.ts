import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ROLE_FIXTURES } from "../../tests/fixtures/roles";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const companyWritableTables = [
  "clients",
  "tasks",
  "commercial_documents",
  "sales_orders",
  "follow_up_logs",
] as const;

const mutableOwnerTables = [
  "clients",
  "tasks",
  "commercial_documents",
  "sales_orders",
] as const;

const ownerInsertTables = [...companyWritableTables, "activity_log"] as const;

type CleanupRow = {
  table: string;
  id: string;
};

type FixtureRows = {
  client: string;
  task: string;
  commercialItem: string;
  salesOrder: string;
  followUpLog: string;
  target: string;
  activityLog: string;
};

let fixtures: RoleFixtureUsers | undefined;
let rows: FixtureRows | undefined;
let originalCompanyName: string | undefined;
const cleanupRows: CleanupRow[] = [];

function getFixtures(): RoleFixtureUsers {
  if (!fixtures) throw new Error("Role fixtures were not created");
  return fixtures;
}

function getRows(): FixtureRows {
  if (!rows) throw new Error("Business fixtures were not created");
  return rows;
}

async function insertFixture(
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await adminClient
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  cleanupRows.push({ table, id: data.id });
  return data.id;
}

function trackInsertedRow(table: string, id: string | undefined): void {
  if (id) cleanupRows.push({ table, id });
}

async function collectCleanupFailures(): Promise<unknown[]> {
  const failures: unknown[] = [];

  if (originalCompanyName !== undefined) {
    try {
      const { error } = await adminClient
        .from("org_settings")
        .update({ company_name: originalCompanyName })
        .eq("id", true);
      if (error) failures.push(error);
    } catch (error) {
      failures.push(error);
    }
  }

  for (const { table, id } of cleanupRows.reverse()) {
    try {
      const { error } = await adminClient.from(table).delete().eq("id", id);
      if (error) failures.push(error);
    } catch (error) {
      failures.push(error);
    }
  }
  cleanupRows.length = 0;

  try {
    await deleteRoleFixtureUsers(fixtures);
    fixtures = undefined;
  } catch (error) {
    failures.push(error);
  }

  return failures;
}

async function cleanupFixtures(
  primaryFailure?: unknown,
): Promise<never | void> {
  const cleanupFailures = await collectCleanupFailures();
  if (primaryFailure !== undefined && cleanupFailures.length > 0) {
    throw new AggregateError(
      [primaryFailure, ...cleanupFailures],
      "Task 2 fixture setup failed and cleanup was incomplete",
    );
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures,
      "Task 2 fixture cleanup was incomplete",
    );
  }
}

function valuesForOwnerInsert(
  table: (typeof ownerInsertTables)[number],
  ownerId: string,
  actorId: string,
): Record<string, unknown> {
  const fixtureRows = getRows();
  const marker = crypto.randomUUID();
  switch (table) {
    case "clients":
      return {
        name: `Task 2 owner matrix ${marker}`,
        source: "Referral",
        owner_id: ownerId,
      };
    case "tasks":
      return {
        client_id: fixtureRows.client,
        owner_id: ownerId,
        title: `Task 2 owner matrix ${marker}`,
        due_date: "2026-07-19",
        method: "Email",
      };
    case "commercial_documents":
      return {
        client_id: fixtureRows.client,
        owner_id: ownerId,
        type: "RFQ",
        source_flow: "RFQ / New Product",
        document_date: "2026-07-19",
        rfq_number: `RFQ-TASK-2-${marker}`,
        stage: "Client Request for Quotes",
      };
    case "sales_orders":
      return {
        so_number: `SO-TASK-2-${marker}`,
        client_id: fixtureRows.client,
        owner_id: ownerId,
        type: "Regular",
        tax_type: "PPN",
        source: "RFQ / New Product",
        total_value: 1000,
        date: "2026-07-19",
      };
    case "follow_up_logs":
      return {
        client_id: fixtureRows.client,
        owner_id: ownerId,
        fu_date: "2026-07-19",
        method: "Phone",
        result: "Interested",
        notes: `Task 2 owner matrix ${marker}`,
      };
    case "activity_log":
      return {
        kind: "client_status_change",
        owner_id: ownerId,
        actor_id: actorId,
        client_id: fixtureRows.client,
        title: `Task 2 owner matrix ${marker}`,
      };
  }
}

function supportedUpdateFor(
  table: (typeof mutableOwnerTables)[number],
): Record<string, unknown> {
  switch (table) {
    case "clients":
      return { status: "Dormant" };
    case "tasks":
      return { status: "Done" };
    case "commercial_documents":
      return { stage: "Closed Lost" };
    case "sales_orders":
      return { tax_type: "Non-PPN" };
  }
}

async function withInactiveProfiles(
  profileIds: readonly string[],
  run: () => Promise<void>,
): Promise<void> {
  const setStatus = async (
    accountStatus: "active" | "inactive",
    reason: string,
  ): Promise<unknown[]> => {
    const failures: unknown[] = [];
    for (const id of profileIds) {
      try {
        const { error } = await adminClient
          .from("profiles")
          .update({
            account_status: accountStatus,
            status_change_reason: reason,
          })
          .eq("id", id);
        if (error) failures.push(error);
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  };

  const transitionFailures = await setStatus(
    "inactive",
    "Task 2 invalid destination test",
  );
  if (transitionFailures.length > 0) {
    const rollbackFailures = await setStatus(
      "active",
      "Task 2 invalid destination setup rollback",
    );
    throw new AggregateError(
      [...transitionFailures, ...rollbackFailures],
      "Could not deactivate every Task 2 destination fixture",
    );
  }

  let primaryFailure: unknown;
  try {
    await run();
  } catch (error) {
    primaryFailure = error;
  }

  const reactivationFailures = await setStatus(
    "active",
    "Task 2 invalid destination reset",
  );

  if (primaryFailure !== undefined && reactivationFailures.length > 0) {
    throw new AggregateError(
      [primaryFailure, ...reactivationFailures],
      "Invalid-destination assertion failed and profile reset was incomplete",
    );
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (reactivationFailures.length > 0) {
    throw new AggregateError(
      reactivationFailures,
      "Invalid-destination profile reset was incomplete",
    );
  }
}

beforeAll(async () => {
  try {
    fixtures = await createRoleFixtureUsers();
    const roleUsers = getFixtures();

    const { data: settings, error: settingsError } = await adminClient
      .from("org_settings")
      .select("company_name")
      .eq("id", true)
      .single();
    if (settingsError) throw settingsError;
    originalCompanyName = settings.company_name;

    const client = await insertFixture("clients", {
      name: "Task 2 RLS client",
      source: "Referral",
      owner_id: roleUsers.sales.id,
    });
    const commercialItem = await insertFixture("commercial_documents", {
      client_id: client,
      owner_id: roleUsers.sales.id,
      type: "RFQ",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-18",
      rfq_number: `RFQ-TASK-2-${crypto.randomUUID()}`,
      stage: "Client Request for Quotes",
    });
    const task = await insertFixture("tasks", {
      client_id: client,
      commercial_document_id: commercialItem,
      owner_id: roleUsers.sales.id,
      title: "Task 2 RLS task",
      due_date: "2026-07-18",
      method: "Phone",
    });
    const salesOrder = await insertFixture("sales_orders", {
      so_number: `SO-TASK-2-${crypto.randomUUID()}`,
      client_id: client,
      owner_id: roleUsers.sales.id,
      type: "Regular",
      tax_type: "PPN",
      source: "RFQ / New Product",
      total_value: 1000,
      date: "2026-07-18",
    });
    const followUpLog = await insertFixture("follow_up_logs", {
      task_id: task,
      client_id: client,
      commercial_document_id: commercialItem,
      owner_id: roleUsers.sales.id,
      fu_date: "2026-07-18",
      method: "Phone",
      result: "Interested",
      notes: "Task 2 RLS follow-up",
    });
    const target = await insertFixture("targets", {
      sales_id: roleUsers.sales.id,
      year: 2098,
      month: 1,
      target: 100,
    });
    const activityLog = await insertFixture("activity_log", {
      kind: "client_status_change",
      owner_id: roleUsers.sales.id,
      actor_id: roleUsers.sales.id,
      client_id: client,
      title: "Task 2 RLS activity",
    });

    rows = {
      client,
      task,
      commercialItem,
      salesOrder,
      followUpLog,
      target,
      activityLog,
    };
  } catch (error) {
    await cleanupFixtures(error);
  }
});

afterAll(async () => {
  await cleanupFixtures();
});

test("role fixtures expose the explicit four-role model", () => {
  expect(ROLE_FIXTURES.map(({ role }) => role)).toEqual([
    "sales",
    "manager",
    "executive",
    "super_admin",
  ]);
});

describe("complete four-role operation matrix", () => {
  test("Sales can write own rows and cannot read, write, or update another owner", async () => {
    const roleUsers = getFixtures();
    const salesClient = await signInAs(roleUsers.sales);

    for (const table of ownerInsertTables) {
      const { data: ownInsert, error: ownInsertError } = await salesClient
        .from(table)
        .insert(
          valuesForOwnerInsert(table, roleUsers.sales.id, roleUsers.sales.id),
        )
        .select("id")
        .single();
      expect(ownInsertError).toBeNull();
      trackInsertedRow(table, ownInsert?.id);

      const otherId = await insertFixture(
        table,
        valuesForOwnerInsert(table, roleUsers.manager.id, roleUsers.manager.id),
      );
      const { data: otherRead, error: otherReadError } = await salesClient
        .from(table)
        .select("id")
        .eq("id", otherId);
      if (otherReadError) throw otherReadError;
      expect(otherRead).toEqual([]);

      const { data: otherInsert, error: otherInsertError } = await salesClient
        .from(table)
        .insert(
          valuesForOwnerInsert(table, roleUsers.manager.id, roleUsers.sales.id),
        )
        .select("id")
        .single();
      trackInsertedRow(table, otherInsert?.id);
      expect(otherInsertError).not.toBeNull();

      if (table !== "follow_up_logs" && table !== "activity_log") {
        const { data: ownUpdate, error: ownUpdateError } = await salesClient
          .from(table)
          .update(supportedUpdateFor(table))
          .eq("id", ownInsert!.id)
          .select("id");
        if (ownUpdateError) throw ownUpdateError;
        expect(ownUpdate).toEqual([{ id: ownInsert!.id }]);

        const { data: otherUpdate, error: otherUpdateError } = await salesClient
          .from(table)
          .update(supportedUpdateFor(table))
          .eq("id", otherId)
          .select("id");
        if (otherUpdateError) throw otherUpdateError;
        expect(otherUpdate).toEqual([]);
      }
    }

    const targetInsert = await salesClient
      .from("targets")
      .insert({
        sales_id: roleUsers.sales.id,
        year: 2096,
        month: 1,
        target: 1,
      })
      .select("id")
      .single();
    trackInsertedRow("targets", targetInsert.data?.id);
    expect(targetInsert.error).not.toBeNull();

    const targetUpdate = await salesClient
      .from("targets")
      .update({ target: 999 })
      .eq("id", getRows().target)
      .select("id");
    if (targetUpdate.error) throw targetUpdate.error;
    expect(targetUpdate.data).toEqual([]);

    const settingsUpdate = await salesClient
      .from("org_settings")
      .update({ company_name: "Sales must not update settings" })
      .eq("id", true)
      .select("id");
    if (settingsUpdate.error) throw settingsUpdate.error;
    expect(settingsUpdate.data).toEqual([]);
  });

  test("Manager can write company rows owned by active Sales or Manager", async () => {
    const roleUsers = getFixtures();
    const managerClient = await signInAs(roleUsers.manager);

    for (const table of ownerInsertTables) {
      const { data, error } = await managerClient
        .from(table)
        .insert(
          valuesForOwnerInsert(
            table,
            roleUsers.manager.id,
            roleUsers.manager.id,
          ),
        )
        .select("id")
        .single();
      expect(error).toBeNull();
      trackInsertedRow(table, data?.id);

      if (table !== "follow_up_logs" && table !== "activity_log") {
        const { data: updated, error: updateError } = await managerClient
          .from(table)
          .update(supportedUpdateFor(table))
          .eq("id", data!.id)
          .select("id");
        if (updateError) throw updateError;
        expect(updated).toEqual([{ id: data!.id }]);
      }
    }

    const { data: target, error: targetError } = await managerClient
      .from("targets")
      .insert({
        sales_id: roleUsers.manager.id,
        year: 2096,
        month: 2,
        target: 200,
      })
      .select("id")
      .single();
    expect(targetError).toBeNull();
    trackInsertedRow("targets", target?.id);

    const { data: updatedTarget, error: targetUpdateError } =
      await managerClient
        .from("targets")
        .update({ target: 250 })
        .eq("id", target!.id)
        .select("id");
    if (targetUpdateError) throw targetUpdateError;
    expect(updatedTarget).toEqual([{ id: target!.id }]);

    const { data: settings, error: settingsError } = await managerClient
      .from("org_settings")
      .update({ company_name: "Manager matrix write" })
      .eq("id", true)
      .select("id");
    if (settingsError) throw settingsError;
    expect(settings).toEqual([{ id: true }]);
  });

  test("Executive is denied every write verb granted to website roles", async () => {
    const roleUsers = getFixtures();
    const executiveClient = await signInAs(roleUsers.executive);

    for (const table of ownerInsertTables) {
      const { data, error } = await executiveClient
        .from(table)
        .insert(
          valuesForOwnerInsert(
            table,
            roleUsers.sales.id,
            roleUsers.executive.id,
          ),
        )
        .select("id")
        .single();
      trackInsertedRow(table, data?.id);
      expect(error).not.toBeNull();
    }

    for (const table of mutableOwnerTables) {
      const id = {
        clients: getRows().client,
        tasks: getRows().task,
        commercial_documents: getRows().commercialItem,
        sales_orders: getRows().salesOrder,
      }[table];
      const { data, error } = await executiveClient
        .from(table)
        .update(supportedUpdateFor(table))
        .eq("id", id)
        .select("id");
      if (error) throw error;
      expect(data).toEqual([]);
    }

    const { data: targetInsert, error: targetInsertError } =
      await executiveClient
        .from("targets")
        .insert({
          sales_id: roleUsers.sales.id,
          year: 2096,
          month: 3,
          target: 1,
        })
        .select("id")
        .single();
    trackInsertedRow("targets", targetInsert?.id);
    expect(targetInsertError).not.toBeNull();

    const deniedUpdates = await Promise.all([
      executiveClient
        .from("targets")
        .update({ target: 999 })
        .eq("id", getRows().target)
        .select("id"),
      executiveClient
        .from("org_settings")
        .update({ company_name: "Executive must not write" })
        .eq("id", true)
        .select("id"),
    ]);
    for (const result of deniedUpdates) {
      if (result.error) throw result.error;
      expect(result.data).toEqual([]);
    }
  });

  test("Manager and Executive read recognized revenue through the invoker view", async () => {
    const fixtureRows = getRows();
    for (const role of ["manager", "executive"] as const) {
      const client = await signInAs(getFixtures()[role]);
      const { data, error } = await client
        .from("revenue_recognized")
        .select("id")
        .eq("id", fixtureRows.salesOrder);
      if (error) throw error;
      expect(data).toEqual([{ id: fixtureRows.salesOrder }]);
    }
  });

  test("Sales, Manager, Executive, and Super Admin cannot reassign owner_id directly", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const rowIds = {
      clients: fixtureRows.client,
      tasks: fixtureRows.task,
      commercial_documents: fixtureRows.commercialItem,
      sales_orders: fixtureRows.salesOrder,
    };

    for (const role of [
      "sales",
      "manager",
      "executive",
      "super_admin",
    ] as const) {
      const client = await signInAs(roleUsers[role]);
      for (const table of mutableOwnerTables) {
        const { error } = await client
          .from(table)
          .update({ owner_id: roleUsers.manager.id })
          .eq("id", rowIds[table]);
        expect(error).not.toBeNull();

        const { data: stored, error: storedError } = await adminClient
          .from(table)
          .select("owner_id")
          .eq("id", rowIds[table])
          .single();
        if (storedError) throw storedError;
        expect(stored.owner_id).toBe(roleUsers.sales.id);
      }
    }
  });
});

describe("active Sales-or-Manager ownership destination invariant", () => {
  test("privileged inserts reject Executive, Super Admin, inactive Sales, and inactive Manager destinations", async () => {
    const roleUsers = getFixtures();
    const client = await signInAs(roleUsers.super_admin);
    let nextTargetMonth = 2;

    const assertRejectedDestination = async (
      destinationId: string,
      validTargetOwnerId: string,
    ) => {
      for (const table of ownerInsertTables) {
        const { data, error } = await client
          .from(table)
          .insert(
            valuesForOwnerInsert(
              table,
              destinationId,
              roleUsers.super_admin.id,
            ),
          )
          .select("id")
          .single();
        trackInsertedRow(table, data?.id);
        expect(error).not.toBeNull();
      }

      const { data: target, error: targetError } = await client
        .from("targets")
        .insert({
          sales_id: destinationId,
          year: 2095,
          month: 1,
          target: 1,
        })
        .select("id")
        .single();
      trackInsertedRow("targets", target?.id);
      expect(targetError).not.toBeNull();

      const validTarget = await insertFixture("targets", {
        sales_id: validTargetOwnerId,
        year: 2095,
        month: nextTargetMonth++,
        target: 10,
      });
      const { error: targetUpdateError } = await client
        .from("targets")
        .update({ sales_id: destinationId })
        .eq("id", validTarget);
      expect(targetUpdateError).not.toBeNull();
    };

    await assertRejectedDestination(roleUsers.executive.id, roleUsers.sales.id);
    await assertRejectedDestination(
      roleUsers.super_admin.id,
      roleUsers.sales.id,
    );
    await withInactiveProfiles([roleUsers.sales.id], async () => {
      await assertRejectedDestination(roleUsers.sales.id, roleUsers.manager.id);

      for (const table of mutableOwnerTables) {
        const id = {
          clients: getRows().client,
          tasks: getRows().task,
          commercial_documents: getRows().commercialItem,
          sales_orders: getRows().salesOrder,
        }[table];
        const { error } = await client
          .from(table)
          .update(supportedUpdateFor(table))
          .eq("id", id);
        expect(error).not.toBeNull();
      }
    });
    await withInactiveProfiles([roleUsers.manager.id], async () => {
      await assertRejectedDestination(roleUsers.manager.id, roleUsers.sales.id);
    });
  });
});

describe("Activity Log website attribution boundary", () => {
  test("Sales, Manager, and Super Admin cannot forge actor_id", async () => {
    const roleUsers = getFixtures();
    for (const role of ["sales", "manager", "super_admin"] as const) {
      const client = await signInAs(roleUsers[role]);
      const { data, error } = await client
        .from("activity_log")
        .insert({
          ...valuesForOwnerInsert(
            "activity_log",
            roleUsers.sales.id,
            roleUsers.executive.id,
          ),
          title: `${role} forged actor`,
        })
        .select("id")
        .single();
      trackInsertedRow("activity_log", data?.id);
      expect(error).not.toBeNull();
    }
  });

  test("website callers cannot supply id or created_at", async () => {
    const roleUsers = getFixtures();
    const client = await signInAs(roleUsers.super_admin);

    for (const serverOwnedColumn of ["id", "created_at"] as const) {
      const suppliedId = crypto.randomUUID();
      const { data, error } = await client
        .from("activity_log")
        .insert({
          ...valuesForOwnerInsert(
            "activity_log",
            roleUsers.sales.id,
            roleUsers.super_admin.id,
          ),
          [serverOwnedColumn]:
            serverOwnedColumn === "id" ? suppliedId : "2000-01-01T00:00:00Z",
        })
        .select("id")
        .single();
      trackInsertedRow("activity_log", data?.id ?? suppliedId);
      expect(error).not.toBeNull();
    }
  });

  test("service_role retains full Activity Log server-column access", async () => {
    const roleUsers = getFixtures();
    const id = crypto.randomUUID();
    const createdAt = "2000-01-01T00:00:00Z";
    const { data, error } = await adminClient
      .from("activity_log")
      .insert({
        ...valuesForOwnerInsert(
          "activity_log",
          roleUsers.sales.id,
          roleUsers.super_admin.id,
        ),
        id,
        created_at: createdAt,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;
    trackInsertedRow("activity_log", data.id);
    expect(data.id).toBe(id);
    expect(new Date(data.created_at).toISOString()).toBe(
      new Date(createdAt).toISOString(),
    );
  });
});

describe("active Super Admin company-wide reads", () => {
  for (const table of companyWritableTables) {
    test(`active super admin can select ${table} company-wide`, async () => {
      const roleUsers = getFixtures();
      const fixtureRows = getRows();
      const expectedId = {
        clients: fixtureRows.client,
        tasks: fixtureRows.task,
        commercial_documents: fixtureRows.commercialItem,
        sales_orders: fixtureRows.salesOrder,
        follow_up_logs: fixtureRows.followUpLog,
      }[table];
      const client = await signInAs(roleUsers.super_admin);
      const { data, error } = await client
        .from(table)
        .select("id")
        .eq("id", expectedId);
      if (error) throw error;
      expect(data).toEqual([{ id: expectedId }]);
    });
  }

  test("active super admin can select profiles, targets, activity log, settings, and recognized revenue", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);

    const reads = await Promise.all([
      client.from("profiles").select("id").eq("id", roleUsers.sales.id),
      client.from("targets").select("id").eq("id", fixtureRows.target),
      client
        .from("activity_log")
        .select("id")
        .eq("id", fixtureRows.activityLog),
      client.from("org_settings").select("id").eq("id", true),
      client
        .from("revenue_recognized")
        .select("id")
        .eq("id", fixtureRows.salesOrder),
    ]);

    for (const { error } of reads) expect(error).toBeNull();
    expect(reads.map(({ data }) => data?.length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("active Super Admin supported business writes", () => {
  test("can insert and update a client without changing its owner", async () => {
    const roleUsers = getFixtures();
    const client = await signInAs(roleUsers.super_admin);
    const { data: inserted, error: insertError } = await client
      .from("clients")
      .insert({
        name: "Inserted by Super Admin",
        source: "Referral",
        owner_id: roleUsers.sales.id,
      })
      .select("id, owner_id")
      .single();
    expect(insertError).toBeNull();
    trackInsertedRow("clients", inserted?.id);

    const { data: updated, error: updateError } = await client
      .from("clients")
      .update({ status: "Active Customer" })
      .eq("id", getRows().client)
      .select("id, owner_id");
    expect(updateError).toBeNull();
    expect(updated).toEqual([
      { id: getRows().client, owner_id: roleUsers.sales.id },
    ]);
  });

  test("can insert and update a task without changing its owner", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);
    const { data: inserted, error: insertError } = await client
      .from("tasks")
      .insert({
        client_id: fixtureRows.client,
        owner_id: roleUsers.sales.id,
        title: "Inserted by Super Admin",
        due_date: "2026-07-19",
        method: "Email",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    trackInsertedRow("tasks", inserted?.id);

    const { data: updated, error: updateError } = await client
      .from("tasks")
      .update({ status: "Done" })
      .eq("id", fixtureRows.task)
      .select("id, owner_id");
    expect(updateError).toBeNull();
    expect(updated).toEqual([
      { id: fixtureRows.task, owner_id: roleUsers.sales.id },
    ]);
  });

  test("can insert and update a commercial document without changing its owner", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);
    const { data: inserted, error: insertError } = await client
      .from("commercial_documents")
      .insert({
        client_id: fixtureRows.client,
        owner_id: roleUsers.sales.id,
        type: "RFQ",
        source_flow: "RFQ / New Product",
        document_date: "2026-07-18",
        rfq_number: `RFQ-SA-${crypto.randomUUID()}`,
        stage: "Client Request for Quotes",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    trackInsertedRow("commercial_documents", inserted?.id);

    const { data: updated, error: updateError } = await client
      .from("commercial_documents")
      .update({ stage: "Quotation in Progress" })
      .eq("id", fixtureRows.commercialItem)
      .select("id, owner_id");
    expect(updateError).toBeNull();
    expect(updated).toEqual([
      { id: fixtureRows.commercialItem, owner_id: roleUsers.sales.id },
    ]);
  });

  test("can insert and update a sales order without changing its owner", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);
    const { data: inserted, error: insertError } = await client
      .from("sales_orders")
      .insert({
        so_number: `SO-SA-${crypto.randomUUID()}`,
        client_id: fixtureRows.client,
        owner_id: roleUsers.sales.id,
        type: "Regular",
        tax_type: "PPN",
        source: "RFQ / New Product",
        total_value: 2000,
        date: "2026-07-18",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    trackInsertedRow("sales_orders", inserted?.id);

    const { data: updated, error: updateError } = await client
      .from("sales_orders")
      .update({ tax_type: "Non-PPN" })
      .eq("id", fixtureRows.salesOrder)
      .select("id, owner_id");
    expect(updateError).toBeNull();
    expect(updated).toEqual([
      { id: fixtureRows.salesOrder, owner_id: roleUsers.sales.id },
    ]);
  });

  test("can insert an append-only follow-up log", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);
    const { data, error } = await client
      .from("follow_up_logs")
      .insert({
        client_id: fixtureRows.client,
        owner_id: roleUsers.sales.id,
        fu_date: "2026-07-18",
        method: "Phone",
        result: "Interested",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    trackInsertedRow("follow_up_logs", data?.id);
  });

  test("can insert and update a target", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);
    const { data: inserted, error: insertError } = await client
      .from("targets")
      .insert({
        sales_id: roleUsers.sales.id,
        year: 2098,
        month: 2,
        target: 200,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    trackInsertedRow("targets", inserted?.id);

    const { data: updated, error: updateError } = await client
      .from("targets")
      .update({ target: 300 })
      .eq("id", fixtureRows.target)
      .select("id");
    expect(updateError).toBeNull();
    expect(updated).toEqual([{ id: fixtureRows.target }]);
  });

  test("can update org settings but cannot insert a second singleton", async () => {
    const client = await signInAs(getFixtures().super_admin);
    const { data, error } = await client
      .from("org_settings")
      .update({ company_name: "Updated by Super Admin test" })
      .eq("id", true)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: true }]);

    const { error: insertError } = await client.from("org_settings").insert({
      id: true,
      company_name: "Duplicate",
      fiscal_year: 2027,
      ppn_rate: 0.11,
      dormant_threshold_days: 30,
      risk_overdue_days: 5,
    });
    expect(insertError).not.toBeNull();
  });

  test("can insert activity for a Sales-owned record", async () => {
    const roleUsers = getFixtures();
    const fixtureRows = getRows();
    const client = await signInAs(roleUsers.super_admin);
    const { data, error } = await client
      .from("activity_log")
      .insert({
        kind: "client_status_change",
        owner_id: roleUsers.sales.id,
        actor_id: roleUsers.super_admin.id,
        client_id: fixtureRows.client,
        title: "Super Admin correction",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    trackInsertedRow("activity_log", data?.id);
  });
});

describe("append-only and no-hard-delete boundaries", () => {
  test("Super Admin cannot update or delete activity log rows", async () => {
    const client = await signInAs(getFixtures().super_admin);
    const fixtureRows = getRows();
    const { data: updated, error: updateError } = await client
      .from("activity_log")
      .update({ title: "Tampered" })
      .eq("id", fixtureRows.activityLog)
      .select("id");
    if (!updateError) expect(updated).toEqual([]);

    const { data: deleted, error: deleteError } = await client
      .from("activity_log")
      .delete()
      .eq("id", fixtureRows.activityLog)
      .select("id");
    if (!deleteError) expect(deleted).toEqual([]);

    const { data: stillThere } = await adminClient
      .from("activity_log")
      .select("id, title")
      .eq("id", fixtureRows.activityLog)
      .single();
    expect(stillThere).toEqual({
      id: fixtureRows.activityLog,
      title: "Task 2 RLS activity",
    });
  });

  test("Super Admin cannot update or delete append-only follow-up logs", async () => {
    const client = await signInAs(getFixtures().super_admin);
    const fixtureRows = getRows();
    const { data: updated, error: updateError } = await client
      .from("follow_up_logs")
      .update({ notes: "Tampered" })
      .eq("id", fixtureRows.followUpLog)
      .select("id");
    if (!updateError) expect(updated).toEqual([]);

    const { data: deleted, error: deleteError } = await client
      .from("follow_up_logs")
      .delete()
      .eq("id", fixtureRows.followUpLog)
      .select("id");
    if (!deleteError) expect(deleted).toEqual([]);
  });

  const noHardDeleteTables = [
    "clients",
    "tasks",
    "commercial_documents",
    "sales_orders",
    "targets",
  ] as const;

  for (const table of noHardDeleteTables) {
    test(`Super Admin cannot hard-delete ${table}`, async () => {
      const fixtureRows = getRows();
      const expectedId = {
        clients: fixtureRows.client,
        tasks: fixtureRows.task,
        commercial_documents: fixtureRows.commercialItem,
        sales_orders: fixtureRows.salesOrder,
        targets: fixtureRows.target,
      }[table];
      const client = await signInAs(getFixtures().super_admin);
      const { data, error } = await client
        .from(table)
        .delete()
        .eq("id", expectedId)
        .select("id");
      if (!error) expect(data).toEqual([]);

      const { data: stillThere } = await adminClient
        .from(table)
        .select("id")
        .eq("id", expectedId)
        .single();
      expect(stillThere?.id).toBe(expectedId);
    });
  }
});

test("inactive old token loses profile, owner-bearing, and company-readable access", async () => {
  const roleUsers = getFixtures();
  const fixtureRows = getRows();
  const client = await signInAs(roleUsers.sales);
  const { error: deactivateError } = await adminClient
    .from("profiles")
    .update({
      account_status: "inactive",
      status_change_reason: "Task 2 inactive-token test",
    })
    .eq("id", roleUsers.sales.id);
  if (deactivateError) throw deactivateError;

  let assertionFailure: unknown;
  try {
    const profileRead = await client
      .from("profiles")
      .select("id")
      .eq("id", roleUsers.sales.id);
    const ownerRead = await client
      .from("clients")
      .select("id")
      .eq("id", fixtureRows.client);
    const companyRead = await client
      .from("org_settings")
      .select("id")
      .eq("id", true);
    const ownerUpdate = await client
      .from("clients")
      .update({ status: "Lost" })
      .eq("id", fixtureRows.client)
      .select("id");

    for (const result of [profileRead, ownerRead, companyRead, ownerUpdate]) {
      if (result.error) throw result.error;
      expect(result.data).toEqual([]);
    }
  } catch (error) {
    assertionFailure = error;
  }

  const { error: reactivationError } = await adminClient
    .from("profiles")
    .update({
      account_status: "active",
      status_change_reason: "Task 2 test reset",
    })
    .eq("id", roleUsers.sales.id);
  if (assertionFailure && reactivationError) {
    throw new AggregateError(
      [assertionFailure, reactivationError],
      "Inactive-token assertion failed and profile reactivation was incomplete",
    );
  }
  if (assertionFailure) throw assertionFailure;
  if (reactivationError) throw reactivationError;
});
