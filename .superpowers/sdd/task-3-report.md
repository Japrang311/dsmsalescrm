# Task 3 Implementation Report

## Status

`DONE_WITH_CONCERNS`

[Pasti] Task 3 is implemented and locally verified. The only failing gate is
the project-wide TypeScript check, which stops on two pre-existing TanStack
route-type errors in `src/components/commercial/CommercialViews.tsx` outside
Task 3. No remote Supabase command, project link, bootstrap, deploy, Git
operation, commit, push, or remote user mutation was run.

## Exact files changed or created

Created through Supabase CLI 2.109.1:

- `supabase/migrations/20260718173152_add_team_admin_activity_kinds.sql`
- `supabase/migrations/20260718173153_add_team_admin_audit_fields.sql`

Created:

- `src/lib/data/activity-log.test.ts`
- `.superpowers/sdd/task-3-report.md`

Modified:

- `supabase/tests/activity-log.test.ts`
- `src/lib/data/activity-log.ts`
- `src/routes/_app.activity.tsx`

The migration filenames were generated locally with:

```bash
bunx supabase migration new add_team_admin_activity_kinds
bunx supabase migration new add_team_admin_audit_fields
```

No prior migration was rewritten. The enum values are isolated in the first
migration so the second transaction can safely reference them in constraints.

## RED evidence

### Database contract RED

The schema/immutability tests were written before either migration and run
against the prior local schema:

```bash
bun run test supabase/tests/activity-log.test.ts
```

Result: expected RED, exit code 1, `6 pass`, `4 fail`, `21 expect()` calls.
The positive insert and persistence tests failed because PostgREST returned
`PGRST204` for the missing `administrative_reason` column. The reason and safe
snapshot tests expected the named database constraint error `23514` but also
received `PGRST204`. This proved the database fields and constraints were not
present rather than silently accepting the desired contract.

### Data/display mapper RED

After the database contract was GREEN, the mapper test was written before the
data-layer implementation:

```bash
bun run test src/lib/data/activity-log.test.ts
```

Result: expected RED, exit code 1, `0 pass`, `1 fail`, `2 expect()` calls.
The first administrative row expected label `Anggota Tim Dibuat` but received
`undefined`, proving the new display mapping did not yet exist.

### Four-role snapshot hardening RED

Self-review found that the first safe-key constraint still accepted any string
as a snapshot role. A new regression test was added before tightening the
constraint:

```bash
bun run test supabase/tests/activity-log.test.ts
```

Result: expected RED, exit code 1, `10 pass`, `1 fail`, `82 expect()` calls.
The invalid snapshot role `administrator` was accepted, so the test expected
`23514` and received no error. The migration was then tightened to the exact
four-role set.

## Implementation

- Added all seven administrative event kinds in a dedicated enum-only
  migration boundary while preserving the eight existing event values.
- Added nullable `target_profile_id`, `target_profile_snapshot`, and
  `administrative_reason` columns.
- Added the target-profile foreign key with `ON DELETE SET NULL` plus a partial
  btree index for target deletion/lookups. No unneeded JSONB GIN index was
  added because no current query filters by snapshot content.
- Added a positive snapshot allowlist: only top-level `name`, `email`, and
  `role` keys are permitted; each value must be scalar text; unknown/secret
  keys are rejected; and `role`, when present, must be exactly `sales`,
  `manager`, `executive`, or `super_admin`.
- Added a named database check requiring a non-null, non-whitespace
  `administrative_reason` for every one of the seven administrative kinds.
- Preserved Task 2's insert boundary: authenticated callers retain only the
  existing business-event column grants. They cannot insert the new admin
  fields directly; `service_role` retains server-side insert authority for the
  protected lifecycle path in Task 4.
- Preserved actor binding and active Sales-or-Manager ownership validation in
  the existing insert policy. No update/delete policy or grant was added.
- Extended Activity Log data types and the row mapper with target ID, safe
  target snapshot, administrative reason, and Indonesian labels for all seven
  administrative kinds while retaining existing kinds.
- Extended the Activity Log route with a separate administrative feed kind.
  Actor is resolved only from `actorId`; target is resolved from
  `targetProfileId` and falls back to the safe snapshot after target deletion.
  List, detail sheet, related events, search, and export use the new Indonesian
  labels. Actor and target are rendered separately, and the target snapshot is
  never reused as actor attribution.
- Did not implement lifecycle Edge Function actions, Team & Role Settings UI,
  session/account-status UI, owner selectors, or any Task 4+ behavior.

## GREEN and verification evidence

Final local schema recreation:

```bash
bunx supabase db reset --local
```

Result: exit code 0. Both Task 3 migrations applied in order, the ordinary
local seed completed, containers restarted, and no remote target was used.

Final focused database suite:

```bash
bun run test supabase/tests/activity-log.test.ts
```

Result: exit code 0, `11 pass`, `0 fail`, `83 expect()` calls. It proves all
seven kinds, non-empty reasons, safe-key rejection, four-role snapshot role
validation, target snapshot persistence through eligible target deletion, and
four-role update/delete denial.

Final Activity Log data mapper test:

```bash
bun run test src/lib/data/activity-log.test.ts
```

Result: exit code 0, `1 pass`, `0 fail`, `36 expect()` calls.

Final full Supabase regression suite:

```bash
bun run test supabase/tests
```

Result: exit code 0, `108 pass`, `0 fail`, `369 expect()` calls across 12
files.

Final focused data-layer suite:

```bash
bun run test src/lib/data
```

Result: exit code 0, `20 pass`, `0 fail`, `84 expect()` calls across 8 files.

Changed-file formatting and lint:

```bash
bunx prettier --write supabase/tests/activity-log.test.ts src/lib/data/activity-log.test.ts src/lib/data/activity-log.ts src/routes/_app.activity.tsx
bunx eslint supabase/tests/activity-log.test.ts src/lib/data/activity-log.test.ts src/lib/data/activity-log.ts src/routes/_app.activity.tsx
```

Result: Prettier completed and ESLint exited 0 with no findings.

Production build:

```bash
bun run build
```

Result: exit code 0. Client, SSR, and Nitro production builds completed. The
build emitted existing deprecation/config warnings for `module.register()`,
`vite-tsconfig-paths`, and Nitro `inlineDynamicImports`; none originated in
Task 3.

Project-wide typecheck:

```bash
bunx tsc --noEmit
```

Result: exit code 2 with exactly two findings, both outside Task 3:

```text
src/components/commercial/CommercialViews.tsx(383,35): error TS2322: Type '`${string}/${string}`' is not assignable to the generated route union.
src/components/commercial/CommercialViews.tsx(433,27): error TS2322: Type '`${string}/${string}`' is not assignable to the generated route union.
```

No Task 3 file appeared in TypeScript output. These errors were preserved and
not fixed because the task explicitly forbids unrelated scope expansion.

Local schema lint and advisors:

```bash
bunx supabase db lint --local --schema public,private --level warning --fail-on none
bunx supabase db advisors --local --type security --level warn --fail-on none
bunx supabase db advisors --local --type performance --level warn --fail-on none
```

Result: all three exited 0. Schema lint reported `No schema errors found`;
both advisors reported `No issues found`.

## Policy, grant, constraint, and index inventory

Fresh local catalog inspection confirmed:

- Exactly 7 `team_member_%` enum values exist; all 8 prior values remain.
- All 3 Task 3 columns exist with their requested nullable types.
- `activity_log_target_profile_id_fkey` is `ON DELETE SET NULL`.
- Both named checks exist: `activity_log_target_profile_snapshot_safe` and
  `activity_log_administrative_reason_required`.
- `activity_log_target_profile_id_idx` is a partial btree index for non-null
  target IDs; no snapshot GIN index exists because no query requires it.
- Activity Log has 0 UPDATE/DELETE/ALL policies.
- `authenticated` has no Activity Log table-level INSERT, UPDATE, or DELETE;
  it retains INSERT on the existing `kind` column but not on
  `administrative_reason` or the other new admin columns.
- `service_role` retains Activity Log table INSERT.
- The INSERT policy still binds `actor_id = auth.uid()`, validates the private
  active Sales-or-Manager owner predicate, and allows active Sales-own,
  Manager, or Super Admin inserts.
- The SELECT policy remains active-aware: Sales-own or company-wide
  Manager/Executive/Super Admin.

## Five-axis self-review

- **Correctness:** [Pasti] Tests exercise all seven event kinds, all three
  missing/blank reason variants, five unsafe keys, invalid role values,
  post-delete snapshot persistence, and update/delete attempts by all four
  roles. Existing event and RLS behavior passes the full suite.
- **Readability:** [Pasti] Enum extension, field/constraint migration, data
  mapping, and display mapping remain separated by layer. Constraint and grant
  intent is documented next to the non-obvious boundary.
- **Architecture:** [Pasti] PostgreSQL remains the validation/immutability
  boundary. No lifecycle orchestration or Settings UI was pulled forward from
  Tasks 4–6.
- **Security:** [Pasti] Snapshot keys use an allowlist rather than only a
  denylist; nested JSON values and unknown roles are rejected; reasons are
  enforced at the database; browser callers cannot supply server-owned admin
  fields; no secret or remote credential was added.
- **Performance:** [Pasti] Target FK lookup has a focused partial btree index;
  no speculative JSONB GIN index or additional query was introduced; the local
  performance advisor is clean.

## Concerns

1. [Pasti] `bunx tsc --noEmit` is not globally green because of the two exact
   pre-existing `CommercialViews.tsx` route-type errors recorded above. The
   production build and every Task 3 changed-file lint/test gate pass.
2. [Pasti] No browser lifecycle flow was tested in Task 3 because Task 4's
   lifecycle writer and Task 5's Team & Role UI are intentionally not yet
   implemented. The route's data/display contract is covered by integration
   tests and the production build.

## One-line verification

`DONE_WITH_CONCERNS — Supabase 108/108; data 20/20; build/lint/schema/advisors GREEN; typecheck blocked only by two pre-existing CommercialViews.tsx errors.`

## Fix wave 1

`DONE_WITH_CONCERNS`

[Pasti] The Task 3 review's Important route-search defect and Minor
authenticated-column coverage gap are fixed without a migration, policy, grant,
or Task 4/5 change. No remote Supabase command, project link, deploy, Git
operation, commit, push, or remote user mutation was run.

### Scope and implementation

- Added the pure `matchesActivitySearch` helper in
  `src/lib/data/activity-search.ts`. Its haystack preserves every existing
  search field (title, detail, administrative reason, client, owner, actor,
  and target), and now also includes the effective display label:
  `event.kindLabel ?? fallbackKindLabel`.
- Wired `_app.activity.tsx` to that helper, passing the feed event's existing
  `kindLabel` and its `KIND_META` label as the fallback. Therefore a real
  `team_member_created` row titled `team_member_created` is found by
  `Anggota Tim Dibuat`, while mock-feed entries retain their prior category
  fallback label.
- Added the focused regression test
  `src/lib/data/activity-search.test.ts`, which proves the exact Indonesian
  label finds a technical-title `team_member_created` event.
- Added a direct local Data API negative test in
  `supabase/tests/activity-log.test.ts`: an authenticated Sales client submits
  `team_member_created` with all three protected administrative fields and is
  rejected with PostgreSQL privilege error `42501`. The existing service-role
  administrative success test remains green. No migration was warranted: the
  local schema already enforces the intended protected-column boundary.

### Fresh RED/GREEN evidence

The new pure search regression was written first:

```bash
bun run test src/lib/data/activity-search.test.ts
```

RED: the initial minimal helper returned `false`, so the desired Indonesian
label assertion expected `true` and received `false` (exit code 1, 0 pass / 1
fail). GREEN after the minimal haystack implementation: exit code 0, 1 pass / 0
fail.

The new Data API negative test is coverage for an already-correct SQL boundary,
not a schema defect; it was green immediately and returned the expected
privilege denial. Its focused suite result was:

```bash
bun run test src/lib/data/activity-search.test.ts supabase/tests/activity-log.test.ts
```

Result: exit code 0, 13 pass / 0 fail, 86 assertions. This includes all four
website roles' immutable update/delete coverage and the new authenticated Sales
administrative-column rejection.

### Fresh regression and quality gates

```bash
bun run test supabase/tests
```

Result: exit code 0, 109 pass / 0 fail, 371 assertions across 12 files.

```bash
bun run test src/lib/data
```

Result: exit code 0, 21 pass / 0 fail, 85 assertions across 9 files.

```bash
bunx prettier --write src/lib/data/activity-search.ts src/lib/data/activity-search.test.ts src/routes/_app.activity.tsx supabase/tests/activity-log.test.ts
bunx eslint src/lib/data/activity-search.ts src/lib/data/activity-search.test.ts src/routes/_app.activity.tsx supabase/tests/activity-log.test.ts
```

Result: all four files were already formatted; ESLint exited 0 with no
findings.

```bash
bun run build
```

Result: exit code 0. The known build-time deprecation/config warnings for
`module.register()`, `vite-tsconfig-paths`, and Nitro
`inlineDynamicImports` remain non-blocking and are unrelated to this fix.

```bash
bunx tsc --noEmit
```

Result: exit code 2 with the same two pre-existing route-type errors, and no
Task 3 file in the output:

```text
src/components/commercial/CommercialViews.tsx(383,35): error TS2322: Type '`${string}/${string}`' is not assignable to the generated route union.
src/components/commercial/CommercialViews.tsx(433,27): error TS2322: Type '`${string}/${string}`' is not assignable to the generated route union.
```

### Remaining concern

[Pasti] Project-wide TypeScript remains non-green solely because of the two
unchanged `CommercialViews.tsx` errors above. They are outside Task 3 and were
intentionally not modified. No Task 4/5 lifecycle, Team & Role UI, session,
ownership-selector, migration, or policy behavior was added.
