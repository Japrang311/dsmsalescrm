import { createContext, useContext } from "react";
import type { Role } from "@/lib/domain";
import type { RealProfile } from "@/lib/auth/account-status";

export type RoleContextValue = {
  role: Role;
  hydrated: boolean;
  // True once the real Supabase Auth session's role/profile lookup has
  // settled. Data-fetching code should wait for this before querying — RLS
  // blocks unauthenticated requests entirely, so a query fired before this
  // resolves just comes back empty.
  authReady: boolean;
  realProfile: RealProfile | null;
  signOut: () => Promise<void>;
};

export const RoleContext = createContext<RoleContextValue | undefined>(
  undefined,
);

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
