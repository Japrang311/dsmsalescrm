import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Role } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import {
  fetchAccountStatus,
  signOutInactiveAccount,
  type RealProfile,
} from "@/lib/auth/account-status";

type RoleContextValue = {
  role: Role;
  setRole: (r: Role) => void;
  hydrated: boolean;
  // True once the Supabase sign-in attempt for the current role has
  // settled (succeeded or failed). Data-fetching code should wait for
  // this before querying — RLS blocks unauthenticated requests entirely,
  // so a query fired before sign-in completes just comes back empty.
  authReady: boolean;
  // "dev": the local role switcher signed into a seeded local-only account.
  // "real": an actual Supabase Auth session (from /login) is active; role
  // and profile below come from the `profiles` table, not the switcher.
  authSource: "dev" | "real";
  realProfile: RealProfile | null;
  signOut: () => Promise<void>;
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);
const STORAGE_KEY = "dsm.role";

// Dev/local-only convenience: picking a role here signs into the matching
// seeded local Supabase account (see supabase/seed.sql) so RLS has a real
// session to enforce against. This only works against the local stack —
// these accounts don't exist on any real project, so once .env.local points
// at a real project this becomes a harmless no-op (sign-in just fails) and
// /login (with loadRealSession() below) takes over instead.
// Dev switcher role type: intentionally excludes "super_admin" — there is
// no seed super_admin login, and real Super Admin authorization always
// comes from a real /login session's profile, never this prototype switcher.
type DevRole = Exclude<Role, "super_admin">;

const ROLE_LOGIN: Record<DevRole, { email: string; password: string }> = {
  sales: { email: "nur@local.dsm.test", password: "seed-local-only" },
  manager: { email: "hendra@local.dsm.test", password: "seed-local-only" },
  executive: { email: "executive@local.dsm.test", password: "seed-local-only" },
};
const SEED_EMAILS = new Set(Object.values(ROLE_LOGIN).map((v) => v.email));

// A session belongs to a real (non-seed) account when a user has signed in
// through /login — e.g. after linking a real Supabase project. In that
// case the role/name/initials/email come from `profiles`, not the switcher.
// Delegates the role+account_status query/parsing to account-status.ts so
// the inactive-account gate lives in one unit-tested place.
async function loadRealSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.email || SEED_EMAILS.has(user.email)) return null;

  return fetchAccountStatus(user.id);
}

async function signInForRole(role: DevRole) {
  const { email, password } = ROLE_LOGIN[role];
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Expected once this runs against a real project (no seed data there)
    // or if the local stack isn't running — not fatal, just means
    // RLS-backed data won't load until a real login replaces this.
    console.warn(
      `[role-context] local dev sign-in as "${role}" failed:`,
      error.message,
    );
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  // Start with "sales" server-side; read localStorage inside effect to avoid
  // hydration mismatch (TanStack execution-model rule).
  const [role, setRoleState] = useState<Role>("sales");
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authSource, setAuthSource] = useState<"dev" | "real">("dev");
  const [realProfile, setRealProfile] = useState<RealProfile | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await loadRealSession();

      if (result?.kind === "inactive") {
        // Fail closed: sign out and show the exact inactive-account message
        // before redirecting — never falls through to the local dev
        // switcher and never loads any business query (authReady stays
        // false the whole time, and every data hook gates on it).
        await signOutInactiveAccount();
        setHydrated(true);
        window.setTimeout(() => {
          window.location.href = "/login";
        }, 3000);
        return;
      }

      if (result?.kind === "active") {
        setRoleState(result.role);
        setRealProfile(result.profile);
        setAuthSource("real");
        setHydrated(true);
        setAuthReady(true);
        return;
      }

      // No real (non-seed) session, or a real session with no profile row
      // yet (result?.kind === "missing_profile") — fall back to the local
      // dev role switcher, same as before Task 6.
      let stored: DevRole = "sales";
      try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        if (value === "sales" || value === "manager" || value === "executive") {
          stored = value;
        }
      } catch {
        /* ignore */
      }
      setRoleState(stored);
      setHydrated(true);
      void signInForRole(stored).finally(() => setAuthReady(true));
    })();
  }, []);

  const setRole = useCallback(
    (r: Role) => {
      if (authSource === "real") return; // real accounts can't self-assign a role
      if (r === "super_admin") {
        // The dev switcher never offers this option — real Super Admin
        // authorization only ever comes from a real /login session. Guard
        // against it anyway rather than silently mapping it to Sales.
        console.warn(
          '[role-context] ignoring setRole("super_admin"): no dev seed login exists for it.',
        );
        return;
      }
      setRoleState(r);
      setAuthReady(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, r);
      } catch {
        /* ignore */
      }
      void signInForRole(r).finally(() => setAuthReady(true));
    },
    [authSource],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <RoleContext.Provider
      value={{
        role,
        setRole,
        hydrated,
        authReady,
        authSource,
        realProfile,
        signOut,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}

export const ROLE_LABEL: Record<Role, string> = {
  sales: "Sales",
  manager: "Sales Manager",
  executive: "Top Executive",
  super_admin: "Super Admin",
};
