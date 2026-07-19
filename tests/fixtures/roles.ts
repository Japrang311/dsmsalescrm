// Test-only fixture data: one fake user per app role, used by RLS tests to
// prove access is actually scoped correctly. Never imported by production
// code (src/routes, src/components, src/lib/data).

export type RoleFixture = {
  email: string;
  password: string;
  role: "sales" | "manager" | "executive" | "super_admin";
  name: string;
  initials: string;
};

export const ROLE_FIXTURES: RoleFixture[] = [
  {
    email: "test-sales@example.com",
    password: "test-password-123",
    role: "sales",
    name: "Test Sales",
    initials: "TS",
  },
  {
    email: "test-manager@example.com",
    password: "test-password-123",
    role: "manager",
    name: "Test Manager",
    initials: "TM",
  },
  {
    email: "test-executive@example.com",
    password: "test-password-123",
    role: "executive",
    name: "Test Executive",
    initials: "TE",
  },
  {
    email: "test-super-admin@example.com",
    password: "test-password-123",
    role: "super_admin",
    name: "Test Super Admin",
    initials: "SA",
  },
];
