# Task 4 Implementation Report

## Status

`DONE_WITH_CONCERNS`

[Pasti] Task 4 is implemented and verified against the local Supabase stack.
The transactional database primitives, service-only RPC boundary, exact
seven-action Edge contract, active-Super-Admin authorization, compensation
rules, audit snapshots, ownership scope, and permanent-delete eligibility are
covered by tests. No hosted Supabase command, project link, remote advisor,
deployment, Git operation, commit, push, or Task 5 UI/data-API work was run.

The status is not `DONE` because two expected Auth cleanup limitations remain
and the repository-wide TypeScript/ESLint gates contain pre-existing findings
outside Task 4. Every Task 4-specific gate is green.

## Exact files changed or created

Created through Supabase CLI 2.109.1:

- `supabase/migrations/20260718180929_add_account_lifecycle_functions.sql`

Created:

- `supabase/tests/account-lifecycle.test.ts`
- `supabase/functions/manage-team-member/contracts.ts`
- `supabase/functions/manage-team-member/handler.ts`
- `supabase/functions/manage-team-member/index.test.ts`
- `.superpowers/sdd/task-4-report.md`

Modified:

- `supabase/functions/manage-team-member/index.ts`

The migration filename was generated locally with:

```bash
bunx supabase migration new add_account_lifecycle_functions
```

No earlier migration was rewritten. The temporary Edge smoke script was
deleted after use and its disposable Auth/profile/audit records were cleaned.

## Source and compatibility evidence

Implementation was checked against current Supabase documentation and the
installed `@supabase/supabase-js` 2.110.7 surface:

- [`auth.getUser(jwt)` validates a JWT with Auth](https://supabase.com/docs/reference/javascript/auth-getuser).
- [Admin user creation is server-only](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
- [Admin user update supports server-side ban management](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).
- [Admin user deletion requires the service role](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
- [Admin sign-out requires the target user's JWT](https://supabase.com/docs/reference/javascript/auth-admin-signout).
- [Signed-out access tokens remain valid until their expiry](https://supabase.com/docs/guides/auth/signout).
- [Function privileges default broadly and must be revoked explicitly](https://supabase.com/docs/guides/database/functions#function-privileges).
- [Non-exposed schemas and RLS remain the Data API protection boundary](https://supabase.com/docs/guides/api/securing-your-api).

[Pasti] The installed Auth client exposes `createUser`, `updateUserById` with
`ban_duration`, `deleteUser`, and `signOut(jwt, scope)`. The final local Edge
runtime smoke used `supabase-edge-runtime` 1.74.2, compatible with Deno 2.1.4,
and completed without an API mismatch.

## RED evidence

### Lifecycle database primitives

The tests were written before each database slice:

```bash
bun run test supabase/tests/account-lifecycle.test.ts
```

Observed RED sequence:

- Initial count contract: `0 pass`, `2 fail`; PostgREST returned `PGRST202`
  because the active-admin and reference-count RPCs did not exist.
- Ownership-transfer contract: the focused test returned `PGRST202` for the
  missing transfer RPC. The rollback harness then injected a deterministic
  trigger failure after earlier tables had been updated.
- Create/update/role/status/delete contract: `5 pass`, `6 fail`, with each
  missing public service wrapper reported as `PGRST202`.
- Transfer audit self-review added explicit nested `before`/`after` ownership
  assertions. The focused run produced `0 pass`, `1 fail`, `19 expect()` calls
  because only the legacy scalar owner IDs were present.
- Index self-review added a catalog assertion before the indexes. The focused
  run produced `0 pass`, `1 fail`; local PostgreSQL raised
  `MISSING_ACTIVITY_LOG_ACTOR_INDEX`.

Every RED failure named the absent behavior and became GREEN only after its
migration implementation was applied through a fresh local reset.

### Edge contract and handler

The Edge module was split so Bun tests never load `Deno` or `jsr:` imports.
Observed RED sequence:

- Missing pure contract module: `0 pass`, `1 fail`.
- Missing parser/error exports: `1 pass`, `1 fail`.
- Parser behavior: `2 pass`, `3 fail`; values were not normalized, malformed
  JSON did not produce a structured 400, and raw database errors were leaked.
- Missing pure handler module: `5 pass`, `1 fail`.
- Handler behavior: `6 pass`, `6 fail`; the stub returned `undefined` instead
  of enforcing authorization, routing RPCs, ordering effects, and applying
  compensation.

Final Edge contract result is `12 pass`, `0 fail`, `63 expect()` calls.

### Service-only mutation test

The authenticated-browser RPC regression was mutation-tested locally. Granting
only the public wrapper still failed closed because the private function was a
second barrier. After temporarily granting the public wrapper, private schema
usage, and private function execution, the test failed as expected because it
received count `1` instead of a `42501` denial. All temporary grants were then
revoked and the test returned GREEN. No migration or hosted database was
changed by this fault injection.

## Database implementation

### Reference and eligibility primitives

- `private.active_super_admin_count()` counts only active `super_admin`
  profiles.
- `private.account_reference_counts(uuid)` reports all ten current FK paths to
  `profiles`: client/task/commercial/SO/follow-up ownership, targets, Activity
  owner/actor/target, and profile status actor.
- Activity `target_profile_id` is reported in `total_all` but excluded from
  `total_blocking`; its FK is `ON DELETE SET NULL` and Task 3 preserves the safe
  immutable name/email/role snapshot. Activity owner/actor references remain
  blocking.
- Fresh counts are computed while the target profile is locked. Concurrent FK
  inserts must wait for the delete and cannot create a post-check cascade gap.
- New btree indexes cover the two newly queried FK paths not already indexed:
  `activity_log.actor_id` and `profiles.status_changed_by`.

### Ownership transfer

`private.transfer_active_ownership(...)` locks source, destination, and actor
profiles in deterministic UUID order, requires an active Super Admin actor,
requires a Sales/Manager source, and permits only an active Sales/Manager
destination.

The accepted default scope is exact:

- clients except `Lost` (including `Dormant`, which can reactivate);
- tasks where status is not `Done` and `archived = false`;
- commercial items outside terminal stages `Closed Won`, `Closed Lost`,
  `Revenue Recorded`, and `Closed`.

It never rewrites Sales Orders/revenue, targets, follow-up history, or Activity
Log. Historical Activity actor attribution and recorded owners remain intact.
All three update groups plus the administrative audit insert are one PostgreSQL
transaction. The audit stores actor, source target snapshot, required reason,
result, explicit before/after owner objects, and counts. An injected failure in
the last owner-bearing table rolls back every earlier update and audit row.

### Lifecycle mutations and audit

Private transactional functions implement:

- create active profile plus `team_member_created` audit;
- update only name/initials plus before/after audit;
- role change plus ownership/current-account/last-admin guards;
- deactivate/reactivate plus status metadata and audit;
- eligible profile delete plus preserved target snapshot audit.

All lifecycle functions re-check the actor as an active Super Admin in the
database. Deactivate/delete reject the current account; role change rejects a
current-account role mutation; demotion/deactivation/delete reject the last
active Super Admin. Promotion/demotion into a non-owning role is rejected while
any historical ownership path remains. Permanent delete uses fresh counts and
never cascades business or audit rows to manufacture eligibility.

All seven administrative event kinds record actor, safe target snapshot,
before/after state, result, and a non-blank administrative reason. Create and
safe-profile-update use explicit standardized reasons because those two exact
request contracts contain no user-supplied reason.

### Function boundary

Nineteen Task 4 functions were catalog-checked: eleven in `private` and eight
public PostgREST wrappers. Every one has:

- `anon EXECUTE = false`;
- `authenticated EXECUTE = false`;
- `service_role EXECUTE = true`;
- `SECURITY INVOKER`;
- an empty locked `search_path`.

The authenticated Super Admin and Manager browser clients both receive
PostgreSQL `42501` when directly invoking a wrapper. The public wrappers exist
only because PostgREST does not expose the `private` schema; the Edge Function's
server-held service client is their sole application caller.

## Edge implementation

The exact request union accepts only:

- `create`;
- `update_profile`;
- `change_role`;
- `deactivate`;
- `reactivate`;
- `transfer_ownership`;
- `delete_eligible_account`.

The parser rejects malformed JSON, arrays, unknown actions, extra keys,
invalid UUID/email/role values, weak-short passwords, blank reasons, and body
sizes over 16 KiB. Strings are normalized without normalizing the password.
Responses expose only `{ id, action }`. Errors use
`{ error, code, details? }`; only finite non-negative numeric reference counts
can appear in `details`. Unknown database/Auth text is replaced by a generic
safe error.

Authorization order is server-controlled:

1. Require POST and a valid Bearer token.
2. Validate the JWT using `auth.getUser(jwt)`.
3. Read `role, account_status` using the server client.
4. Require `role = super_admin` and `account_status = active` before parsing or
   dispatching the body.
5. Let the database repeat the active-Super-Admin and lifecycle checks.

Managers, Executives, Sales, inactive profiles, missing profiles, and invalid
sessions cannot mutate team state. A body-supplied role is never used for
caller authorization.

Compensation/order rules are explicit:

- Create makes the Auth user first, then calls the atomic profile/audit RPC.
  Database failure deletes the new Auth user. If cleanup itself fails, the
  response is an actionable 502; the Auth-only user has no profile/RLS
  authority.
- Deactivate commits the database inactive status/audit first, then attempts an
  administrative Auth ban. A repeat request still retries the Auth step when
  the database reports `ACCOUNT_STATUS_UNCHANGED`.
- Reactivate removes the Auth ban first, then commits the database activation.
  If activation fails, the profile remains inactive and the handler attempts
  to restore the Auth ban as defense in depth.
- Eligible delete commits the eligibility check/audit/profile deletion first,
  then hard-deletes the Auth user. Auth cleanup failure returns an actionable
  502 while the profile-less user remains denied by RLS.

## Threat-model review

- **Spoofing/elevation:** caller identity comes from Auth `getUser`, not body
  claims; role/status come from the profile; database functions repeat the
  authorization check.
- **Tampering:** strict exact-key parsing blocks mass assignment; profile role,
  status, ownership, and delete mutations cannot use the browser Data API.
- **Repudiation:** every successful lifecycle change writes an immutable
  administrative event in the same database transaction, with actor, target,
  snapshot, reason, result, and before/after state.
- **Information disclosure:** no token, password, service key, Auth error text,
  or target secret is returned. Numeric reference details use an allowlist by
  type, and a credential-shaped-literal scan of Task 4 files is clean.
- **Denial of service:** the handler rejects bodies above 16 KiB; PostgreSQL row
  locks are deterministic to avoid cross-action deadlock ordering.
- **Partial failure:** injected audit and transfer failures prove full database
  rollback; cross-system Auth/database operations have explicit fail-closed
  compensation and actionable incomplete-cleanup codes.

## GREEN and verification evidence

Fresh local schema recreation after final migration edits:

```bash
bunx supabase db reset --local
```

Result: exit code 0. All migrations applied through
`20260718180929_add_account_lifecycle_functions.sql`, seed completed, and
containers restarted.

Focused final suites:

```bash
bun test supabase/functions/manage-team-member/index.test.ts
bun run test supabase/tests/account-lifecycle.test.ts
```

Results:

- Edge contracts/handler: `12 pass`, `0 fail`, `63 expect()` calls.
- Lifecycle database: `13 pass`, `0 fail`, `82 expect()` calls.

The database suite covers exhaustive reference counts, last-active count,
browser-RPC denial, destination validation, exact transfer scope, history
preservation, injected transfer rollback, atomic create/update audits,
injected audit rollback, role protections, DB-first status changes, referenced
delete rejection, and target-only snapshot-preserving delete.

Local Edge runtime smoke:

```bash
bunx supabase functions serve manage-team-member
bun supabase/functions/manage-team-member/.local-smoke.ts
```

Result: Manager mutation returned 403. An active Super Admin completed create,
update profile, change role, deactivate, reactivate, and eligible delete. Six
audit rows were observed; both profile and Auth user were absent after delete.
The disposable script and records were removed. Transfer is covered by the
transactional database and pure handler tests rather than this disposable
account smoke.

Full Supabase regression suite:

```bash
bun run test supabase/tests
```

Result: exit code 0, `122 pass`, `0 fail`, `453 expect()` calls across 13
files.

Full repository test suite:

```bash
bun run test
```

Result: exit code 0, `167 pass`, `0 fail`, `616 expect()` calls across 25
files.

Pure Edge TypeScript check:

```bash
bunx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
  --allowImportingTsExtensions --skipLibCheck --strict --types bun \
  supabase/functions/manage-team-member/contracts.ts \
  supabase/functions/manage-team-member/handler.ts \
  supabase/functions/manage-team-member/index.test.ts
```

Result: exit code 0.

Changed-file formatting and lint:

```bash
bunx prettier --check \
  supabase/functions/manage-team-member/contracts.ts \
  supabase/functions/manage-team-member/handler.ts \
  supabase/functions/manage-team-member/index.ts \
  supabase/functions/manage-team-member/index.test.ts \
  supabase/tests/account-lifecycle.test.ts

bunx eslint \
  supabase/functions/manage-team-member/contracts.ts \
  supabase/functions/manage-team-member/handler.ts \
  supabase/functions/manage-team-member/index.ts \
  supabase/functions/manage-team-member/index.test.ts \
  supabase/tests/account-lifecycle.test.ts
```

Result: both exit 0 with no Task 4 findings.

Production build:

```bash
bun run build
```

Result: exit code 0. Client, SSR, and Nitro builds completed. Existing Vite,
Node deprecation, and Nitro configuration warnings remain unrelated to Task 4.

Local schema lint and advisors:

```bash
bunx supabase db lint --local --schema public,private --level warning --fail-on error
bunx supabase db advisors --local --type security --level warn --fail-on none
bunx supabase db advisors --local --type performance --level warn --fail-on none
```

Result: all exit 0. Schema lint reports `No schema errors found`; both advisors
report `No issues found`.

Repository-wide TypeScript check:

```bash
bunx tsc --noEmit
```

Result: exit code 2 with exactly two pre-existing errors outside Task 4:

```text
src/components/commercial/CommercialViews.tsx(383,35): error TS2322
src/components/commercial/CommercialViews.tsx(433,27): error TS2322
```

Both are dynamic route strings incompatible with the generated TanStack route
union. No Task 4 file appears in this output.

Repository-wide ESLint:

```bash
bun run lint
```

Result: exit code 1 with five pre-existing route-hook errors in
`_app.customer-po.$id.tsx`, `_app.prototypes.$id.tsx`,
`_app.quotations.$id.tsx`, `_app.repeat-orders.$id.tsx`, and
`_app.rfq.$id.tsx`, plus thirteen existing warnings. No Task 4 file appears in
the output.

## Five-axis self-review

- **Correctness:** [Pasti] Tests cover every action, protection, transfer
  domain, FK reference path, audit shape, compensation order, and injected
  rollback path specified for Task 4.
- **Readability:** [Pasti] Pure contracts, pure orchestration, Deno adapter,
  private transactional functions, and public service wrappers are separated
  by responsibility. Non-obvious deletion and JWT limitations are documented
  at the boundary.
- **Architecture:** [Pasti] PostgreSQL owns atomic business mutations and
  fresh eligibility checks; the Edge Function owns Auth coordination and caller
  verification; browsers receive neither service credentials nor direct RPC
  execution.
- **Security:** [Pasti] Active-Super-Admin authorization is checked twice,
  request shapes are allowlisted, service functions are inaccessible to
  browser roles, audit is immutable, safe errors suppress raw secrets, and
  local advisors/lint are clean.
- **Performance:** [Pasti] Existing owner indexes plus two added FK indexes
  support reference counts and transfer filters. Profile locks use a stable
  ordering; local performance advisor is clean.

## Concerns

1. [Pasti] Supabase admin sign-out cannot revoke a target user without that
   target's JWT. Deactivation therefore applies a server-side ban after the
   authoritative database status change. An already-issued access JWT remains
   cryptographically valid until expiry (the local config is 3600 seconds),
   although active-profile RLS and the Edge profile check deny application data
   immediately.
2. [Pasti] If Auth deletion fails after an eligible profile deletion commits,
   the remaining Auth-only identity is fail-closed because it has no profile
   and no RLS authority, but server-side remediation is still required. The
   endpoint returns `AUTH_DELETE_INCOMPLETE` with explicit guidance rather than
   claiming success.
3. [Pasti] The full repository TypeScript and ESLint gates remain red only for
   the exact unrelated findings recorded above. Task 4 tests, focused typecheck,
   changed-file lint/format, local schema lint/advisors, runtime smoke, and
   production build are green.

## Fix Wave 1 — Task 4 gate findings

### Status

`DONE_WITH_CONCERNS`

[Pasti] The three Important findings in `.superpowers/sdd/task-4-review.md`
are implemented locally. The original Task 4 migration was not edited. The
new append-only migration was generated by the Supabase CLI:

```text
supabase/migrations/20260718191135_enforce_active_business_owner_invariant.sql
```

Additional files created:

- `supabase/functions/manage-team-member/body-reader.ts`
- `supabase/functions/manage-team-member/body-reader.test.ts`
- `supabase/tests/business-owner-invariant.test.ts`

Additional existing files modified:

- `supabase/functions/manage-team-member/index.ts`
- `supabase/functions/manage-team-member/handler.ts`
- `supabase/functions/manage-team-member/index.test.ts`
- `supabase/tests/super-admin-rls.test.ts`

No Git, hosted Supabase, project link, deployment, Task 5, or progress-ledger
operation was performed.

### RED evidence

Before the adapter implementation, the new body-reader suite failed because
`body-reader.ts` did not exist. The status-order test then failed with the
observed database-RPC-first call order for reactivation.

Before the owner-invariant migration, the service-role regression successfully
inserted an Executive-owned client, and both real two-session races committed:

- owner insert while a profile demotion held the profile row;
- owner reassignment while profile deactivation held the profile row.

Those three tests failed on their expected non-zero/error assertions, proving
that the regression suite detected the reviewed race rather than merely
passing against implementation code.

### Implemented fixes

1. `readBoundedRequestBody()` checks an oversized valid `Content-Length`
   before acquiring a body reader, then consumes `request.body` incrementally,
   counts raw bytes, cancels immediately above 16 KiB, and returns the existing
   safe `REQUEST_TOO_LARGE` error. The pure handler retains its independent
   already-materialized byte limit.
2. Deactivation stays database-first. Reactivation is now Auth-unban-first and
   database-activation-second. Auth failure leaves the profile inactive and
   returns `AUTH_REACTIVATION_INCOMPLETE`; database failure leaves RLS inactive,
   attempts a best-effort re-ban, and returns
   `DATABASE_REACTIVATION_INCOMPLETE`. Repeating an already-completed activation
   remains idempotent through `ACCOUNT_STATUS_UNCHANGED`.
3. The new private `SECURITY DEFINER` trigger function uses an empty
   `search_path`, has no direct execute grant for `anon`, `authenticated`, or
   `service_role`, and locks each candidate profile `FOR SHARE`. Six triggers
   cover `clients.owner_id`, `tasks.owner_id`, `commercial_items.owner_id`,
   `sales_orders.owner_id`, `follow_up_logs.owner_id`, and `targets.sales_id` on
   insert/reassignment. `FOR SHARE` intentionally conflicts with role/status
   updates; `FOR KEY SHARE` would not serialize a non-key demotion.

`activity_log.owner_id` is intentionally excluded: it is immutable historical
attribution, not current operational ownership, and administrative activity
must remain attributable to Executive/Super Admin actors and targets.

### Fresh verification evidence

Focused Edge adapter and orchestration:

```bash
bun test \
  supabase/functions/manage-team-member/body-reader.test.ts \
  supabase/functions/manage-team-member/index.test.ts
```

Result: `14 pass`, `0 fail`, `75 expect()` calls.

Owner invariant, service-role, and concurrency:

```bash
bun --env-file=.env.local test \
  supabase/tests/business-owner-invariant.test.ts
```

Result: `3 pass`, `0 fail`, `18 expect()` calls. Both two-session tests use
independent local `psql` transactions and complete after the deliberate
one-second lock window; no deadlock was observed.

Lifecycle compatibility:

```bash
bun --env-file=.env.local test \
  supabase/tests/account-lifecycle.test.ts \
  supabase/tests/business-owner-invariant.test.ts
```

Result: `16 pass`, `0 fail`, `100 expect()` calls.

The existing four-role matrix needed one fixture correction: when testing an
inactive destination it now creates the control target against the other
still-active Sales/Manager profile. The production expectation is unchanged.
Focused result: `32 pass`, `0 fail`, `174 expect()` calls.

Because Bun 1.3.14 terminates the one-process run after printing all progress
dots when the Docker/psql concurrency file is mixed with every other test
file, the whole repository was verified in two non-overlapping batches:

- all 26 other test files: `169 pass`, `0 fail`, `628 expect()` calls;
- concurrency/invariant file: `3 pass`, `0 fail`, `18 expect()` calls.

Combined evidence: `172 pass`, `0 fail`, `646 expect()` calls across all 27
repository test files. This batching is a runner/process interaction, not a
database deadlock; the concurrency file completes normally alone and with the
lifecycle suite.

Additional gates:

- fresh local reset applied every migration including
  `20260718191135_enforce_active_business_owner_invariant.sql` successfully;
- `bunx supabase db lint --local --level warning`: no schema errors;
- local security and performance advisors: no issues;
- production `bun run build`: exit 0;
- changed-file strict TypeScript, ESLint, and Prettier checks: exit 0;
- catalog posture: one private `SECURITY DEFINER` function with
  `search_path=""`, no direct execute grant for the three API roles, exactly
  six active triggers, and zero currently invalid business owners.

Repository-wide `bunx tsc --noEmit` remains exit 2 with the same two
pre-existing `CommercialViews.tsx` route-union errors at lines 383 and 433.
No Task 4 Fix Wave 1 file appears in that output.

### Residual concerns

1. [Pasti] A failed database activation after a successful Auth unban cannot be
   made atomically cross-system. The profile transaction remains inactive, so
   RLS stays fail-closed; a best-effort re-ban narrows Auth-only exposure.
2. [Pasti] The one-process Bun full-suite reporter/process interaction requires
   the concurrency test to run as its own batch. Both batches independently
   return zero failures and cover every repository test file.
3. [Pasti] The two unrelated TypeScript route errors remain unchanged.
