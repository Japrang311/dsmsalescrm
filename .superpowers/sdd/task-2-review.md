# Task 2 Independent Review

## Status

`CHANGES_REQUIRED`

[Pasti] The migration gets the broad four-role row matrix, inactive-caller
fail-closed behavior, no-hard-delete boundary, profiles read-only boundary, and
`security_invoker` view shape materially right. It is not ready to accept
because privileged inserts can create invalid Sales ownership/targets, browser
callers can forge Activity Log attribution, and the claimed four-role
verification is not behaviorally complete.

## Review scope and method

- [Pasti] Reviewed the Global Constraints and Task 2 in
  `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md:11-24,178-251`,
  `.superpowers/sdd/task-2-report.md`, the actual migration
  `supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql`, the
  focused test `supabase/tests/super-admin-rls.test.ts`, and the current public
  schema/test files needed to validate relation and role coverage.
- [Pasti] No test was rerun and no Supabase command was executed. No source,
  migration, or test file was modified; this review file is the only write.
- [Pasti] Checked policy semantics, relation and column privileges, all current
  public relations, `security_invoker`, test cleanup, Task 3/4 scope exclusion,
  and the recorded verification evidence.
- [Pasti] Current Supabase/PostgreSQL documentation confirms the implementation's
  sound use of `TO authenticated`, `USING` plus `WITH CHECK`, scalar subqueries,
  column-level UPDATE grants, and `security_invoker=true`. It also recommends
  indexes on non-key columns used in RLS policies.

## Findings

### Critical

None.

### Important — Privileged INSERT/target policies allow non-Sales and inactive owners

[Pasti] The Global Constraints say Super Admin is not a Sales owner and must be
excluded from targets and Sales performance
(`docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md:17`).
However, each privileged owner-bearing INSERT branch authorizes solely from the
caller's role and does not validate the referenced owner profile:

- `clients`: `supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:30-37`
- `tasks`: `supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:65-72`
- `commercial_items`: `supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:100-107`
- `sales_orders`: `supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:135-142`
- `follow_up_logs`: `supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:170-177`

The `targets` INSERT/UPDATE `WITH CHECK` likewise validates only the caller's
Manager/Super-Admin role, not that `sales_id` points to an active Sales profile
(`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:194-205`).
Because every owner/target FK references any profile, an active Super Admin or
Manager can create business rows or targets assigned to a Manager, Executive,
Super Admin, or inactive Sales profile. The focused tests only use the active
Sales fixture as destination (`supabase/tests/super-admin-rls.test.ts:220-226,248-256,278-287,310-321,343-352,365-373`) and therefore do not expose this violation.

Impact: the database boundary permits Super Admin to become a Sales owner or
target recipient and permits orphaned operational ownership on inactive
accounts. That contaminates owner selectors, targets, and Sales performance
even if the later UI filters correctly; the architecture explicitly makes
PostgreSQL/RLS, not React, the authorization boundary.

Required change: add a reusable predicate that requires every privileged
`owner_id`/`sales_id` destination to be an active `sales` profile, apply it to
the relevant INSERT/`WITH CHECK` paths, and add negative tests for Super Admin,
Manager, Executive, and inactive-Sales destinations. Do not add Task 4 transfer
functions while fixing this Task 2 invariant.

### Important — Activity Log rows are append-only but forgeable

[Pasti] The Activity Log INSERT policy checks the caller role and `owner_id`,
but never binds `actor_id` to the authenticated caller
(`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:242-249`).
The table-level INSERT grant also permits browser callers to supply every
column, including `id` and `created_at`
(`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:331-334`;
column definitions at `supabase/migrations/20260718011409_activity_log.sql:37-48`).

Impact: Sales can append an immutable event naming a Manager/Super Admin as the
actor and can backdate it; Manager/Super Admin can impersonate any profile.
Preventing UPDATE/DELETE does not make an audit trail trustworthy when the
original attribution and time are client-controlled. No current test attempts
actor spoofing or a caller-supplied timestamp.

Required change: require `actor_id = (select auth.uid())` for all website-role
inserts and replace table-wide authenticated INSERT with explicit insertable
business columns that exclude server-owned `id` and `created_at`. Keep
service-role privileges for later protected administrative writes. This needs
no Task 3 columns/event kinds and no Task 4 lifecycle function.

### Important — The tests do not prove the complete four-role operation matrix

[Pasti] The focused file exercises Super Admin across every current relation,
but it is not a four-role table matrix: outside the inactive test, every
authenticated client in `supabase/tests/super-admin-rls.test.ts:170-549` is
Super Admin. The existing domain tests cover Sales/Manager/Executive reads, but
they do not exercise Manager INSERT/UPDATE on `clients`, `tasks`,
`commercial_items`, or `sales_orders`; they do not prove the positive Sales-own
write path across those tables; and Manager/Executive never query
`revenue_recognized` (the view is queried only by Sales at
`supabase/tests/sales-orders.test.ts:166-175` and Super Admin at
`supabase/tests/super-admin-rls.test.ts:192-213`). Owner reassignment denial is
also tested only for Super Admin
(`supabase/tests/super-admin-rls.test.ts:428-465`), even though the column grant
is shared by Sales, Manager, and Super Admin.

Impact: regressions that remove Manager writes, widen an Executive write verb,
break Manager/Executive view access, or re-enable direct Manager/Sales owner
updates can still leave the reported `supabase/tests` suite green. Therefore
the report's statements that the tests cover every current relation and
preserve Manager write/Executive read-only behavior are stronger than the
actual behavioral evidence (`.superpowers/sdd/task-2-report.md:139-148,210-218`).

Required change: add table-driven, Data-API-level assertions for each current
public relation and each applicable role/operation. At minimum prove Sales
own-positive and other-negative behavior, Manager supported company-wide
writes, Executive denial for every granted write verb, Super Admin supported
writes, all-role owner reassignment denial, and Manager/Executive reads through
`revenue_recognized`. Keep catalog inventory as a complement, not a substitute,
for behavioral tests.

### Important — Business-fixture cleanup silently ignores failures

[Pasti] `afterAll` restores the shared `org_settings` singleton and deletes all
business rows without checking any returned error
(`supabase/tests/super-admin-rls.test.ts:134-158`). The inline cleanup for
successful Super Admin inserts repeats the same unchecked pattern, for example
at `supabase/tests/super-admin-rls.test.ts:230-231,260-261,291-293,325-327,356-358,375-377,424-425`.

Impact: a cleanup permission, dependency-order, or connection failure can leave
the singleton renamed and privileged test rows behind while the suite still
reports green. Later tests then run against contaminated state, and the report's
cleanup/evidence claims are not fail-safe.

Required change: centralize business-row cleanup, inspect every Supabase result,
attempt all cleanup steps even after one fails, and throw an `AggregateError`
that preserves all cleanup failures. Apply the same discipline to restoring
`org_settings`; do not mask the primary assertion failure.

### Minor — RLS ownership predicates have no supporting indexes

[Pasti] The new policies filter six growing tables by `owner_id`:
`clients`, `tasks`, `commercial_items`, `sales_orders`, `follow_up_logs`, and
`activity_log` (`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:21-28,56-63,91-98,126-133,161-168,233-240`). None of their schema migrations creates an index on `owner_id`; the only new Task 1 index is the partial role index on `profiles`
(`supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:9-11`).

Impact: Sales-scoped queries will increasingly scan entire business/audit
tables merely to enforce RLS. The scalar-subquery optimization prevents helper
re-execution per row but does not make `owner_id` searchable. Supabase's current
RLS guidance explicitly recommends indexing non-key policy columns:
[Supabase RLS performance recommendations](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations).

Required change: add normal btree indexes for the six `owner_id` columns (or
document an evidence-backed reason for a more selective index) and add an
`EXPLAIN`/advisor verification appropriate to representative Sales queries.

## Confirmed compliant elements

- [Pasti] All nine current public tables are explicitly RLS-enabled in the
  migration, and the one current public view remains a
  `security_invoker=true` view over `sales_orders`
  (`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:1-12`;
  `supabase/migrations/20260718001521_sales_orders.sql:88-99`).
- [Pasti] Active Sales SELECT/INSERT/UPDATE branches are owner-scoped; active
  Manager and Super Admin receive company branches; active Executive appears
  only in SELECT branches. Every policy targets `authenticated` and delegates
  active/missing-profile denial to `current_user_role()`.
- [Pasti] The inactive old-token test keeps the pre-deactivation client and
  behaviorally proves denial for profile read, an owner-bearing read/update,
  and company-readable settings, then restores the fixture without masking
  assertion/reactivation failures (`supabase/tests/super-admin-rls.test.ts:551-607`).
- [Pasti] `profiles` is authenticated SELECT-only; `activity_log` and
  `follow_up_logs` have no authenticated UPDATE/DELETE privilege; all listed
  business relations have no authenticated DELETE privilege
  (`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:254-336`).
- [Pasti] Column-level UPDATE grants correctly remove direct `owner_id` updates
  from `clients`, `tasks`, `commercial_items`, and `sales_orders`, while
  retaining SELECT so PostgreSQL/PostgREST can perform supported updates and
  return representations
  (`supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql:267-328`).
  The focused Super Admin test verifies both permission denial and unchanged
  stored owners (`supabase/tests/super-admin-rls.test.ts:428-465`).
- [Pasti] `targets` and `org_settings` preserve Manager write and add Super Admin
  write at policy level; Executive remains read-only. No hard-delete policy or
  grant was invented.
- [Pasti] The migration adds no Task 3 Activity Log columns/event kinds and no
  Task 4 private lifecycle functions, ownership-transfer function, or account
  action.

## Verification assessment

[Pasti] The report records credible RED for the missing Super Admin matrix and
for direct `owner_id` reassignment, followed by a fresh reset, focused GREEN,
full Supabase suite, lint, advisors, and catalog inventory
(`.superpowers/sdd/task-2-report.md:31-75,118-208`). Per instruction, none of
those commands was rerun during review.

[Pasti] Passing evidence does not resolve the Important findings because the
current tests never attempt invalid owner/target destinations, forged Activity
Log attribution, or the omitted Manager/Sales/Executive operation cells, and
cleanup failures are not surfaced as test failures.

## Acceptance gate

Task 2 can be re-reviewed after all Important findings are fixed and fresh
focused/full-suite evidence is appended to the implementation report. The
missing RLS indexes should be fixed in the same migration wave or explicitly
accepted as deferred performance debt with measured evidence. Do not add Task
3 audit fields/event kinds or Task 4 lifecycle functions while addressing these
Task 2 findings.

## Re-review after Fix wave 1

### Status

`APPROVED`

[Pasti] Fix wave 1 resolves every prior Important finding and the Minor index
finding under the accepted specification that active Sales **or active Manager**
profiles are valid ownership/target destinations. Active Executive, active
Super Admin, and every inactive profile are rejected. No Critical, Important,
or Minor finding remains within Task 2 scope.

### Resolution evidence

- [Pasti] Ownership and target destinations are now enforced by
  `private.is_active_business_owner(uuid)`, which returns true only for an
  active `sales | manager` profile. The function is `STABLE SECURITY INVOKER`,
  uses an empty `search_path`, schema-qualifies `public.profiles`, and has no
  `PUBLIC`/`anon` execution grant
  (`supabase/migrations/20260718171152_harden_super_admin_rls_matrix.sql:1-28`).
  The local Data API exposes only `public` and `graphql_public`, so `private` is
  not an RPC surface (`supabase/config.toml:13-15`).
- [Pasti] The active-owner predicate is applied to INSERT and UPDATE
  `WITH CHECK` policies for every mutable owner-bearing table, INSERT policies
  for both append-only tables, and INSERT/UPDATE checks for `targets`
  (`supabase/migrations/20260718171152_harden_super_admin_rls_matrix.sql:30-191`).
  Behavioral tests prove active Manager destinations work and reject Executive,
  Super Admin, inactive Sales, and inactive Manager destinations, including
  target reassignment and corrections on rows whose preserved owner is inactive
  (`supabase/tests/super-admin-rls.test.ts:456-515,634-707`).
- [Pasti] Activity Log website inserts now require
  `actor_id = (select auth.uid())`, retain the valid operational-owner check,
  and use column-level INSERT privileges that omit server-owned `id` and
  `created_at`; service-role's existing full grant is untouched
  (`supabase/migrations/20260718171152_harden_super_admin_rls_matrix.sql:193-223`).
  Sales, Manager, and Super Admin actor-forgery attempts fail; website-supplied
  identity/time fail; and service-role full insertion is proven separately
  (`supabase/tests/super-admin-rls.test.ts:709-778`).
- [Pasti] The focused suite now exercises the missing behavioral matrix through
  signed-in Data API clients: Sales own-positive/other-negative writes, Manager
  company writes with Manager-owned rows and targets, Executive denial for
  every website-granted write verb, Manager/Executive reads through the
  `security_invoker` revenue view, and four-role direct `owner_id` reassignment
  denial (`supabase/tests/super-admin-rls.test.ts:370-632`). Existing domain
  tests plus the Super Admin relation reads/writes cover the remaining current
  public relation cells (`supabase/tests/super-admin-rls.test.ts:781-1028`).
- [Pasti] Cleanup is centralized and failure-aware. Every tracked deletion and
  singleton restoration inspects returned errors, all steps are attempted,
  cleanup failures are aggregated without masking a primary setup/assertion
  failure, and setup itself invokes the same cleanup path
  (`supabase/tests/super-admin-rls.test.ts:58-128,275-359`). Inline successful
  inserts now register rows for this shared teardown rather than issuing
  unchecked deletes.
- [Pasti] Ordinary btree indexes now exist for `owner_id` on `clients`, `tasks`,
  `commercial_items`, `sales_orders`, `follow_up_logs`, and `activity_log`
  (`supabase/migrations/20260718171152_harden_super_admin_rls_matrix.sql:225-243`).
  The report records catalog confirmation and representative `EXPLAIN` evidence
  that all six indexes are eligible, using Index Scan or Bitmap Index Scan
  (`.superpowers/sdd/task-2-report.md:388-420`).
- [Pasti] Fix wave 1 adds no Task 3 Activity Log columns/event kinds and no Task
  4 lifecycle, account-reference, ownership-transfer, or last-admin function.
  The private boolean predicate is narrowly owned by the Task 2 RLS invariant.

### Verification assessment

[Pasti] The appended implementation report records focused behavioral RED for
all three security/data-integrity gaps, followed by focused GREEN (`32 pass`,
`174 expect()`), a fresh full database suite (`103 pass`, `298 expect()`),
ESLint, schema lint across `public,private`, security/performance advisors,
migration inventory, catalog ACL/policy/index inspection, and representative
query plans (`.superpowers/sdd/task-2-report.md:268-420`). Per re-review
instruction, none of these commands was rerun.

[Pasti] The report correctly retains one non-blocking Task 6 concern: an
unfiltered Sales query can still choose a sequential scan because the combined
Sales/company policy contains a privileged-role branch
(`.superpowers/sdd/task-2-report.md:422-430`). That does not reopen the prior
Task 2 index finding: the requested indexes now exist and are demonstrably
usable; adding explicit role-aware owner filters to application list queries is
already assigned to Task 6.
