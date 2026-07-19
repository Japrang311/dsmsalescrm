# Task 6 Brief: Update session, role-aware navigation, ownership, targets, and reporting

Source: `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md`, lines 474-518.

## Files

- Modify: `src/lib/mock/selectors.ts`
- Modify: `src/context/role-context.tsx`
- Create: `src/lib/auth/account-status.ts`
- Create: `src/lib/auth/account-status.test.ts`
- Modify: `src/components/shell/TopBar.tsx`, `src/components/shell/AppSidebar.tsx`
- Modify: `src/lib/data/clients.ts`, `src/lib/data/targets.ts`, dashboard/report selectors and focused tests.

## Interfaces

- Produces `Role = "sales" | "manager" | "executive" | "super_admin"` and `ROLE_LABEL.super_admin = "Super Admin"`.
- Produces real-session state distinguishing `active`, `inactive`, and `missing_profile` without mock fallback.
- Produces owner/target queries restricted to active `sales | manager` profiles.

## Steps

### Step 1: Write failing session and exclusion tests

Assert an inactive profile yields `{ kind: "inactive" }`, triggers sign-out guidance, and never falls through to the local seed-role path. Assert Super Admin is absent from `listSalesTeamProfiles()` and target/performance inputs.

### Step 2: Extend role types without adding a Super Admin seed switcher option

The production role union and label include Super Admin. The prototype local role switcher may keep its existing three display roles unless a disposable local-only Super Admin entry is intentionally added; real authorization always comes from the profile. Never map an unknown role to Manager or Sales.

### Step 3: Implement inactive-session handling

Fetch `role, account_status, name, initials, email`. Return a discriminated result. On `inactive`, render `Akun Anda telah dinonaktifkan. Hubungi Super Admin.` long enough to be understandable, call `supabase.auth.signOut()`, and route to `/login` without loading business queries.

### Step 4: Update application capabilities

Where existing business edit checks allow Manager, add Super Admin only when the domain supports that operation. Preserve owner on writes. Treat Super Admin company scope like Manager/Executive for reads, but never include Super Admin in Sales owner/team target/performance collections.

### Step 5: Verify focused behavior

Run:

```bash
bun test src/lib/auth/account-status.test.ts
bun run test src/lib/data
bunx tsc --noEmit
```

Expected: inactive/no-fallback and ownership/performance exclusion tests pass with no new type errors.

## Global Constraints (from plan, binding for this task)

- Work only against local project `DSM_SALES_WEB_APP_V2`; no remote link, push, Edge Function deploy, user mutation, or bootstrap without separate approval naming the exact target.
- Use four explicit roles: `sales`, `manager`, `executive`, `super_admin`.
- Super Admin is not a Sales owner and must be excluded from targets, owner selectors, and Sales performance.
- Super Admin business corrections preserve `owner_id`; only the explicit ownership-transfer action (Task 4, already implemented) may change ownership.
- Activity Log is append-only for every role, including Super Admin. No website operation may update/delete audit events. (Not directly touched by this task, but do not violate it if you touch adjacent code.)
- Do not initialize Git. This Lovable-connected folder has no `.git`; use review checkpoints instead of commit steps.
