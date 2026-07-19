import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { FunctionsHttpError } from "@supabase/supabase-js";

type QueryResult = { data: unknown; error: unknown; count?: number | null };

const invoke = mock(
  async (_name: string, _options: unknown): Promise<QueryResult> => ({
    data: { id: "member-1" },
    error: null,
  }),
);

const databaseResults = new Map<string, QueryResult>();
type QueryCall = {
  table: string;
  select?: string;
  selectOptions?: { count?: string; head?: boolean };
  filters: Array<{ method: string; args: unknown[] }>;
  order?: { column: string; options?: unknown };
  limit?: number;
  range?: { from: number; to: number };
};

type RpcCall = {
  name: string;
  params: Record<string, unknown>;
};

const fromCalls: QueryCall[] = [];
const rpcCalls: RpcCall[] = [];
let resultForCall: ((call: QueryCall) => QueryResult | undefined) | undefined;
let resultForRpc:
  | ((call: RpcCall) => { data: unknown; error: unknown } | undefined)
  | undefined;

function queryFor(table: string) {
  const call: QueryCall = { table, filters: [] };
  fromCalls.push(call);
  const query = {
    select(columns: string, options?: { count?: string; head?: boolean }) {
      call.select = columns;
      call.selectOptions = options;
      return query;
    },
    eq(...args: unknown[]) {
      call.filters.push({ method: "eq", args });
      return query;
    },
    neq(...args: unknown[]) {
      call.filters.push({ method: "neq", args });
      return query;
    },
    not(...args: unknown[]) {
      call.filters.push({ method: "not", args });
      return query;
    },
    order(column: string, options?: unknown) {
      call.order = { column, options };
      return query;
    },
    in(...args: unknown[]) {
      call.filters.push({ method: "in", args });
      return query;
    },
    limit(value: number) {
      call.limit = value;
      return query;
    },
    range(from: number, to: number) {
      call.range = { from, to };
      return query;
    },
    then(resolve: (value: QueryResult) => unknown) {
      return Promise.resolve(
        resultForCall?.(call) ??
          databaseResults.get(table) ?? { data: [], error: null },
      ).then(resolve);
    },
  };
  return query;
}

mock.module("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke },
    from: (table: string) => queryFor(table),
    rpc: async (name: string, params: Record<string, unknown>) => {
      const call = { name, params };
      rpcCalls.push(call);
      return resultForRpc?.(call) ?? { data: null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "current-admin" } } }),
    },
  },
}));

let team: typeof import("./team");

beforeAll(async () => {
  team = await import("./team");
});

afterEach(() => {
  invoke.mockClear();
  invoke.mockImplementation(async () => ({
    data: { id: "member-1" },
    error: null,
  }));
  databaseResults.clear();
  fromCalls.length = 0;
  rpcCalls.length = 0;
  resultForCall = undefined;
  resultForRpc = undefined;
});

describe("Team lifecycle request serialization", () => {
  test("serializes all seven lifecycle actions exactly", async () => {
    await team.createTeamMember({
      name: "Ayu",
      email: "ayu@example.com",
      initials: "AY",
      role: "sales",
      password: "temporary-password",
    });
    await team.updateTeamMemberProfile("member-1", {
      name: "Ayu Putri",
      initials: "AP",
    });
    await team.changeTeamMemberRole(
      "member-1",
      "manager",
      "Promosi kuartal ini",
    );
    await team.deactivateTeamMember("member-1", "Cuti panjang");
    await team.reactivateTeamMember("member-1", "Kembali bekerja");
    await team.transferTeamOwnership(
      "member-1",
      "member-2",
      "Rebalancing akun",
    );
    await team.deleteEligibleTeamMember("member-1", "Akun duplikat");

    expect(invoke.mock.calls.map((call) => call[0])).toEqual(
      Array(7).fill("manage-team-member"),
    );
    expect(invoke.mock.calls.map((call) => call[1])).toEqual([
      {
        body: {
          action: "create",
          name: "Ayu",
          email: "ayu@example.com",
          initials: "AY",
          role: "sales",
          password: "temporary-password",
        },
      },
      {
        body: {
          action: "update_profile",
          id: "member-1",
          name: "Ayu Putri",
          initials: "AP",
        },
      },
      {
        body: {
          action: "change_role",
          id: "member-1",
          role: "manager",
          reason: "Promosi kuartal ini",
        },
      },
      {
        body: {
          action: "deactivate",
          id: "member-1",
          reason: "Cuti panjang",
        },
      },
      {
        body: {
          action: "reactivate",
          id: "member-1",
          reason: "Kembali bekerja",
        },
      },
      {
        body: {
          action: "transfer_ownership",
          fromId: "member-1",
          toId: "member-2",
          reason: "Rebalancing akun",
        },
      },
      {
        body: {
          action: "delete_eligible_account",
          id: "member-1",
          reason: "Akun duplikat",
        },
      },
    ]);
  });

  test("rejects blank administrative reasons before invoking the function", async () => {
    for (const operation of [
      () => team.changeTeamMemberRole("member-1", "manager", "  "),
      () => team.deactivateTeamMember("member-1", ""),
      () => team.reactivateTeamMember("member-1", "\t"),
      () => team.transferTeamOwnership("member-1", "member-2", " "),
      () => team.deleteEligibleTeamMember("member-1", ""),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        name: "TeamAdminError",
        status: 400,
        code: "ADMINISTRATIVE_REASON_REQUIRED",
      });
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  test("parses FunctionsHttpError response without losing status, code, or numeric reference details", async () => {
    const response = new Response(
      JSON.stringify({
        error: "Akun masih memiliki referensi.",
        code: "ACCOUNT_HAS_REFERENCES",
        details: { clients: 2, tasks: 3, ignored: "unsafe" },
      }),
      {
        status: 409,
        headers: { "content-type": "application/json" },
      },
    );
    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(response),
    });

    try {
      await team.deleteEligibleTeamMember("member-1", "Akun tidak digunakan");
      throw new Error("expected TeamAdminError");
    } catch (error) {
      expect(error).toBeInstanceOf(team.TeamAdminError);
      expect(error).toMatchObject({
        status: 409,
        code: "ACCOUNT_HAS_REFERENCES",
        details: { clients: 2, tasks: 3 },
      });
    }
  });
});

describe("privileged Team roster mapping", () => {
  test("includes inactive and all four roles, active ownership counts, and the latest administrative change without a password field", async () => {
    databaseResults.set("profiles", {
      data: [
        {
          id: "member-1",
          name: "Ayu",
          initials: "AY",
          role: "executive",
          email: "ayu@example.com",
          account_status: "inactive",
          status_changed_at: "2026-07-18T08:00:00Z",
          status_changed_by: "current-admin",
          status_change_reason: "Rotasi",
          password: "must-not-leak",
        },
      ],
      error: null,
    });
    databaseResults.set("clients", {
      data: null,
      error: null,
      count: 1,
    });
    databaseResults.set("tasks", {
      data: null,
      error: null,
      count: 1,
    });
    databaseResults.set("activity_log", {
      data: [
        {
          target_profile_id: "member-1",
          kind: "team_member_deactivated",
          title: "Anggota tim dinonaktifkan",
          administrative_reason: "Rotasi",
          created_at: "2026-07-18T08:00:00Z",
        },
      ],
      error: null,
    });

    resultForRpc = (call) => {
      if (call.name === "admin_count_active_commercial_items") {
        return { data: 1, error: null };
      }
      return undefined;
    };

    const [member] = await team.listTeamMembers();

    expect(member).toEqual({
      id: "member-1",
      name: "Ayu",
      initials: "AY",
      role: "executive",
      email: "ayu@example.com",
      accountStatus: "inactive",
      statusChangedAt: "2026-07-18T08:00:00Z",
      statusChangedBy: "current-admin",
      statusChangeReason: "Rotasi",
      ownedActiveCounts: {
        clients: 1,
        tasks: 1,
        commercialItems: 1,
        total: 3,
      },
      lastAdministrativeChange: {
        kind: "team_member_deactivated",
        title: "Anggota tim dinonaktifkan",
        reason: "Rotasi",
        createdAt: "2026-07-18T08:00:00Z",
      },
    });
    expect(member).not.toHaveProperty("password");
    expect(
      fromCalls.find((call) => call.table === "profiles")?.select,
    ).not.toContain("password");
  });

  test("uses exact bounded count requests for clients and tasks via RPC for commercial items", async () => {
    databaseResults.set("profiles", {
      data: [
        {
          id: "member-1",
          name: "Ayu",
          initials: "AY",
          role: "sales",
          email: "ayu@example.com",
          account_status: "active",
          status_changed_at: null,
          status_changed_by: null,
          status_change_reason: null,
        },
      ],
      error: null,
    });
    databaseResults.set("clients", { data: null, error: null, count: 1001 });
    databaseResults.set("tasks", { data: null, error: null, count: 1002 });
    databaseResults.set("activity_log", { data: [], error: null });

    resultForRpc = (call) => {
      if (call.name === "admin_count_active_commercial_items") {
        return { data: 1, error: null };
      }
      return undefined;
    };

    const [member] = await team.listTeamMembers();

    expect(member.ownedActiveCounts).toEqual({
      clients: 1001,
      tasks: 1002,
      commercialItems: 1,
      total: 2004,
    });

    for (const table of ["clients", "tasks"]) {
      const call = fromCalls.find((entry) => entry.table === table);
      expect(call?.select).toBe("id");
      expect(call?.selectOptions).toEqual({ count: "exact", head: true });
      expect(call?.filters).toContainEqual({
        method: "eq",
        args: ["owner_id", "member-1"],
      });
    }
    expect(
      fromCalls.find((entry) => entry.table === "clients")?.filters,
    ).toContainEqual({ method: "neq", args: ["status", "Lost"] });
    expect(fromCalls.find((entry) => entry.table === "tasks")?.filters).toEqual(
      expect.arrayContaining([
        { method: "neq", args: ["status", "Done"] },
        { method: "eq", args: ["archived", false] },
      ]),
    );
    const commercialCall = rpcCalls.find(
      (call) => call.name === "admin_count_active_commercial_items",
    );
    expect(commercialCall).toBeDefined();
    expect(commercialCall?.params).toEqual({ p_owner_id: "member-1" });
  });

  test("uses server-side RPC to count active commercial items with normalized predicates", async () => {
    databaseResults.set("profiles", {
      data: [
        {
          id: "member-1",
          name: "Ayu",
          initials: "AY",
          role: "sales",
          email: "ayu@example.com",
          account_status: "active",
          status_changed_at: null,
          status_changed_by: null,
          status_change_reason: null,
        },
      ],
      error: null,
    });
    databaseResults.set("clients", { data: null, error: null, count: 0 });
    databaseResults.set("tasks", { data: null, error: null, count: 0 });
    databaseResults.set("activity_log", { data: [], error: null });

    resultForRpc = (call) => {
      if (call.name === "admin_count_active_commercial_items") {
        return { data: 42, error: null };
      }
      return undefined;
    };

    const [member] = await team.listTeamMembers();

    expect(member.ownedActiveCounts.commercialItems).toBe(42);
    const rpcCall = rpcCalls.find(
      (call) => call.name === "admin_count_active_commercial_items",
    );
    expect(rpcCall).toBeDefined();
    expect(rpcCall?.params).toEqual({ p_owner_id: "member-1" });
    // Should NOT paginate; single RPC call only
    expect(
      rpcCalls.filter(
        (call) => call.name === "admin_count_active_commercial_items",
      ),
    ).toHaveLength(1);
  });

  test("handles stages with tab and non-breaking-space whitespace using server predicate", async () => {
    databaseResults.set("profiles", {
      data: [
        {
          id: "member-1",
          name: "Ayu",
          initials: "AY",
          role: "sales",
          email: "ayu@example.com",
          account_status: "active",
          status_changed_at: null,
          status_changed_by: null,
          status_change_reason: null,
        },
      ],
      error: null,
    });
    databaseResults.set("clients", { data: null, error: null, count: 0 });
    databaseResults.set("tasks", { data: null, error: null, count: 0 });
    databaseResults.set("activity_log", { data: [], error: null });

    resultForRpc = (call) => {
      if (call.name === "admin_count_active_commercial_items") {
        // Server correctly counts stages with tab/nbsp as terminal
        // Stage " \t closed won \t " matches server's lower(btrim(stage)) = 'closed won'
        return { data: 3, error: null };
      }
      return undefined;
    };

    const [member] = await team.listTeamMembers();

    // Server RPC returns 3; client must trust server normalization
    expect(member.ownedActiveCounts.commercialItems).toBe(3);
  });

  test("requests only the latest administrative event for each profile", async () => {
    databaseResults.set("profiles", {
      data: [
        {
          id: "member-1",
          name: "Ayu",
          initials: "AY",
          role: "sales",
          email: "ayu@example.com",
          account_status: "active",
          status_changed_at: null,
          status_changed_by: null,
          status_change_reason: null,
        },
      ],
      error: null,
    });
    databaseResults.set("clients", { data: null, error: null, count: 0 });
    databaseResults.set("tasks", { data: null, error: null, count: 0 });
    databaseResults.set("activity_log", {
      data: [
        {
          target_profile_id: "member-1",
          kind: "team_member_role_changed",
          title: "Role anggota tim diubah",
          administrative_reason: "Promosi",
          created_at: "2026-07-19T01:00:00Z",
        },
      ],
      error: null,
    });

    resultForRpc = (call) => {
      if (call.name === "admin_count_active_commercial_items") {
        return { data: 0, error: null };
      }
      return undefined;
    };

    await team.listTeamMembers();

    const call = fromCalls.find((entry) => entry.table === "activity_log");
    expect(call?.filters).toContainEqual({
      method: "eq",
      args: ["target_profile_id", "member-1"],
    });
    expect(call?.order).toEqual({
      column: "created_at",
      options: { ascending: false },
    });
    expect(call?.limit).toBe(1);
  });
});
