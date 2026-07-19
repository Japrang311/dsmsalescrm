# Task 1 Independent Review

## Status

`CHANGES_REQUIRED`

[Pasti] The SQL implementation is materially aligned with Task 1, but the change is not ready to accept because its local-only safety boundary is not enforced and its fixture lifecycle is not failure-safe. The authorization SQL itself does not widen Task 2 or Activity Log scope.

## Review scope and method

- [Pasti] Reviewed only Task 1 in `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md:56-176`, the evidence in `.superpowers/sdd/task-1-report.md`, and the Task 1 files named by that report.
- [Pasti] No test was rerun, no Supabase command was executed, and no application/schema file was modified as part of this review.
- [Pasti] The status above evaluates both specification compliance and code/test/security quality.

## Findings

### Critical — The test helper does not enforce the binding local-only boundary

[Pasti] `supabase/tests/helpers.ts:9-15` accepts arbitrary `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment values, then constructs a service-role client at `supabase/tests/helpers.ts:17-22`. `createRoleFixtureUsers()` performs Auth Admin user creation and profile insertion through that client at `supabase/tests/helpers.ts:33-59`, while `deleteRoleFixtureUsers()` performs Auth Admin deletion at `supabase/tests/helpers.ts:63-66`. A developer or CI process with remote Supabase variables in its environment can therefore run the Task 1 tests against a linked/hosted database despite the comments saying they are local-only.

Impact: the suite can create active role accounts, including an active `super_admin`, and mutate/delete Auth data on a remote target. This contradicts the plan's binding local-only constraint (`docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md:13`) and turns a configuration mistake into a privileged remote mutation.

Required change: make the helper fail closed before constructing `adminClient` unless `API_URL` resolves to an explicit loopback host and approved local Supabase port. Do not provide a remote opt-out for this test helper. Add a small unit/contract test for the URL guard that does not contact Supabase.

### Important — The login-capable Super Admin seed is conventionally local, not technically local-only

[Pasti] `supabase/seed.sql:1-3` claims the file “Never runs against a real/remote project,” but `supabase/seed.sql:31-33` inserts an Auth user with a fixed, known password and `supabase/seed.sql:35-42` grants that identity an active `super_admin` profile. Supabase supports applying seed files to remote databases with `db push --include-seed` and explicitly warns not to do that in production. Therefore the comment is not an enforcement boundary.

Impact: if this ordinary seed file is included in a hosted deployment, it creates a predictable privileged login. The `.test` email and disposable password communicate intent but do not make the account harmless once inserted remotely.

Required change: keep the required local fixture, but move creation of the login-capable Super Admin behind a fail-closed local bootstrap path that targets a fixed loopback URL, or add an equivalent technically enforced local-only gate before this seed can execute. Update the absolute “never runs remote” claim so it describes the actual control. Official behavior reference: https://supabase.com/docs/guides/local-development/cli-workflows

### Important — Fixture setup is not failure-atomic and cleanup is not robust

[Pasti] `createRoleFixtureUsers()` creates one Auth user and profile at a time, but it has no `try/catch/finally` rollback around `supabase/tests/helpers.ts:33-60`. If any later Auth creation or profile insert fails, the function throws before returning its accumulated IDs. `profiles.test.ts` declares `fixtures` as definitely assigned at `supabase/tests/profiles.test.ts:10`, assigns it only after the whole helper returns at `supabase/tests/profiles.test.ts:12-14`, and unconditionally passes it to cleanup at `supabase/tests/profiles.test.ts:16-18`.

This is not hypothetical: the recorded RED run failed during partial setup, then cleanup received `undefined` and required a database reset (`.superpowers/sdd/task-1-report.md:46-55`, acknowledged again at `.superpowers/sdd/task-1-report.md:148`). The random email suffix avoids collisions but does not remove orphaned users after a partial failure.

Impact: expected RED runs and genuine regressions can leave active Auth/profile fixtures behind, produce a second misleading cleanup error, and make subsequent local evidence less deterministic.

Required change: make `createRoleFixtureUsers()` track every created Auth ID and best-effort delete those IDs if any creation/profile insert fails; make teardown accept an absent/partial fixture safely and surface cleanup failures without masking the primary test failure. This hardening belongs in Task 1 because the helper was changed for the fourth role and the Task 1 RED evidence directly exercised the failure path.

### Important — Tests do not prove two explicit authorization contracts

[Pasti] The migration implements the intended distinction correctly: the self-read branch requires the target row to be active, while the privileged-roster branch calls an active-caller helper without filtering target rows (`supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:20-22,35-36`). However, the tests do not prove this distinction. The Super Admin roster test runs against active fixtures only (`supabase/tests/profiles.test.ts:58-69`), and the inactive test checks only an inactive Sales caller's own access (`supabase/tests/profiles.test.ts:71-87`). There is also no authenticated caller without a profile, even though Task 1 explicitly requires `current_user_role()` to return `NULL` for both inactive and missing profiles (`docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md:73`).

Impact: a future policy change that incorrectly hides inactive target rows from active Manager/Executive/Super Admin callers, or a helper regression involving missing profiles, can pass the focused suite. These are high-value security-boundary cases, not cosmetic coverage.

Required change: add focused integration assertions that (1) an active privileged caller can read a deliberately inactive target row, (2) an inactive privileged caller cannot read the roster, and (3) a signed-in Auth user with no profile gets `NULL` from `current_user_role()` and no profile rows. Reuse the failure-safe cleanup required above.

## TDD evidence assessment

[Pasti] RED and GREEN command/result evidence is present in `.superpowers/sdd/task-1-report.md:38-55,70-120`. GREEN evidence covers the focused profile test, fresh database suite, changed-file lint, database lint, and security advisor.

[Pasti] The RED invocation failed before the new profile assertions ran: its primary failure was enum conversion during fixture setup, and its second failure was teardown on an undefined fixture (`.superpowers/sdd/task-1-report.md:46-55`). This is acceptable evidence that the explicit fourth-role fixture was initially absent, but it is not behavioral RED evidence for the inactive/missing-profile boundary. Addressing the missing tests and cleanup findings above will make the TDD record credible for the full Task 1 security contract.

## Confirmed compliant elements

- [Pasti] The enum migration is isolated and contains only the required `super_admin` enum addition: `supabase/migrations/20260718160245_add_super_admin_role.sql:1`.
- [Pasti] The second migration adds the required `account_status` enum, four profile fields, and active-role partial index: `supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:1-11`.
- [Pasti] `current_user_role()` is `STABLE SECURITY DEFINER`, fixes `search_path`, schema-qualifies the protected table and `auth.uid()`, and returns no row/`NULL` for inactive or missing profiles: `supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:13-23`.
- [Pasti] Function execution is revoked from `PUBLIC` and `anon`, then explicitly granted only to `authenticated` and `service_role` (with the owner retaining implicit rights): `supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:25-26`.
- [Pasti] The recreated profiles policy permits active self-read and active privileged roster read, including inactive target rows; it creates no write policy: `supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:28-37`.
- [Pasti] The original profiles migration grants `authenticated` only `SELECT`, while service-role retains server-side write privileges: `supabase/migrations/20260717172233_profiles.sql:61-68`. Task 1 did not widen those table privileges.
- [Pasti] The four explicit roles are represented in the fixture type and data: `tests/fixtures/roles.ts:5-11,13-42`.
- [Pasti] `supabase/tests/super-admin-rls.test.ts:1-11` stays within Task 1 as a fixture contract. It does not implement Task 2's business-table matrix or touch Activity Log policy behavior.
- [Pasti] Neither Task 1 migration changes Activity Log or any business-table policy. No browser-source file receives a service-role key in the inspected Task 1 change.

## Acceptance gate

Task 1 can be re-reviewed after the four required changes above are implemented and the report contains fresh RED/GREEN evidence for the added guard/authorization tests. Do not widen business-table or Activity Log policies while addressing these findings; those remain Task 2.

## Re-review after Fix wave 1

### Status

`APPROVED`

[Pasti] Fix wave 1 resolves every Critical/Important finding above. No Critical, Important, or Minor finding remains within the requested Task 1 re-review scope.

### Resolution evidence

- [Pasti] The local-only test boundary now fails closed before constructing the privileged client. `requireLocalSupabaseUrl()` accepts only exact HTTP origins on `127.0.0.1`, `localhost`, or `[::1]` at port `54321` and rejects credentials, paths, query strings, fragments, HTTPS, other ports, and hosted URLs (`supabase/local-supabase-url.ts:1-31`). The test helper invokes it before reading the URL into `adminClient` (`supabase/tests/helpers.ts:6-12,20-25`). The pure guard and both privileged-client invocation boundaries have focused tests (`supabase/tests/local-supabase-url.test.ts:28-111`).
- [Pasti] The ordinary seed no longer contains the fixed Super Admin UUID, email, Auth row, or profile row. Its header now accurately warns that seed files can be pushed remotely and points to the guarded local bootstrap (`supabase/seed.sql:1-5,18-40`). The replacement bootstrap invokes the same fail-closed URL guard before constructing its service-role client, contains no bypass, and idempotently creates/updates only the disposable local Super Admin fixture (`supabase/scripts/bootstrap-local-super-admin.ts:1-23,25-66`).
- [Pasti] Fixture setup now tracks every created Auth ID, rolls them back in reverse order after any later setup failure, preserves the primary setup error, and aggregates rollback failures (`supabase/tests/helpers.ts:56-105`). Teardown accepts undefined/partial fixtures, attempts every known deletion, and aggregates all failures (`supabase/tests/helpers.ts:107-117`). Focused unit tests exercise rollback, rollback-error preservation, undefined teardown, and partial cleanup aggregation (`supabase/tests/helpers.test.ts:27-141`).
- [Pasti] The profile suite now proves the previously missing target-versus-caller semantics: active Super Admin can read an inactive target (`supabase/tests/profiles.test.ts:157-176`), inactive Manager resolves no role and sees no roster (`supabase/tests/profiles.test.ts:178-197`), and an authenticated user without a profile resolves no role and sees no profiles (`supabase/tests/profiles.test.ts:199-222`). Reactivation/Auth cleanup preserves assertion errors and aggregates cleanup errors (`supabase/tests/profiles.test.ts:17-70`), while suite teardown is safe when fixture setup never completes (`supabase/tests/profiles.test.ts:72-78`).
- [Pasti] Fix wave 1 contains no migration or policy edit. The changed files contain no `CREATE POLICY`, `DROP POLICY`, or Activity Log authorization change; the existing Task 1 SQL boundary therefore remains intact and Task 2/3 scope was not widened.

### Verification assessment

[Pasti] The appended report records targeted RED evidence for the URL guard/invocation boundaries, fixture lifecycle, and all three authorization regressions (`.superpowers/sdd/task-1-report.md:174-202`). It then records GREEN results for the guard/bootstrap contract, lifecycle tests, reset/bootstrap idempotence, focused profile suite, full database suite, ESLint, schema lint, and security advisor (`.superpowers/sdd/task-1-report.md:214-281`). Per the review instruction, these tests were not rerun during re-review.
