# Sales Task Control Loop — Task 6 Completion Report

Task: implementation-plan Task 6 / project-tracker Task 51 — "Migrate
domain types and Task adapters to the new contract"
Date: 2026-07-27
Scope: TypeScript domain types and data-layer adapters, plus tests
Remote mutation: none
Depends on: Task 5 / Task 50 (done 2026-07-27)

## Outcome

**`src/lib/domain.ts`** — added `TaskWorkflowStatus`, `TaskDueState`,
`TaskCategory` types and five new `Task` fields: `workflowStatus`,
`dueState`, `calendarIncomplete`, `category`, `nextAction`,
`nextActionDate`, `cancellationReason`. `status`/`TaskStatus` (legacy)
stay as-is, dual-read until Task 16/61. `clientId` stays **required**
(`string`, not `string | undefined`) even though the database column is
nullable now (Task 3/48) — widening it here broke `tsc` in three files
outside Task 6's scope (`TopBar.tsx`, `LogFollowUpDialog.tsx`,
`_app.tasks.tsx`, none in Task 6's file list); making Client genuinely
optional end-to-end is explicitly Task 7/52's job, which owns those files.

**`src/lib/data/tasks.ts`** — `toTask()` now computes `dueState`/
`calendarIncomplete` via the Task 4 TypeScript mirror
(`computeTaskDueState`), fed by one `business_calendar_holidays` fetch
shared across all rows in `listTasks()` (not N+1 calls). `updateTask()`'s
patch type gained `category` (a plain correction field, same tier as
title/priority) but deliberately **not** `workflowStatus`/`nextAction`/
`nextActionDate`/`cancellationReason` — those are progress fields and go
exclusively through the new RPC wrapper, directly satisfying the
acceptance criterion "direct multi-write progress code is no longer
exported for UI use." `createTask()` gained an optional `category` param.

**`src/lib/data/task-progress.ts`** (new) — `recordTaskProgress()` wraps
`public.record_task_progress()` (Task 5) with camelCase in/out types,
and exports `TASK_PROGRESS_INVALIDATION_KEYS`, the exact cache-key list
from spec §7.8, for Task 7/8+ to import rather than each mutation
re-deriving its own list (this codebase has no existing centralized
query-key module — every other query key is an inline array literal in
its component — so this is scoped narrowly to just this RPC's contract,
not a new general pattern).

**`src/lib/data/business-calendar.ts`** — added `todayInJakarta()`
(Asia/Jakarta "today" via `Intl.DateTimeFormat`, independent of the
machine's local timezone). Deliberately not touching
`src/lib/app-time.ts`'s `NOW`/`PINNED_TODAY` — those use local machine
time and are used pervasively for unrelated "today" concerns across
Dashboard/Reports; changing their semantics is out of Task 6's scope.

**`src/lib/data/follow-ups.ts`** — added `'Progress Update'` to the
`FollowUpResult` TS union (mirrors the DB enum value Task 5 added),
needed for `task-progress.ts`'s types to compile.

One scoped implementation decision worth recording: spec §7.1 says
`dueState` should be "dihitung server-side." For Task 6 specifically
(files-likely-touched list is TS-only, no migration), using the
already-proven-identical TypeScript mirror fed by one holiday fetch is
the pragmatic interim choice — a real server-side view/RPC for `dueState`
is more naturally Task 9/10's job, which do carry migration-worthy scope
(Manager Team Exceptions, Executive Exceptions) that needs real row-level
filtering built on due state.

## Test coverage

- `src/lib/data/tasks.test.ts` — new test proves `listTasks()` exposes
  `workflowStatus`/`category`/`dueState`/`calendarIncomplete` as separate
  fields from legacy `status`.
- `src/lib/data/task-progress-adapter.test.ts` (new) — exercises
  `recordTaskProgress()` end-to-end against the real local RPC, proves
  camelCase mapping both directions, proves database validation errors
  pass through unchanged, and asserts the invalidation-key contract.
- `src/lib/data/dashboard-selectors.test.ts` — existing Task 2
  characterization fixtures updated with the new required `Task` fields
  (no assertion changed — those selectors still only read legacy
  `status`, unmigrated until Task 11).

## A real, non-obvious bug found and fixed during verification

Adding `src/lib/data/task-progress.test.ts` made the **full suite**
intermittently fail with `supabase.auth.setSession is not a function` in
that file specifically — but only when run as part of the full 57-file
suite, never in isolation. Bisection ruled out `Bun.SQL` (the atomicity
test's raw Postgres connection, initially suspected and rewritten to shell
out via `docker exec psql` instead) as a red herring. The actual cause:
**`supabase/tests/task-progress.test.ts` (Task 5) and
`src/lib/data/task-progress.test.ts` (Task 6) had the exact same
basename.** `bun test` runs all files in one shared global object unless
given `--isolate`, and two files sharing a basename corrupt each other's
state under that mode — confirmed by renaming the second file to
`task-progress-adapter.test.ts`, which fixed it outright, and separately
confirmed by re-running the unmodified files with `bun test --isolate`
(passed cleanly either way). Kept the `docker exec` version of the
atomicity fault-injection helper since it was already proven working by
the time the real cause was found, rather than reverting to `Bun.SQL`
purely for style and re-testing again.

## Verification actually run

- `bun run test src/lib/data/tasks.test.ts
  src/lib/data/task-progress-adapter.test.ts` (Task 6's specified
  command, adjusted for the renamed file) → **9 pass, 0 fail.**
- `bunx tsc --noEmit` → clean (after fixing real errors: `clientId`
  widening broke 3 out-of-scope files, reverted; a nullable-string
  `toContain()` overload mismatch in a new test).
- Full suite `bun run test`, run **twice** on a fresh `bunx supabase db
  reset` to confirm stability, not a lucky pass → **433 pass, 0 fail
  across 57 files**, both times.
- `git diff --check` — clean.
- `bun run lint` (ESLint, requested separately by the user) — **did not
  complete this session.** Ran to 24 minutes (killed), then 47+ minutes
  with zero output (killed). This is not something these changes caused —
  `tsc --noEmit` and `supabase db lint --local`, the two lint-shaped gates
  actually named in the implementation plan's verification steps, are
  both clean. Whatever makes ESLint this slow on this repo is worth
  investigating separately from Sales Task Control Loop work.
- No `supabase db push` / `apply_migration` / `execute_sql` / remote
  mutation. No non-test source file changed outside the files listed
  above. No `.env.local` change. No new dependency. No commit, push, PR,
  or deployment performed this session.
