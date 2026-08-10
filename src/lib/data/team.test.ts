import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { TeamSupabaseClient } from "./team";

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
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?:
        ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(
        resultForCall?.(call) ??
          databaseResults.get(table) ?? { data: [], error: null },
      ).then(onfulfilled, onrejected);
    },
  };
  return query;
}

const teamClient = {
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
} satisfies TeamSupabaseClient;

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
  test("serializes all eight team actions exactly", async () => {
    await team.createTeamMember(
      {
        name: "Ayu",
        email: "ayu@example.com",
        initials: "AY",
        role: "sales",
        password: "temporary-password",
      },
      teamClient,
    );
    await team.updateTeamMemberProfile(
      "member-1",
      {
        name: "Ayu Putri",
        initials: "AP",
      },
      teamClient,
    );
    await team.changeTeamMemberRole(
      "member-1",
      "manager",
      "Promosi kuartal ini",
      teamClient,
    );
    await team.deactivateTeamMember("member-1", "Cuti panjang", teamClient);
    await team.reactivateTeamMember("member-1", "Kembali bekerja", teamClient);
    await team.transferTeamOwnership(
      "member-1",
      "member-2",
      "Rebalancing akun",
      teamClient,
    );
    await team.deleteEligibleTeamMember(
      "member-1",
      "Akun duplikat",
      teamClient,
    );
    await team.getTeamMemberReferenceCounts("member-1", teamClient);

    expect(invoke.mock.calls.map((call) => call[0])).toEqual(
      Array(8).fill("manage-team-member"),
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
      {
        body: {
          action: "account_reference_counts",
          id: "member-1",
        },
      },
    ]);
  });

  test("serializes the reset_password action", async () => {
    await team.resetTeamMemberPassword(
      "member-1",
      "new-temporary-password",
      teamClient,
    );

    expect(invoke).toHaveBeenCalledWith("manage-team-member", {
      body: {
        action: "reset_password",
        id: "member-1",
        password: "new-temporary-password",
      },
    });
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
      await team.deleteEligibleTeamMember(
        "member-1",
        "Akun tidak digunakan",
        teamClient,
      );
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

  test("formats active ownership separately from blocking historical references", () => {
    expect(
      team.formatOwnedActiveCounts({
        clients: 1,
        tasks: 2,
        commercialItems: 3,
        total: 6,
      }),
    ).toBe(
      "6 ownership aktif · 1 client aktif · 2 task aktif · 3 commercial aktif",
    );

    expect(
      team.formatBlockingReferenceCounts({
        clients: 2,
        commercial_items: 1,
        activity_log_target: 4,
        total_blocking: 3,
        total_all: 7,
      }),
    ).toBe(
      "3 referensi historis blocking · 2 client historis · 1 commercial historis · 4 activity target",
    );
  });
});

describe("privileged Team roster mapping", () => {
  // listTeamMembers() reads public.admin_team_summary(), a single
  // set-returning RPC (Stage 3 N+1 fix) instead of 1 + 4*N per-member
  // queries. These tests exercise the row-mapping contract, not query
  // shape, since there's only one call left to shape-check.
  test("includes inactive and all four roles, active ownership counts, and the latest administrative change without a password field", async () => {
    resultForRpc = (call) => {
      if (call.name !== "admin_team_summary") return undefined;
      return {
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
            clients_count: 1,
            tasks_count: 1,
            commercial_items_count: 1,
            last_change_kind: "team_member_deactivated",
            last_change_title: "Anggota tim dinonaktifkan",
            last_change_reason: "Rotasi",
            last_change_at: "2026-07-18T08:00:00Z",
          },
        ],
        error: null,
      };
    };

    const [member] = await team.listTeamMembers(teamClient);

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
  });

  test("issues a single RPC call regardless of roster size", async () => {
    resultForRpc = (call) => {
      if (call.name !== "admin_team_summary") return undefined;
      return {
        data: Array.from({ length: 20 }, (_, index) => ({
          id: `member-${index}`,
          name: `Member ${index}`,
          initials: "MM",
          role: "sales",
          email: `member${index}@example.com`,
          account_status: "active",
          status_changed_at: null,
          status_changed_by: null,
          status_change_reason: null,
          clients_count: 1001,
          tasks_count: 1002,
          commercial_items_count: 1,
          last_change_kind: null,
          last_change_title: null,
          last_change_reason: null,
          last_change_at: null,
        })),
        error: null,
      };
    };

    const members = await team.listTeamMembers(teamClient);

    expect(members).toHaveLength(20);
    expect(members[0].ownedActiveCounts).toEqual({
      clients: 1001,
      tasks: 1002,
      commercialItems: 1,
      total: 2004,
    });
    expect(
      rpcCalls.filter((call) => call.name === "admin_team_summary"),
    ).toHaveLength(1);
  });

  test("omits lastAdministrativeChange when the RPC reports no admin history", async () => {
    resultForRpc = (call) => {
      if (call.name !== "admin_team_summary") return undefined;
      return {
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
            clients_count: 0,
            tasks_count: 0,
            commercial_items_count: 0,
            last_change_kind: null,
            last_change_title: null,
            last_change_reason: null,
            last_change_at: null,
          },
        ],
        error: null,
      };
    };

    const [member] = await team.listTeamMembers(teamClient);

    expect(member).not.toHaveProperty("lastAdministrativeChange");
    expect(member).not.toHaveProperty("statusChangedAt");
  });

  test("propagates an RPC error instead of returning a partial roster", async () => {
    resultForRpc = (call) => {
      if (call.name !== "admin_team_summary") return undefined;
      return { data: null, error: { message: "INSUFFICIENT_PRIVILEGE" } };
    };

    await expect(team.listTeamMembers(teamClient)).rejects.toBeTruthy();
  });
});
