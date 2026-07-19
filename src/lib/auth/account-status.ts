import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/domain";

// Minimal shape this module needs from a Supabase client — narrow enough
// that tests can pass a plain fake object instead of reaching for
// mock.module() (which replaces the "@/lib/supabase" module globally for
// the whole `bun test` process, breaking every other data-layer test file
// that imports the real client afterwards).
type ProfileQueryClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};
type AuthSignOutClient = { auth: { signOut(): Promise<unknown> } };

// Phase 12 accepted spec text, verbatim — do not reword.
export const INACTIVE_ACCOUNT_MESSAGE =
  "Akun Anda telah dinonaktifkan. Hubungi Super Admin.";

export type RealProfile = {
  name: string;
  initials: string;
  email: string;
};

// Fail-closed by construction: only "active" carries a role. Every other
// outcome (inactive, no profile row, query error) is a variant with no
// role field at all, so a caller can't accidentally destructure and use
// one for an account that shouldn't have access.
export type AccountStatusResult =
  | { kind: "active"; role: Role; profile: RealProfile }
  | { kind: "inactive" }
  | { kind: "missing_profile" };

type ProfileStatusRow = {
  role: Role;
  account_status: "active" | "inactive";
  name: string;
  initials: string;
  email: string;
};

// Reads the signed-in user's role AND account_status together — this is
// the check role-context.tsx's previous loadRealSession() was missing: it
// used to read only `role` and hand it out regardless of account_status.
// Any query error or missing row fails closed to "missing_profile", never
// to a default role.
// Cast, not a structural default-param check: TypeScript's structural
// comparison of the real (deeply generic) SupabaseClient type against the
// narrow ProfileQueryClient/AuthSignOutClient interfaces above blows up
// with "Type instantiation is excessively deep" — the real client
// genuinely does satisfy this narrow shape at runtime, so the cast is safe.
const realProfileQueryClient = supabase as unknown as ProfileQueryClient;
const realAuthSignOutClient = supabase as unknown as AuthSignOutClient;

export async function fetchAccountStatus(
  userId: string,
  client: ProfileQueryClient = realProfileQueryClient,
): Promise<AccountStatusResult> {
  const { data, error } = await client
    .from("profiles")
    .select("role, account_status, name, initials, email")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return { kind: "missing_profile" };

  const row = data as ProfileStatusRow;
  if (row.account_status === "inactive") return { kind: "inactive" };

  return {
    kind: "active",
    role: row.role,
    profile: { name: row.name, initials: row.initials, email: row.email },
  };
}

// Surfaces the exact Indonesian inactive-account message and ends the
// Supabase Auth session. Does not navigate — the caller (role-context.tsx)
// owns timing the redirect to /login so the toast stays on screen long
// enough to read instead of disappearing on an instant hard navigation.
export async function signOutInactiveAccount(
  client: AuthSignOutClient = realAuthSignOutClient,
): Promise<void> {
  toast.error(INACTIVE_ACCOUNT_MESSAGE);
  await client.auth.signOut();
}
