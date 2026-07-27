import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";
import { DUE_STATE_FIXTURES } from "./business-calendar-fixtures";

let fixtures: RoleFixtureUsers;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
});

afterAll(async () => {
  await deleteRoleFixtureUsers(fixtures);
});

describe("public.compute_task_due_state fixture equivalence (DB side)", () => {
  for (const fixture of DUE_STATE_FIXTURES) {
    test(fixture.label, async () => {
      const rows = fixture.holidays.map((holiday_date) => ({
        holiday_date,
        label: "Fixture holiday",
        source: "test",
      }));
      if (rows.length > 0) {
        const { error: seedError } = await adminClient
          .from("business_calendar_holidays")
          .upsert(rows, { onConflict: "holiday_date", ignoreDuplicates: true });
        if (seedError) throw seedError;
      }

      try {
        const { data, error } = await adminClient.rpc(
          "compute_task_due_state",
          {
            p_due_date: fixture.dueDate,
            p_workflow_status: fixture.workflowStatus,
            p_as_of: fixture.asOf,
          },
        );
        if (error) throw error;
        const row = data![0];
        expect(row.due_state).toBe(fixture.expected.dueState);
        expect(row.calendar_incomplete).toBe(fixture.expected.calendarIncomplete);
      } finally {
        if (fixture.holidays.length > 0) {
          await adminClient
            .from("business_calendar_holidays")
            .delete()
            .in("holiday_date", fixture.holidays);
        }
      }
    });
  }
});

describe("public.compute_task_due_state timezone boundary", () => {
  test("defaults to the current Asia/Jakarta date when p_as_of is omitted", async () => {
    const jakartaToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data, error } = await adminClient.rpc("compute_task_due_state", {
      p_due_date: jakartaToday,
      p_workflow_status: "Open",
    });
    if (error) throw error;
    // If the DB used a different timezone (e.g. UTC) for "now", a due date
    // of "Jakarta today" could read back as Upcoming or Overdue instead of
    // Today near midnight boundaries -- this proves it reads Jakarta time.
    expect(data![0].due_state).toBe("Today");
  });
});

describe("business_calendar_holidays corrections are not cached", () => {
  test("recomputing after inserting then removing a holiday reflects the current calendar each time", async () => {
    const dueDate = "2026-02-02"; // Monday
    const asOf = "2026-02-05"; // Thursday: 2 business days without a holiday

    const before = await adminClient.rpc("compute_task_due_state", {
      p_due_date: dueDate,
      p_workflow_status: "Open",
      p_as_of: asOf,
    });
    if (before.error) throw before.error;
    expect(before.data![0].due_state).toBe("Escalated");

    const { error: insertError } = await adminClient
      .from("business_calendar_holidays")
      .insert({
        holiday_date: "2026-02-03", // Tuesday becomes a holiday
        label: "Correction test holiday",
        source: "test",
      });
    if (insertError) throw insertError;

    const during = await adminClient.rpc("compute_task_due_state", {
      p_due_date: dueDate,
      p_workflow_status: "Open",
      p_as_of: asOf,
    });
    if (during.error) throw during.error;
    // Only Wednesday counts now -- 1 business day, not yet Escalated.
    expect(during.data![0].due_state).toBe("Overdue");

    const { error: deleteError } = await adminClient
      .from("business_calendar_holidays")
      .delete()
      .eq("holiday_date", "2026-02-03");
    if (deleteError) throw deleteError;

    const after = await adminClient.rpc("compute_task_due_state", {
      p_due_date: dueDate,
      p_workflow_status: "Open",
      p_as_of: asOf,
    });
    if (after.error) throw after.error;
    expect(after.data![0].due_state).toBe("Escalated");
  });
});

describe("business_calendar_holidays RLS", () => {
  test("every authenticated role can read the calendar", async () => {
    for (const role of [
      "sales",
      "manager",
      "executive",
      "super_admin",
    ] as const) {
      const client = await signInAs(fixtures[role]);
      const { error } = await client
        .from("business_calendar_holidays")
        .select("id")
        .limit(1);
      expect(error).toBeNull();
    }
  });

  test("sales and executive cannot insert or delete holiday rows", async () => {
    for (const role of ["sales", "executive"] as const) {
      const client = await signInAs(fixtures[role]);
      const { data, error } = await client
        .from("business_calendar_holidays")
        .insert({
          holiday_date: "2031-05-05",
          label: "Should be rejected",
          source: "test",
        })
        .select("id");
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    }
  });

  test("manager and super_admin can insert and delete holiday rows", async () => {
    for (const role of ["manager", "super_admin"] as const) {
      const client = await signInAs(fixtures[role]);
      const { data, error } = await client
        .from("business_calendar_holidays")
        .insert({
          holiday_date: role === "manager" ? "2031-05-06" : "2031-05-07",
          label: "Admin-entered holiday",
          source: "test",
        })
        .select("id, holiday_date")
        .single();
      expect(error).toBeNull();

      const { error: deleteError } = await client
        .from("business_calendar_holidays")
        .delete()
        .eq("id", data!.id);
      expect(deleteError).toBeNull();
    }
  });
});
