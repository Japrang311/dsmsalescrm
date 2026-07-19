import { describe, expect, test } from "bun:test";
import {
  parseAdminAction,
  toHttpError,
  type AdminAction,
} from "./contracts.ts";
import { handleAdminRequest } from "./handler.ts";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";
const DESTINATION_ID = "22222222-2222-4222-8222-222222222222";
const CALLER_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_ID = "44444444-4444-4444-8444-444444444444";

type TestRequest = {
  method: string;
  authorization: string | null;
  bodyText: string;
};

type TestResponse = {
  status: number;
  body: Record<string, unknown>;
};

type TestDependencies = {
  authenticate(accessToken: string): Promise<{ id: string } | null>;
  getCallerProfile(
    id: string,
  ): Promise<{ role: string; account_status: string } | null>;
  createAuthUser(input: {
    email: string;
    password: string;
  }): Promise<{ id: string }>;
  deleteAuthUser(id: string): Promise<void>;
  setAuthBan(id: string, banned: boolean): Promise<void>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
};

type DependencyOverrides = Partial<TestDependencies>;

const invokeHandler = handleAdminRequest as unknown as (
  request: TestRequest,
  dependencies: TestDependencies,
) => Promise<TestResponse>;

function post(body: Record<string, unknown> | string): TestRequest {
  return {
    method: "POST",
    authorization: "Bearer valid-token",
    bodyText: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function dependencyHarness(overrides: DependencyOverrides = {}) {
  const calls: Array<{ operation: string; value?: unknown }> = [];
  const dependencies: TestDependencies = {
    async authenticate(accessToken) {
      calls.push({ operation: "authenticate", value: accessToken });
      return { id: CALLER_ID };
    },
    async getCallerProfile(id) {
      calls.push({ operation: "getCallerProfile", value: id });
      return { role: "super_admin", account_status: "active" };
    },
    async createAuthUser(input) {
      calls.push({ operation: "createAuthUser", value: input });
      return { id: CREATED_ID };
    },
    async deleteAuthUser(id) {
      calls.push({ operation: "deleteAuthUser", value: id });
    },
    async setAuthBan(id, banned) {
      calls.push({ operation: "setAuthBan", value: { id, banned } });
    },
    async rpc(name, args) {
      calls.push({ operation: "rpc", value: { name, args } });
      return { id: TARGET_ID };
    },
    ...overrides,
  };
  return { calls, dependencies };
}

function validationError(rawBody: string) {
  try {
    parseAdminAction(rawBody);
    throw new Error("Expected parseAdminAction to reject the request");
  } catch (error) {
    return toHttpError(error);
  }
}

describe("manage-team-member validation boundary", () => {
  test("exports a Bun-testable contract parser without loading Deno", async () => {
    let module: unknown;
    try {
      module = await import("./contracts.ts");
    } catch {
      module = undefined;
    }

    expect(module).toBeDefined();
  });

  test("exports the parser and safe error mapper", async () => {
    const contracts = (await import("./contracts.ts")) as Record<
      string,
      unknown
    >;

    expect(typeof contracts.parseAdminAction).toBe("function");
    expect(typeof contracts.toHttpError).toBe("function");
  });

  test("parses and normalizes the exact seven-action contract", () => {
    const inputs: Array<[Record<string, unknown>, AdminAction]> = [
      [
        {
          action: "create",
          name: "  Siti Nur ",
          email: " SITI@example.com ",
          initials: " SN ",
          role: "sales",
          password: "aman-sekali-123",
        },
        {
          action: "create",
          name: "Siti Nur",
          email: "siti@example.com",
          initials: "SN",
          role: "sales",
          password: "aman-sekali-123",
        },
      ],
      [
        {
          action: "update_profile",
          id: TARGET_ID,
          name: " Siti Baru ",
          initials: " SB ",
        },
        {
          action: "update_profile",
          id: TARGET_ID,
          name: "Siti Baru",
          initials: "SB",
        },
      ],
      [
        {
          action: "change_role",
          id: TARGET_ID,
          role: "executive",
          reason: " Perubahan tanggung jawab ",
        },
        {
          action: "change_role",
          id: TARGET_ID,
          role: "executive",
          reason: "Perubahan tanggung jawab",
        },
      ],
      [
        {
          action: "deactivate",
          id: TARGET_ID,
          reason: " Tidak lagi aktif ",
        },
        {
          action: "deactivate",
          id: TARGET_ID,
          reason: "Tidak lagi aktif",
        },
      ],
      [
        {
          action: "reactivate",
          id: TARGET_ID,
          reason: " Kembali bekerja ",
        },
        {
          action: "reactivate",
          id: TARGET_ID,
          reason: "Kembali bekerja",
        },
      ],
      [
        {
          action: "transfer_ownership",
          fromId: TARGET_ID,
          toId: DESTINATION_ID,
          reason: " Realokasi wilayah ",
        },
        {
          action: "transfer_ownership",
          fromId: TARGET_ID,
          toId: DESTINATION_ID,
          reason: "Realokasi wilayah",
        },
      ],
      [
        {
          action: "delete_eligible_account",
          id: TARGET_ID,
          reason: " Akun duplikat tanpa referensi ",
        },
        {
          action: "delete_eligible_account",
          id: TARGET_ID,
          reason: "Akun duplikat tanpa referensi",
        },
      ],
    ];

    for (const [input, expected] of inputs) {
      expect(parseAdminAction(JSON.stringify(input))).toEqual(expected);
    }
  });

  test("rejects malformed JSON, missing reasons, unknown fields, and invalid values", () => {
    const malformed = validationError("{");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_JSON");

    const missingReason = validationError(
      JSON.stringify({ action: "deactivate", id: TARGET_ID }),
    );
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.code).toBe("INVALID_REQUEST");

    const unknownField = validationError(
      JSON.stringify({
        action: "update_profile",
        id: TARGET_ID,
        name: "Siti",
        initials: "SN",
        role: "super_admin",
      }),
    );
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.code).toBe("INVALID_REQUEST");

    const invalidRole = validationError(
      JSON.stringify({
        action: "change_role",
        id: TARGET_ID,
        role: "owner",
        reason: "Tidak valid",
      }),
    );
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.body.code).toBe("INVALID_REQUEST");

    const weakPassword = validationError(
      JSON.stringify({
        action: "create",
        name: "Siti",
        email: "siti@example.com",
        initials: "SN",
        role: "sales",
        password: "1234567",
      }),
    );
    expect(weakPassword.status).toBe(400);
    expect(weakPassword.body.code).toBe("INVALID_REQUEST");
  });

  test("maps database protections to safe HTTP errors and numeric details", () => {
    const conflict = toHttpError({
      message: "ACCOUNT_HAS_REFERENCES",
      details:
        '{"clients":2,"activity_log_target":1,"total_blocking":2,"email":"do-not-leak@example.com"}',
    });
    expect(conflict).toEqual({
      status: 409,
      body: {
        error:
          "Akun masih memiliki referensi. Nonaktifkan akun atau pindahkan ownership terlebih dahulu.",
        code: "ACCOUNT_HAS_REFERENCES",
        details: {
          clients: 2,
          activity_log_target: 1,
          total_blocking: 2,
        },
      },
    });

    expect(
      toHttpError({ message: "ACTIVE_SUPER_ADMIN_REQUIRED" }),
    ).toMatchObject({
      status: 403,
      body: { code: "ACTIVE_SUPER_ADMIN_REQUIRED" },
    });
    expect(
      toHttpError({ message: "INVALID_OWNERSHIP_DESTINATION" }),
    ).toMatchObject({
      status: 400,
      body: { code: "INVALID_OWNERSHIP_DESTINATION" },
    });
    expect(toHttpError({ message: "LAST_ACTIVE_SUPER_ADMIN" })).toMatchObject({
      status: 409,
      body: { code: "LAST_ACTIVE_SUPER_ADMIN" },
    });

    const unknown = toHttpError(new Error("service-role-secret-value"));
    expect(unknown).toEqual({
      status: 500,
      body: {
        error: "Operasi anggota tim gagal.",
        code: "INTERNAL_ERROR",
      },
    });
  });
});

describe("manage-team-member protected handler", () => {
  test("exports a Bun-testable handler without loading Deno", async () => {
    let module: unknown;
    try {
      module = await import("./handler.ts");
    } catch {
      module = undefined;
    }

    expect(module).toBeDefined();
  });

  test("rejects unsupported methods and missing, invalid, inactive, or non-admin callers", async () => {
    const base = dependencyHarness();
    expect(
      await invokeHandler(
        { method: "GET", authorization: null, bodyText: "" },
        base.dependencies,
      ),
    ).toMatchObject({ status: 405, body: { code: "METHOD_NOT_ALLOWED" } });

    expect(
      await invokeHandler(
        { method: "POST", authorization: null, bodyText: "{}" },
        base.dependencies,
      ),
    ).toMatchObject({ status: 401, body: { code: "UNAUTHENTICATED" } });

    const invalid = dependencyHarness({
      async authenticate() {
        return null;
      },
    });
    expect(await invokeHandler(post("{}"), invalid.dependencies)).toMatchObject(
      {
        status: 401,
        body: { code: "UNAUTHENTICATED" },
      },
    );

    const inactive = dependencyHarness({
      async getCallerProfile() {
        return { role: "super_admin", account_status: "inactive" };
      },
    });
    expect(await invokeHandler(post("{"), inactive.dependencies)).toMatchObject(
      {
        status: 403,
        body: { code: "ACTIVE_SUPER_ADMIN_REQUIRED" },
      },
    );

    const manager = dependencyHarness({
      async getCallerProfile() {
        return { role: "manager", account_status: "active" };
      },
    });
    expect(await invokeHandler(post("{"), manager.dependencies)).toMatchObject({
      status: 403,
      body: { code: "ACTIVE_SUPER_ADMIN_REQUIRED" },
    });
    expect(manager.calls.some((call) => call.operation === "rpc")).toBe(false);
  });

  test("routes profile, role, and ownership actions to exact service RPCs", async () => {
    const cases = [
      {
        request: {
          action: "update_profile",
          id: TARGET_ID,
          name: "Siti Baru",
          initials: "SB",
        },
        rpc: "admin_update_team_member_profile",
        args: {
          p_actor_id: CALLER_ID,
          p_target_id: TARGET_ID,
          p_name: "Siti Baru",
          p_initials: "SB",
        },
      },
      {
        request: {
          action: "change_role",
          id: TARGET_ID,
          role: "manager",
          reason: "Perubahan tanggung jawab",
        },
        rpc: "admin_change_team_member_role",
        args: {
          p_actor_id: CALLER_ID,
          p_target_id: TARGET_ID,
          p_role: "manager",
          p_reason: "Perubahan tanggung jawab",
        },
      },
      {
        request: {
          action: "transfer_ownership",
          fromId: TARGET_ID,
          toId: DESTINATION_ID,
          reason: "Realokasi wilayah",
        },
        rpc: "admin_transfer_active_ownership",
        args: {
          p_actor_id: CALLER_ID,
          p_source_id: TARGET_ID,
          p_destination_id: DESTINATION_ID,
          p_reason: "Realokasi wilayah",
        },
      },
    ];

    for (const item of cases) {
      const harness = dependencyHarness();
      const result = await invokeHandler(
        post(item.request),
        harness.dependencies,
      );
      expect(result).toEqual({
        status: 200,
        body: {
          id: item.request.id ?? item.request.fromId,
          action: item.request.action,
        },
      });
      expect(harness.calls).toContainEqual({
        operation: "rpc",
        value: { name: item.rpc, args: item.args },
      });
    }
  });

  test("creates Auth first and compensates when the atomic profile/audit RPC fails", async () => {
    const createRequest = {
      action: "create",
      name: "Siti Nur",
      email: "siti@example.com",
      initials: "SN",
      role: "sales",
      password: "aman-sekali-123",
    };
    const success = dependencyHarness();
    const successResult = await invokeHandler(
      post(createRequest),
      success.dependencies,
    );
    expect(successResult).toEqual({
      status: 200,
      body: { id: CREATED_ID, action: "create" },
    });
    expect(success.calls.slice(2)).toEqual([
      {
        operation: "createAuthUser",
        value: { email: "siti@example.com", password: "aman-sekali-123" },
      },
      {
        operation: "rpc",
        value: {
          name: "admin_create_team_member_profile",
          args: {
            p_actor_id: CALLER_ID,
            p_target_id: CREATED_ID,
            p_name: "Siti Nur",
            p_email: "siti@example.com",
            p_initials: "SN",
            p_role: "sales",
          },
        },
      },
    ]);
    expect(JSON.stringify(successResult)).not.toContain("password");

    const databaseFailure = dependencyHarness({
      async rpc() {
        throw { message: "PROFILE_FIELDS_REQUIRED" };
      },
    });
    const failedResult = await invokeHandler(
      post(createRequest),
      databaseFailure.dependencies,
    );
    expect(failedResult).toMatchObject({
      status: 400,
      body: { code: "PROFILE_FIELDS_REQUIRED" },
    });
    expect(databaseFailure.calls).toContainEqual({
      operation: "deleteAuthUser",
      value: CREATED_ID,
    });

    const compensationFailure = dependencyHarness({
      async rpc() {
        throw new Error("database unavailable");
      },
      async deleteAuthUser() {
        throw new Error("auth unavailable");
      },
    });
    expect(
      await invokeHandler(
        post(createRequest),
        compensationFailure.dependencies,
      ),
    ).toMatchObject({
      status: 502,
      body: { code: "CREATE_COMPENSATION_INCOMPLETE" },
    });
  });

  test("deactivates DB-first but reactivates Auth-first", async () => {
    const deactivate = dependencyHarness();
    expect(
      await invokeHandler(
        post({ action: "deactivate", id: TARGET_ID, reason: "Keluar" }),
        deactivate.dependencies,
      ),
    ).toEqual({
      status: 200,
      body: { id: TARGET_ID, action: "deactivate" },
    });
    expect(deactivate.calls.slice(2)).toEqual([
      {
        operation: "rpc",
        value: {
          name: "admin_set_team_member_status",
          args: {
            p_actor_id: CALLER_ID,
            p_target_id: TARGET_ID,
            p_account_status: "inactive",
            p_reason: "Keluar",
          },
        },
      },
      { operation: "setAuthBan", value: { id: TARGET_ID, banned: true } },
    ]);

    const reactivate = dependencyHarness();
    expect(
      await invokeHandler(
        post({ action: "reactivate", id: TARGET_ID, reason: "Kembali" }),
        reactivate.dependencies,
      ),
    ).toEqual({
      status: 200,
      body: { id: TARGET_ID, action: "reactivate" },
    });
    expect(reactivate.calls.slice(2)).toEqual([
      { operation: "setAuthBan", value: { id: TARGET_ID, banned: false } },
      {
        operation: "rpc",
        value: {
          name: "admin_set_team_member_status",
          args: {
            p_actor_id: CALLER_ID,
            p_target_id: TARGET_ID,
            p_account_status: "active",
            p_reason: "Kembali",
          },
        },
      },
    ]);

    const revocationFailure = dependencyHarness({
      async setAuthBan() {
        throw new Error("auth unavailable");
      },
    });
    const failure = await invokeHandler(
      post({ action: "deactivate", id: TARGET_ID, reason: "Keluar" }),
      revocationFailure.dependencies,
    );
    expect(failure).toMatchObject({
      status: 502,
      body: { code: "AUTH_REVOCATION_INCOMPLETE" },
    });
    expect(failure.body.error).toContain("database sudah nonaktif");

    const retry = dependencyHarness({
      async rpc() {
        throw { message: "ACCOUNT_STATUS_UNCHANGED" };
      },
    });
    expect(
      await invokeHandler(
        post({
          action: "deactivate",
          id: TARGET_ID,
          reason: "Ulangi revokasi",
        }),
        retry.dependencies,
      ),
    ).toEqual({
      status: 200,
      body: { id: TARGET_ID, action: "deactivate" },
    });
    expect(retry.calls).toContainEqual({
      operation: "setAuthBan",
      value: { id: TARGET_ID, banned: true },
    });

    const unbanFailure = dependencyHarness({
      async setAuthBan() {
        throw new Error("auth unavailable");
      },
    });
    const unbanFailed = await invokeHandler(
      post({ action: "reactivate", id: TARGET_ID, reason: "Kembali" }),
      unbanFailure.dependencies,
    );
    expect(unbanFailed).toMatchObject({
      status: 502,
      body: { code: "AUTH_REACTIVATION_INCOMPLETE" },
    });
    expect(unbanFailure.calls.some((call) => call.operation === "rpc")).toBe(
      false,
    );

    const activationFailure = dependencyHarness({
      async rpc() {
        throw new Error("database unavailable");
      },
    });
    const activationFailed = await invokeHandler(
      post({ action: "reactivate", id: TARGET_ID, reason: "Kembali" }),
      activationFailure.dependencies,
    );
    expect(activationFailed).toMatchObject({
      status: 502,
      body: { code: "DATABASE_REACTIVATION_INCOMPLETE" },
    });
    expect(activationFailure.calls.slice(2)).toEqual([
      { operation: "setAuthBan", value: { id: TARGET_ID, banned: false } },
      { operation: "setAuthBan", value: { id: TARGET_ID, banned: true } },
    ]);

    const idempotentRetry = dependencyHarness({
      async rpc() {
        throw { message: "ACCOUNT_STATUS_UNCHANGED" };
      },
    });
    expect(
      await invokeHandler(
        post({ action: "reactivate", id: TARGET_ID, reason: "Ulangi" }),
        idempotentRetry.dependencies,
      ),
    ).toEqual({
      status: 200,
      body: { id: TARGET_ID, action: "reactivate" },
    });
    expect(idempotentRetry.calls.slice(2)).toEqual([
      { operation: "setAuthBan", value: { id: TARGET_ID, banned: false } },
    ]);
  });

  test("deletes the eligible profile before Auth and reports incomplete Auth cleanup", async () => {
    const request = {
      action: "delete_eligible_account",
      id: TARGET_ID,
      reason: "Akun duplikat",
    };
    const success = dependencyHarness();
    expect(await invokeHandler(post(request), success.dependencies)).toEqual({
      status: 200,
      body: { id: TARGET_ID, action: "delete_eligible_account" },
    });
    expect(success.calls.slice(2)).toEqual([
      {
        operation: "rpc",
        value: {
          name: "admin_delete_eligible_account",
          args: {
            p_actor_id: CALLER_ID,
            p_target_id: TARGET_ID,
            p_reason: "Akun duplikat",
          },
        },
      },
      { operation: "deleteAuthUser", value: TARGET_ID },
    ]);

    const referenced = dependencyHarness({
      async rpc() {
        throw {
          message: "ACCOUNT_HAS_REFERENCES",
          details: '{"clients":1,"total_blocking":1}',
        };
      },
    });
    expect(await invokeHandler(post(request), referenced.dependencies)).toEqual(
      {
        status: 409,
        body: {
          error:
            "Akun masih memiliki referensi. Nonaktifkan akun atau pindahkan ownership terlebih dahulu.",
          code: "ACCOUNT_HAS_REFERENCES",
          details: { clients: 1, total_blocking: 1 },
        },
      },
    );
    expect(
      referenced.calls.some((call) => call.operation === "deleteAuthUser"),
    ).toBe(false);

    const authFailure = dependencyHarness({
      async deleteAuthUser() {
        throw new Error("auth unavailable");
      },
    });
    expect(
      await invokeHandler(post(request), authFailure.dependencies),
    ).toMatchObject({
      status: 502,
      body: { code: "AUTH_DELETE_INCOMPLETE" },
    });
  });

  test("preserves explicit protection status codes from the database", async () => {
    const cases = [
      ["deactivate", "SELF_DEACTIVATION_FORBIDDEN", 409],
      ["delete_eligible_account", "SELF_DELETE_FORBIDDEN", 409],
      ["change_role", "LAST_ACTIVE_SUPER_ADMIN", 409],
      ["deactivate", "LAST_ACTIVE_SUPER_ADMIN", 409],
      ["delete_eligible_account", "LAST_ACTIVE_SUPER_ADMIN", 409],
      ["transfer_ownership", "INVALID_OWNERSHIP_DESTINATION", 400],
    ] as const;

    for (const [action, code, status] of cases) {
      const harness = dependencyHarness({
        async rpc() {
          throw { message: code };
        },
      });
      const body =
        action === "transfer_ownership"
          ? {
              action,
              fromId: TARGET_ID,
              toId: DESTINATION_ID,
              reason: "Uji proteksi",
            }
          : action === "change_role"
            ? {
                action,
                id: TARGET_ID,
                role: "manager",
                reason: "Uji proteksi",
              }
            : { action, id: TARGET_ID, reason: "Uji proteksi" };
      expect(
        await invokeHandler(post(body), harness.dependencies),
      ).toMatchObject({
        status,
        body: { code },
      });
    }
  });
});
