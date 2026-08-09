import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import {
  fetchAccountStatus,
  signOutInactiveAccount,
  type RealProfile,
} from "@/lib/auth/account-status";
import { RoleContext } from "@/context/role-context-core";

// Role and profile always come from a real Supabase Auth session (via
// /login) and the `profiles` table row it resolves to — never from
// client-side state the user can pick. Delegates the role+account_status
// query/parsing to account-status.ts so the inactive-account gate lives in
// one unit-tested place.
async function loadRealSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.email) return null;

  return fetchAccountStatus(user.id);
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("sales");
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [realProfile, setRealProfile] = useState<RealProfile | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await loadRealSession();

      if (result?.kind === "inactive") {
        // Fail closed: sign out and show the exact inactive-account message
        // before redirecting — never loads any business query (authReady
        // stays false the whole time, and every data hook gates on it).
        await signOutInactiveAccount();
        setHydrated(true);
        window.setTimeout(() => {
          window.location.href = "/login";
        }, 3000);
        return;
      }

      if (result?.kind === "active") {
        setRole(result.role);
        setRealProfile(result.profile);
        setHydrated(true);
        setAuthReady(true);
        return;
      }

      // "error" (profile lookup failed), "missing_profile", or no session at
      // all — fail closed to /login in every case. There is no local
      // fallback: authorization only ever comes from a real session.
      setHydrated(true);
      window.location.href = "/login";
    })();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <RoleContext.Provider
      value={{
        role,
        hydrated,
        authReady,
        realProfile,
        signOut,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}
