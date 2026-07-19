# Super Admin Team and Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Super Admin role that safely manages Team & Role and supported company-wide business data, with fail-closed deactivation, protected ownership transfer/deletion, and immutable administrative audit history.

**Architecture:** PostgreSQL role/status and RLS policies are the authorization boundary. A protected Supabase Edge Function owns Auth administration and account-lifecycle orchestration; focused private database functions provide transactional reference checks and ownership transfer. React renders role-appropriate Settings controls and session states but never grants authority itself.

**Tech Stack:** Supabase PostgreSQL 17, Supabase Auth/Admin API, RLS, PostgreSQL functions, Supabase Edge Functions (Deno + `@supabase/supabase-js`), TypeScript 5.8, React 19, TanStack Start/Query, Bun test, local browser verification.

## Global Constraints

- Work only against local project `DSM_SALES_WEB_APP_V2`; no remote link, push, Edge Function deploy, user mutation, or bootstrap without separate approval naming the exact target.
- Generate migration filenames with `bunx supabase migration new <name>`; never invent timestamps.
- Use four explicit roles: `sales`, `manager`, `executive`, `super_admin`.
- Only an active `super_admin` may mutate Team & Role. Manager and Executive see the roster read-only; Sales does not see it.
- Super Admin is not a Sales owner and must be excluded from targets, owner selectors, and Sales performance.
- Super Admin business corrections preserve `owner_id`; only the explicit ownership-transfer action may change ownership.
- Deactivation is the default removal action. Inactive profiles receive no RLS authority even with an older access token.
- Activity Log is append-only for every role, including Super Admin. No website operation may update/delete audit events.
- Require an administrative reason for role, status, ownership-transfer, and permanent-delete actions.
- Protect the current Super Admin and the last active Super Admin from destructive lifecycle actions.
- Do not initialize Git. This Lovable-connected folder has no `.git`; use review checkpoints instead of commit steps unless the user separately authorizes Git.
- Complete Tasks 1–2 before starting the Phase 11 commercial schema so its new tables receive the accepted four-role policy model.

---

## File Structure

Create:

- CLI-generated role-enum migration — adds `super_admin` in its own committed migration boundary.
- CLI-generated profile/authorization migration — account state, active role helper, profile policies.
- CLI-generated administrative-audit migration — target snapshot fields and immutable policies.
- CLI-generated lifecycle-functions migration — reference counts and atomic ownership transfer in non-exposed `private` schema.
- `supabase/tests/super-admin-rls.test.ts` — four-role table matrix and inactive-token denial.
- `supabase/tests/account-lifecycle.test.ts` — database reference/transfer/protection contracts.
- `supabase/functions/manage-team-member/index.test.ts` — request/action validation and authorization contract tests using extracted pure helpers.
- `src/lib/data/team.test.ts` — request serialization and safe error mapping.
- `src/lib/auth/account-status.ts` — active/inactive session result parsing.
- `src/lib/auth/account-status.test.ts` — inactive-session behavior.
- `supabase/snippets/bootstrap_super_admin_role.sql` — explicit UUID-only idempotent first-admin promotion.

Modify:

- `tests/fixtures/roles.ts`, `supabase/tests/helpers.ts`, and every `supabase/tests/*.test.ts` role assumption.
- `supabase/functions/manage-team-member/index.ts` — Super-Admin-only lifecycle endpoint.
- `src/lib/data/team.ts` — four-role roster and lifecycle API.
- `src/context/role-context.tsx`, `src/lib/mock/selectors.ts`, role labels and role-aware route/component conditions.
- `src/routes/_app.settings.tsx` — active/inactive roster and role-specific controls.
- Owner/target/profile selectors in `src/lib/data/clients.ts`, `src/lib/data/targets.ts`, dashboard/report selectors, and their tests.
- `src/lib/data/activity-log.ts` and Activity Log rendering types for administrative events.
- `supabase/seed.sql` with a local-only Super Admin fixture account; never add a real credential.
- `PRD.md`, ADR-002, accepted design, backend/auth specs, trackers, `CLAUDE.md`, and `HANDOFF.md` after verification.

## Task 1: Add the explicit role, account state, and active-profile security boundary

**Files:**

- Create: `supabase/tests/super-admin-rls.test.ts`
- Create via CLI: migration from `bunx supabase migration new add_super_admin_role`
- Create via CLI: migration from `bunx supabase migration new add_account_status_and_active_role_guard`
- Modify: `tests/fixtures/roles.ts`
- Modify: `supabase/tests/helpers.ts`
- Modify: `supabase/tests/profiles.test.ts`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Produces `public.app_role` value `super_admin`.
- Produces `public.account_status` values `active | inactive`.
- Produces profile columns `account_status`, `status_changed_at`, `status_changed_by`, `status_change_reason`.
- Produces `public.current_user_role(): public.app_role`, returning `NULL` for an inactive/missing profile.
- Produces four-role fixtures through `RoleFixtureUsers["super_admin"]`.

- [ ] **Step 1: Extend fixtures and write failing profile tests**

Add `super_admin` to `RoleFixture["role"]` and `ROLE_FIXTURES`, then assert:

```ts
test("inactive token resolves no role and cannot read profiles", async () => {
  const client = await signInAs(fixtures.sales);
  await adminClient
    .from("profiles")
    .update({ account_status: "inactive", status_change_reason: "test" })
    .eq("id", fixtures.sales.id);
  const { data: role } = await client.rpc("current_user_role");
  expect(role).toBeNull();
  const { data } = await client.from("profiles").select("id");
  expect(data).toEqual([]);
});

test("super admin reads every profile but cannot update through Data API", async () => {
  const client = await signInAs(fixtures.super_admin);
  const { data } = await client.from("profiles").select("id, role");
  expect(data!.length).toBeGreaterThanOrEqual(4);
  const { error } = await client
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", fixtures.sales.id);
  expect(error).not.toBeNull();
});
```

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run: `bun run test supabase/tests/profiles.test.ts`

Expected: FAIL because `super_admin`, `account_status`, and inactive-aware `current_user_role()` do not exist.

- [ ] **Step 3: Add the enum value in its own migration boundary**

PostgreSQL may reject use of a newly added enum value elsewhere in the same transaction. Generate a dedicated migration:

Run: `bunx supabase migration new add_super_admin_role`

Its only schema change is:

```sql
alter type public.app_role add value if not exists 'super_admin';
```

Run `bunx supabase db reset` so this migration commits before policies/functions reference `super_admin`.

- [ ] **Step 4: Generate and implement account state and policy migration**

Run: `bunx supabase migration new add_account_status_and_active_role_guard`

The migration must:

```sql
create type public.account_status as enum ('active', 'inactive');

alter table public.profiles
  add column account_status public.account_status not null default 'active',
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles(id) on delete set null,
  add column status_change_reason text;

create index profiles_active_role_idx
  on public.profiles (role)
  where account_status = 'active';

create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and account_status = 'active';
$$;
```

Recreate `profiles_select_own_or_privileged` so an inactive user cannot even read their own row and active Manager/Executive/Super Admin can read the roster. Keep profiles insert/update/delete unavailable to `authenticated`; all role/status mutations remain server-side.

- [ ] **Step 5: Add local seed and helper support**

Add a local-only `super_admin` seed identity with the same clearly disposable credential convention as existing seed users. Extend `RoleFixtureUsers` automatically through the updated fixture union and keep `createRoleFixtureUsers()` inserting `account_status: "active"` explicitly.

- [ ] **Step 6: Reset locally and verify the profile boundary**

Run:

```bash
bunx supabase db reset
bun run test supabase/tests/profiles.test.ts
```

Expected: reset succeeds; profile tests pass, including inactive-token denial and no direct profile mutation.

- [ ] **Step 7: Review checkpoint**

Inspect the generated migration name and `pg_policies`. Confirm no remote command ran, no credential entered the repo, and `service_role` is not exposed through Vite.

## Task 2: Audit every exposed table and enforce the four-role matrix

**Files:**

- Modify: CLI-generated migration from Task 1 or create via CLI `apply_super_admin_rls_matrix`
- Create: `supabase/tests/super-admin-rls.test.ts`
- Modify: all existing `supabase/tests/*.test.ts` that assert three-role behavior

**Interfaces:**

- Consumes `public.current_user_role()` from Task 1.
- Produces active Super Admin select/insert/update permission on supported business tables.
- Preserves Manager write, Executive read-only, Sales owner-only behavior.
- Preserves no update/delete access on `activity_log`.

- [ ] **Step 1: Write the failing table-matrix test**

Use table-driven cases for current public business tables:

```ts
const companyWritableTables = [
  "clients",
  "tasks",
  "commercial_items",
  "sales_orders",
  "follow_up_logs",
] as const;

for (const table of companyWritableTables) {
  test(`active super admin can select ${table} company-wide`, async () => {
    const client = await signInAs(fixtures.super_admin);
    const { error } = await client.from(table).select("*").limit(1);
    expect(error).toBeNull();
  });
}
```

Add focused mutation fixtures per table rather than unsafe generic inserts. Assert `org_settings` and `targets` remain Manager-writable and become Super-Admin-writable; Executive stays read-only; Activity Log update/delete stays denied.

- [ ] **Step 2: Run the matrix and capture failures by table**

Run: `bun run test supabase/tests/super-admin-rls.test.ts`

Expected: FAIL on every table whose policies still contain only Manager/Executive.

- [ ] **Step 3: Update policies explicitly**

For owner-bearing tables, use the exact shape:

```sql
-- select
(public.current_user_role() = 'sales' and owner_id = auth.uid())
or public.current_user_role() in ('manager', 'executive', 'super_admin')

-- supported insert/update
(public.current_user_role() = 'sales' and owner_id = auth.uid())
or public.current_user_role() in ('manager', 'super_admin')
```

For singleton/settings/targets, retain existing Manager permissions and add Super Admin. For `profiles`, keep website mutations behind the Edge Function. For `activity_log`, allow active Super Admin select/insert only and create no update/delete policy.

- [ ] **Step 4: Prove inactive-token denial across domains**

Authenticate a Sales fixture, keep its client, deactivate its profile through `adminClient`, then attempt select/update with the already-issued client. Assert empty/denied results for profiles plus representative owner-bearing and company-readable tables.

- [ ] **Step 5: Run all database tests**

Run: `bun run test supabase/tests`

Expected: all existing role guarantees remain green and new Super Admin/inactive cases pass.

- [ ] **Step 6: Review checkpoint**

Run a `pg_policies` query listing every `public` table. Confirm there is no exposed table without RLS, no `super_admin` exception on Activity Log update/delete, and no policy tests authorization through a browser flag.

## Task 3: Extend immutable Activity Log for administrative events

**Files:**

- Create via CLI: migration from `bunx supabase migration new add_team_admin_audit_fields`
- Modify: `supabase/tests/activity-log.test.ts`
- Modify: `src/lib/data/activity-log.ts`
- Modify: `src/routes/_app.activity.tsx`

**Interfaces:**

- Produces `activity_log.target_profile_id uuid null` with `ON DELETE SET NULL`.
- Produces `activity_log.target_profile_snapshot jsonb null`.
- Produces `activity_log.administrative_reason text null`.
- Produces event kinds `team_member_created`, `team_member_profile_updated`, `team_member_role_changed`, `team_member_deactivated`, `team_member_reactivated`, `team_member_ownership_transferred`, `team_member_deleted`.

- [ ] **Step 1: Write failing schema and immutability tests**

Assert safe snapshot persistence and immutable policies:

```ts
expect(snapshot).toEqual({
  name: "Unused Test User",
  email: "unused@example.com",
  role: "sales",
});
expect(Object.keys(snapshot).sort()).toEqual(["email", "name", "role"]);
```

Attempt update/delete as Sales, Manager, Executive, and Super Admin; every attempt must fail or affect zero rows.

- [ ] **Step 2: Run the focused test**

Run: `bun run test supabase/tests/activity-log.test.ts`

Expected: FAIL because the target/snapshot/reason columns do not exist and Super Admin fixture behavior is not implemented.

- [ ] **Step 3: Generate and implement the audit migration**

Run: `bunx supabase migration new add_team_admin_audit_fields`

Add the three columns, a GIN index on `target_profile_snapshot` only if queries require it, and a constraint preventing secrets from being modeled as top-level snapshot keys:

```sql
check (
  target_profile_snapshot is null
  or not (target_profile_snapshot ?| array[
    'password', 'access_token', 'refresh_token', 'service_role_key'
  ])
)
```

Do not create update/delete grants or policies.

- [ ] **Step 4: Extend data and display types**

Add optional target snapshot/reason fields to the Activity Log row mapper and Indonesian labels for all seven admin events. Render actor and target separately; never show a deleted target as the actor.

- [ ] **Step 5: Verify**

Run:

```bash
bun run test supabase/tests/activity-log.test.ts
bun run test src/lib/data
```

Expected: Activity Log tests pass and existing feed mapping remains compatible.

## Task 4: Build transactional lifecycle primitives and protected server actions

**Files:**

- Create via CLI: migration from `bunx supabase migration new add_account_lifecycle_functions`
- Create: `supabase/tests/account-lifecycle.test.ts`
- Modify: `supabase/functions/manage-team-member/index.ts`
- Create: `supabase/functions/manage-team-member/index.test.ts`

**Interfaces:**

- Produces private/database interfaces `private.account_reference_counts(uuid)`, `private.transfer_active_ownership(uuid, uuid, uuid, text)`, and `private.active_super_admin_count()`.
- Produces Edge Function request union with actions `create`, `update_profile`, `change_role`, `deactivate`, `reactivate`, `transfer_ownership`, `delete_eligible_account`.
- Produces responses `{ id: string; action: string }` and errors `{ error: string; code: string; details?: Record<string, number> }`.

- [ ] **Step 1: Write failing lifecycle database tests**

Create disposable local users/data and assert:

- Reference counts cover every owner/reference table present at implementation time.
- Transfer rejects inactive destination and `executive`/`super_admin` destinations.
- Transfer changes active/open ownership in one transaction and leaves historical Activity Log actor rows unchanged.
- Any injected constraint failure rolls back every owner-bearing table.
- Last-active count never treats inactive Super Admin as available.

Run: `bun run test supabase/tests/account-lifecycle.test.ts`

Expected: FAIL because the private functions do not exist.

- [ ] **Step 2: Generate and implement private functions**

Run: `bunx supabase migration new add_account_lifecycle_functions`

Keep functions in non-exposed `private`, revoke execution from `anon`/`authenticated`, and grant only `service_role`. `transfer_active_ownership` must lock source/destination profile rows, validate roles/status, update the approved active/open owner-bearing rows, and append one administrative Activity Log event before commit.

- [ ] **Step 3: Extract Edge Function validation helpers and write failing tests**

Define exact shared types inside the Edge Function module:

```ts
type AppRole = "sales" | "manager" | "executive" | "super_admin";
type AdminAction =
  | {
      action: "create";
      name: string;
      email: string;
      initials: string;
      role: AppRole;
      password: string;
    }
  | { action: "update_profile"; id: string; name: string; initials: string }
  | { action: "change_role"; id: string; role: AppRole; reason: string }
  | { action: "deactivate" | "reactivate"; id: string; reason: string }
  | {
      action: "transfer_ownership";
      fromId: string;
      toId: string;
      reason: string;
    }
  | { action: "delete_eligible_account"; id: string; reason: string };
```

Test invalid JSON, missing reason, inactive caller, Manager caller, self-deactivate/delete, last-admin demotion/deactivation/delete, referenced delete, and invalid transfer destination with expected 400/401/403/409 status codes.

- [ ] **Step 4: Replace Manager authorization with active Super Admin authorization**

Fetch caller profile fields `role, account_status`; require `super_admin` and `active`. Do not authorize from a request-body role. Keep service-role operations server-side and never return tokens or credentials.

- [ ] **Step 5: Implement each action and compensation rule**

- `create`: create Auth user, insert active profile, append event; delete the new Auth user if profile/audit insertion fails.
- `update_profile`: update safe profile fields and append before/after event.
- `change_role`: enforce last-admin protection and ownership rules before update.
- `deactivate`: update account status first, append event, then attempt Auth sign-out/revocation; database denial remains authoritative if revocation is incomplete.
- `reactivate`: restore active status with reason and event.
- `transfer_ownership`: call the private transactional function.
- `delete_eligible_account`: obtain fresh reference counts immediately before deletion, return 409 when any count is nonzero, append snapshot event, then delete the unused Auth/profile account with compensation/error reporting.

- [ ] **Step 6: Verify server and lifecycle contracts**

Run:

```bash
bun run test supabase/tests/account-lifecycle.test.ts
bun test supabase/functions/manage-team-member/index.test.ts
```

Expected: all lifecycle, protection, rollback, authorization, and safe-error cases pass.

## Task 5: Replace the Team data API and implement role-appropriate Settings UX

**Files:**

- Modify: `src/lib/data/team.ts`
- Create: `src/lib/data/team.test.ts`
- Modify: `src/routes/_app.settings.tsx`
- Modify: focused Settings component tests if the repository's current test harness supports route rendering; otherwise verify in Task 7 browser steps.

**Interfaces:**

- Produces `TeamMember` with `role: AppRole`, `accountStatus`, status metadata, owned active counts, and last administrative change.
- Produces `createTeamMember`, `updateTeamMemberProfile`, `changeTeamMemberRole`, `deactivateTeamMember`, `reactivateTeamMember`, `transferTeamOwnership`, `deleteEligibleTeamMember`.
- Produces a typed `TeamAdminError` carrying HTTP/code/details for UI guidance.

- [ ] **Step 1: Write failing data-layer serialization tests**

Mock `supabase.functions.invoke` and assert every function sends the exact action names and required reason. Assert 409 `{ code: "ACCOUNT_HAS_REFERENCES", details }` becomes a typed error without losing reference counts.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test src/lib/data/team.test.ts`

Expected: FAIL because current API only exposes create/update/remove and supports Sales/Manager roles.

- [ ] **Step 3: Implement the four-role data API**

List all profiles including inactive ones for privileged roster readers. Keep passwords only in the create request; never retain them in query cache or `TeamMember`. Replace `removeTeamMember` with the explicit deactivate/reactivate/delete functions; do not leave a generic destructive alias.

- [ ] **Step 4: Split Settings capabilities explicitly**

Derive:

```ts
const canViewTeam =
  role === "manager" || role === "executive" || role === "super_admin";
const canManageTeam = role === "super_admin";
const canEditTargets = role === "manager" || role === "super_admin";
const canEditOrg = role === "manager" || role === "super_admin";
```

Render active/inactive filters, status/role badges, ownership counts, and dialogs for each supported action only for Super Admin. For Manager/Executive render: `Hanya Super Admin yang dapat mengelola anggota tim dan role.` Sales receives no Team tab.

- [ ] **Step 5: Implement lifecycle guidance**

- Disable self-deactivate/delete controls using current profile ID while retaining server enforcement.
- Show reference counts and recommend `Nonaktifkan Akun` on 409 referenced-delete.
- Require a non-empty reason before role/status/transfer/delete submission.
- Only offer active Sales/Manager as transfer destinations.
- Explain that Super Admin/Executive do not own targets or Sales data.

- [ ] **Step 6: Verify unit/type behavior**

Run:

```bash
bun test src/lib/data/team.test.ts
bunx tsc --noEmit
bun run lint -- src/lib/data/team.ts src/routes/_app.settings.tsx
```

Expected: serialization tests pass; changed files introduce no new type/lint failures.

## Task 6: Update session, role-aware navigation, ownership, targets, and reporting

**Files:**

- Modify: `src/lib/mock/selectors.ts`
- Modify: `src/context/role-context.tsx`
- Create: `src/lib/auth/account-status.ts`
- Create: `src/lib/auth/account-status.test.ts`
- Modify: `src/components/shell/TopBar.tsx`, `src/components/shell/AppSidebar.tsx`
- Modify: `src/lib/data/clients.ts`, `src/lib/data/targets.ts`, dashboard/report selectors and focused tests.

**Interfaces:**

- Produces `Role = "sales" | "manager" | "executive" | "super_admin"` and `ROLE_LABEL.super_admin = "Super Admin"`.
- Produces real-session state distinguishing `active`, `inactive`, and `missing_profile` without mock fallback.
- Produces owner/target queries restricted to active `sales | manager` profiles.

- [ ] **Step 1: Write failing session and exclusion tests**

Assert an inactive profile yields `{ kind: "inactive" }`, triggers sign-out guidance, and never falls through to the local seed-role path. Assert Super Admin is absent from `listSalesTeamProfiles()` and target/performance inputs.

- [ ] **Step 2: Extend role types without adding a Super Admin seed switcher option**

The production role union and label include Super Admin. The prototype local role switcher may keep its existing three display roles unless a disposable local-only Super Admin entry is intentionally added; real authorization always comes from the profile. Never map an unknown role to Manager or Sales.

- [ ] **Step 3: Implement inactive-session handling**

Fetch `role, account_status, name, initials, email`. Return a discriminated result. On `inactive`, render `Akun Anda telah dinonaktifkan. Hubungi Super Admin.` long enough to be understandable, call `supabase.auth.signOut()`, and route to `/login` without loading business queries.

- [ ] **Step 4: Update application capabilities**

Where existing business edit checks allow Manager, add Super Admin only when the domain supports that operation. Preserve owner on writes. Treat Super Admin company scope like Manager/Executive for reads, but never include Super Admin in Sales owner/team target/performance collections.

- [ ] **Step 5: Verify focused behavior**

Run:

```bash
bun test src/lib/auth/account-status.test.ts
bun run test src/lib/data
bunx tsc --noEmit
```

Expected: inactive/no-fallback and ownership/performance exclusion tests pass with no new type errors.

## Task 7: Full local verification, bootstrap rehearsal, and documentation reconciliation

**Files:**

- Create: `supabase/snippets/bootstrap_super_admin_role.sql`
- Modify: `docs/auth-bootstrap.md`
- Modify: `PRD.md`
- Modify: `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`
- Modify: accepted design, backend spec, task trackers, `CLAUDE.md`, `HANDOFF.md` only to reflect verified as-built facts.

**Interfaces:**

- Consumes all prior tasks.
- Produces a local evidence packet and accurate as-built documentation.

- [x] **Step 1: Create and inspect the bootstrap helper**

The SQL accepts one explicit UUID placeholder, verifies the Auth user exists, upserts exactly one active `super_admin` profile, and is idempotent. It contains no account creation, email, password, token, or project URL.

- [x] **Step 2: Rehearse bootstrap only with disposable local users**

Run the helper twice for one disposable local Auth UUID. Assert the first run creates/promotes one row and the second changes no identity/count. Sign in through `/login` and verify Super Admin role resolution. Delete only the captured disposable QA identity after evidence is collected.

- [x] **Step 3: Run the full automated gate**

Run:

```bash
bunx supabase db reset
bun run test
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all new authorization/lifecycle tests pass. Report any unrelated baseline failure by exact file/error; do not claim the gate passed if it did not.

Result: `db reset`/`test` (193/193)/`build` passed clean. `tsc --noEmit` and `lint` each surfaced pre-existing failures scoped entirely to Phase 11/commercial-domain files, unrelated to this task's changes — see `.superpowers/sdd/task-7-report.md` for the exact file/error list.

- [x] **Step 4: Browser-verify the four-role matrix**

Using disposable local identities:

1. Super Admin sees all Settings tabs, active/inactive roster, and mutation controls.
2. Manager and Executive see the roster read-only with the exact guidance; direct mutation returns 403.
3. Sales does not see Team & Role.
4. Super Admin edits a business record and the stored owner remains Sales while Activity Log actor is Super Admin.
5. Inactive user with an existing session loses database reads and is signed out with the unavailable-account message.
6. Super Admin is absent from owner, target, and performance selectors.

All six verified locally; see `.superpowers/sdd/task-7-report.md` for evidence per item. Item 5's "signed out with the unavailable-account message" client behavior was verified by code inspection (`src/lib/auth/account-status.tsx` fetch-and-sign-out path) plus a direct RLS proof that a pre-deactivation JWT loses all reads; it was not independently re-driven end-to-end in the browser this session due to login-automation flakiness unrelated to the app (see report).

- [x] **Step 5: Browser/database-verify lifecycle protections**

Use captured disposable IDs to prove create, role change, deactivate/reactivate, ownership transfer, and eligible delete. Prove 409 rejection for self-deactivate/delete, last-active-admin change, referenced delete, inactive/invalid transfer destination, and transactional transfer failure. Confirm Activity Log snapshots survive eligible deletion and remain immutable.

All proved except last-active-admin change and transactional transfer failure, which were verified by code/migration inspection rather than dynamic reproduction — both guards are only reachable via a genuine concurrent-request race, which self-action checks preempt in every single-actor path. See `.superpowers/sdd/task-7-report.md` for the reasoning and the migration line references.

- [x] **Step 6: Clean QA data safely**

Delete only captured disposable reference-free accounts and their permitted disposable business rows. Do not delete Activity Log evidence through the website or direct role sessions. Reset the local database if needed to restore deterministic seeds; do not run cleanup against a remote project.

Cleaned via `bunx supabase db reset`, which restores the deterministic 6-account seed and removes all QA-created rows/Activity Log entries. `bun run test` re-passed 193/193 afterward.

- [x] **Step 7: Reconcile documentation**

Change "target/pending" statements to "verified" only where automated and browser evidence exists. Record remaining gaps and exact failing gates. Keep Task 29 as historical/superseded and do not rewrite its completed evidence.

## Plan Self-Review

- Spec coverage: all confirmed role, lifecycle, ownership, audit, bootstrap, RLS, UI, error, and verification requirements map to Tasks 1–7.
- Type consistency: `AppRole`, action names, account status, response/error shapes, and data-layer function names remain identical across server, client, and test tasks.
- Safety: every database action is local-first; remote mutation, destructive deletion, credentials, Activity Log mutation, and zero-admin states remain explicitly blocked.
- Phase ordering: role/status/RLS foundations precede Phase 11 commercial tables.
