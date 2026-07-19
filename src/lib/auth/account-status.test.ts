// Unit tests for the real-session account-status gate. Runs fast and
// deterministically without the local Supabase stack — the RLS/DB-level
// proof for account_status already lives in
// supabase/tests/account-lifecycle.test.ts.
//
// fetchAccountStatus()/signOutInactiveAccount() take an injectable client
// argument specifically so these tests can pass a plain fake object instead
// of mock.module()-ing "@/lib/supabase": that API replaces a module's cache
// entry for the whole `bun test` process (not just this file), which broke
// every other data-layer test file that imports the real client afterwards
// when tried here. "sonner" has no other test-file consumer, so mocking it
// is safe.
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const toastError = mock((_message: string, _opts?: unknown) => {});
mock.module("sonner", () => ({
  toast: { error: toastError },
}));

let accountStatus: typeof import("./account-status");

beforeAll(async () => {
  accountStatus = await import("./account-status");
});

afterEach(() => {
  toastError.mockClear();
});

type ProfileQueryResult = { data: unknown; error: unknown };

function fakeProfileClient(result: ProfileQueryResult) {
  const calls: { table: string; columns: string; eqId?: string }[] = [];
  const client = {
    from(table: string) {
      const call: { table: string; columns: string; eqId?: string } = {
        table,
        columns: "",
      };
      calls.push(call);
      return {
        select(columns: string) {
          call.columns = columns;
          return this;
        },
        eq(_col: string, value: string) {
          call.eqId = value;
          return this;
        },
        maybeSingle: async () => result,
      };
    },
  };
  return { client, calls };
}

describe("fetchAccountStatus", () => {
  test("active profile returns role and profile fields", async () => {
    const { client } = fakeProfileClient({
      data: {
        role: "manager",
        account_status: "active",
        name: "Hendra Wijaya",
        initials: "RW",
        email: "hendra@local.dsm.test",
      },
      error: null,
    });

    const result = await accountStatus.fetchAccountStatus("user-1", client);

    expect(result).toEqual({
      kind: "active",
      role: "manager",
      profile: {
        name: "Hendra Wijaya",
        initials: "RW",
        email: "hendra@local.dsm.test",
      },
    });
  });

  test("inactive profile never yields a usable role", async () => {
    const { client } = fakeProfileClient({
      data: {
        role: "manager",
        account_status: "inactive",
        name: "Hendra Wijaya",
        initials: "RW",
        email: "hendra@local.dsm.test",
      },
      error: null,
    });

    const result = await accountStatus.fetchAccountStatus("user-1", client);

    expect(result).toEqual({ kind: "inactive" });
    // Fail-closed: an inactive result must never carry a role field at all,
    // so callers can't accidentally destructure and use one.
    expect("role" in result).toBe(false);
  });

  test("missing profile row yields missing_profile, not a fallback role", async () => {
    const { client } = fakeProfileClient({ data: null, error: null });

    const result = await accountStatus.fetchAccountStatus("user-1", client);

    expect(result).toEqual({ kind: "missing_profile" });
  });

  test("a query error yields missing_profile (fail closed, never a default role)", async () => {
    const { client } = fakeProfileClient({
      data: null,
      error: { message: "boom" },
    });

    const result = await accountStatus.fetchAccountStatus("user-1", client);

    expect(result).toEqual({ kind: "missing_profile" });
  });

  test("queries role, account_status, name, initials, email scoped to the user id", async () => {
    const { client, calls } = fakeProfileClient({
      data: {
        role: "sales",
        account_status: "active",
        name: "Nur Iman",
        initials: "NI",
        email: "nur@local.dsm.test",
      },
      error: null,
    });

    await accountStatus.fetchAccountStatus("user-42", client);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("profiles");
    expect(calls[0].columns).toBe(
      "role, account_status, name, initials, email",
    );
    expect(calls[0].eqId).toBe("user-42");
  });
});

describe("signOutInactiveAccount", () => {
  test("shows the exact Indonesian inactive-account message and signs out", async () => {
    const signOut = mock(async () => ({ error: null }));

    await accountStatus.signOutInactiveAccount({ auth: { signOut } });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe(
      accountStatus.INACTIVE_ACCOUNT_MESSAGE,
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("INACTIVE_ACCOUNT_MESSAGE matches the accepted spec text verbatim", () => {
    expect(accountStatus.INACTIVE_ACCOUNT_MESSAGE).toBe(
      "Akun Anda telah dinonaktifkan. Hubungi Super Admin.",
    );
  });
});
