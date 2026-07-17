import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Role, User } from "./mock-data";
import { currentUserByRole } from "./mock-data";

interface RoleContextValue {
  role: Role;
  user: User;
  setRole: (r: Role) => void;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("sales");
  const value = useMemo(
    () => ({ role, user: currentUserByRole[role], setRole }),
    [role],
  );
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}
