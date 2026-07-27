# Sales Task Control Loop — Task 2 Completion Report

Task: implementation-plan Task 2 / project-tracker Task 47 — "Lock legacy
behavior with characterization tests"
Date: 2026-07-27
Scope: local application source (test files only) and local Supabase
Remote mutation: none
Depends on: Task 1 / Task 46 (spec approved 2026-07-27)

## Outcome

No schema, RLS, migration, or non-test source code changed. Two existing test
files gained characterization coverage; the rest of the required coverage
(four-role RLS on Task/follow-up/Activity Log reads and writes) already
existed and was verified against a clean local reset.

### New characterization tests

- `src/lib/data/tasks.test.ts` — `createTask() defaults status to Upcoming
  even when dueDate is already in the past (status is not date-derived)`.
  Locks in that `TaskStatus` (`src/lib/domain.ts:162`,
  `"Today" | "Overdue" | "Upcoming" | "Done"`) is a single stored enum
  conflating workflow state (`Done`) with due-date proximity
  (`Today`/`Overdue`/`Upcoming`), and that `createTask()`
  (`src/lib/data/tasks.ts:110`) always defaults it to `"Upcoming"`
  regardless of `dueDate` — nothing recomputes it later.
- `src/lib/data/dashboard-selectors.test.ts` — two tests proving
  `taskCounts()` and `todaysFollowUps()` bucket purely by the stored
  `status` string and never look at `dueDate`. A task with `dueDate:
  "2020-01-01"` and `status: "Upcoming"` is reported as upcoming, not
  overdue, by both selectors today.

Both files' existing tests were read first; no existing assertion was
changed, only new `test()`/`describe()` blocks were added.

## Current-State Inventory

### 1. Four-role RLS/data coverage — already exists, verified passing

| Table | Sales | Manager | Executive | Super Admin | File |
|---|---|---|---|---|---|
| `tasks` | own-only SELECT, own-only UPDATE | all-rows SELECT/UPDATE | all-rows SELECT, no UPDATE | correction rights (no ownership) | `supabase/tests/tasks.test.ts`, `supabase/tests/super-admin-rls.test.ts` |
| `follow_up_logs` | own-only SELECT/INSERT, append-only | all-rows SELECT/INSERT, append-only | all-rows SELECT, no INSERT | correction rights, append-only | `supabase/tests/follow-up-logs.test.ts`, `supabase/tests/super-admin-rls.test.ts` |
| `activity_log` | own-only SELECT, own-owner INSERT | all-rows SELECT, any-owner INSERT | all-rows SELECT, no INSERT | administrative event kinds + reason enforcement | `supabase/tests/activity-log.test.ts` |

Confirmed (again, current-state audit already flagged this in the approved
spec §1.8 as conflict C4): **Executive currently gets all-row SELECT on
`tasks`, `follow_up_logs`, and `activity_log`** — broader than the target
model's "Executive sees only Manager-owned Escalated Task detail." This is a
Task 3 RLS-tightening item, not a Task 2 item; captured here for traceability.

Verification run against a clean `bunx supabase db reset`:
`bun run test supabase/tests/tasks.test.ts supabase/tests/follow-up-logs.test.ts
supabase/tests/super-admin-rls.test.ts supabase/tests/activity-log.test.ts`
→ **56 pass, 0 fail** (5 + 5 + 46 across the two combined runs below).

No new tests were added to these four files — the acceptance criterion
("tests cover all four roles for Task, follow-up, and Activity Log reads and
writes") is already satisfied by the existing suite in aggregate.

### 2. KPIs/lists that treat due state as stored `status`, not a derived value

Every one of these reads `task.status === "Today" | "Overdue" | "Upcoming"`
directly. None of them look at `dueDate`. This is the exact set Task 4 must
migrate to the new derived due-state contract.

| Consumer | Location |
|---|---|
| `taskCounts()` | `src/lib/data/dashboard-selectors.ts:444-451` |
| `todaysFollowUps()` | `src/lib/data/dashboard-selectors.ts:466-487` |
| `salesPerformance()` (per-member overdue count) | `src/lib/data/dashboard-selectors.ts:395` |
| `dashboardSalesTeam()` (per-member overdue count) | `src/lib/data/dashboard-selectors.ts:510` |
| `riskAlerts()` | `src/lib/data/dashboard-selectors.ts:656` |
| Reports overdue count | `src/routes/_app.reports.tsx:307` |
| Client Detail task badges/sort | `src/routes/_app.clients.$clientId.tsx:141, 492, 505, 551-553` |
| TopBar "Today/Overdue" widget | `src/components/shell/TopBar.tsx:204-256` |
| Dashboard `TodaysFollowUpList` | `src/components/dashboard/TodaysFollowUpList.tsx:62` |

Separately, `src/routes/_app.tasks.tsx` (the Tasks inbox itself) does **not**
read stored `status` for bucketing — it computes its own client-side
`bucketFor()` (`src/routes/_app.tasks.tsx:156-165`) from `dueDate` using
plain calendar-day math (`startOfDay`, no business-day/holiday awareness).
**This means the Tasks inbox page and every selector above can already
disagree with each other today** for the same task — the inbox shows one
due bucket, Dashboard/Reports/TopBar show another, because they use two
unrelated sources for what should be one due state. This is itself a
pre-existing inconsistency, not something Task 2 introduces or should fix;
it is additional evidence for why Task 4's single derived due-state
algorithm is needed.

### 3. Client-side `setDate()` calendar-day arithmetic (Task 4 scope)

None of these are business-day or holiday aware; all will be replaced by the
Task 4 database-derived calendar:

- `src/routes/_app.tasks.tsx:392, 486, 624, 1423, 1427`
- `src/routes/_app.pipeline.tsx:74`
- `src/routes/_app.activity.tsx:206, 217`
- `src/components/tasks/TaskDetailDrawer.tsx:202`
- `src/components/tasks/LogFollowUpDialog.tsx:457`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx:366`

### 4. Independent progress-write inventory (Task 5 scope)

`src/components/tasks/LogFollowUpDialog.tsx` `onSubmit` (lines 172-247)
performs up to **5 independent, non-transactional Supabase calls** per
submission, in this order:

1. `logFollowUp(...)` → INSERT `follow_up_logs` (line 174). Always runs.
2. `updateTask(task.id, { status: "Done" })` → UPDATE `tasks` (line 192).
   Only if `markDone` is checked.
3. `logActivity({ kind: "task_status_change", ... })` → INSERT
   `activity_log` (line 194). Only if `markDone` **and** an actor id was
   resolved.
4. `createTask(...)` → INSERT `tasks` (line 206). Only if `createNextTask`
   is checked **and** a next follow-up date was entered.
5. `logActivity({ kind: "task_created", ... })` → INSERT `activity_log`
   (line 219). Only if step 4 ran **and** an actor id was resolved.

None of these are wrapped in a transaction or RPC. The whole sequence is
guarded by one `try`/`catch` that only shows a toast on the *first* thrown
error — it does not roll back any write that already succeeded.

Failure scenarios Task 5's atomicity test must first reproduce as a failing
("red") test, then fix:

- **Step 1 succeeds, step 2 throws** (e.g. RLS rejects the `tasks` UPDATE
  because ownership changed mid-session): a `follow_up_logs` row is
  permanently persisted describing a "Done" outcome, but the `tasks` row
  still shows its old status — the timeline and the task disagree forever
  unless a human notices and manually corrects it.
- **Steps 1-2 succeed, step 3 throws** (e.g. `getCurrentActorId()` briefly
  fails or `activity_log` RLS rejects the insert): the task is marked Done
  with no audit trail explaining who did it or why.
- **Steps 1-3 succeed, step 4 throws** (e.g. the next task's client/owner
  constraint fails): the user believes a follow-up task was scheduled
  because the dialog told them so via `createNextTask`, but no such task
  exists — a silently dropped next action.
- **Steps 1-4 succeed, step 5 throws**: the new task exists but has no
  `task_created` audit entry.
- **Any step succeeds while the browser tab closes/network drops between
  calls**: same partial-write outcomes as above, non-deterministically.

This inventory is documentation only, per Task 2's acceptance criteria
("...are documented but are not left as permanent failures in the Task 2
test suite"). No failing/red test was added to the suite for these
scenarios — that is explicitly Task 5's job once the atomic RPC contract
(spec §3) exists to test against.

## Pre-existing issue found during verification — root-caused and fixed

Running the full `src/lib/data/*.test.ts` suite against the freshly reset
local stack, every test in that directory that authenticates via
`src/lib/supabase.ts`'s shared client + `supabase.auth.setSession(...)`
initially failed with `permission denied for table <x>` at the
Postgres/PostgREST layer, reporting the connecting role as `anon` rather
than `authenticated`. This reproduced identically on files untouched by
this session (`src/lib/data/clients.test.ts`,
`src/lib/data/follow-ups.test.ts`) and on the three pre-existing tests in
`src/lib/data/tasks.test.ts` — confirming it was a pre-existing
local-environment condition, not something introduced by this session's new
characterization tests.

**Root cause:** `.env.local`'s `VITE_SUPABASE_URL` was pointed at a remote
Supabase project (`https://qhtfixgbcpcitokeryxb.supabase.co`) instead of
the local Docker stack (`http://127.0.0.1:54321`). `src/lib/supabase.ts`
(the app's shared client, used by every `src/lib/data/*.ts` module) reads
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from there, so it was
authenticating against the wrong project entirely — the local fixture
users created by the tests don't exist there, `setSession()` failed
(`bad_jwt: unrecognized JWT kid ... for algorithm ES256`, since the two
projects sign JWTs differently), and the client silently fell back to the
unauthenticated `anon` role. `supabase/tests/*.test.ts` was unaffected
because it hardcodes `127.0.0.1:54321` independently of `.env.local`
(`supabase/tests/helpers.ts`) and was always correctly hitting local.

Diagnosed with a temporary debug script (not committed) that reproduced the
`setSession()` call and printed the resulting auth error and env values;
confirmed with the Product Owner that this was a misconfiguration (not an
intentional second environment); the user corrected
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in `.env.local` to the local
values by hand (this session's tools are permission-denied from reading or
editing `.env.local`).

**Verified fixed:** `bun run test src/lib/data/` → 54 pass, 0 fail across
18 files. Full suite `bun run test` → **367 pass, 0 fail across 53 files.**

## Verification actually run

- `bunx supabase start` (local containers were stopped/exited from a prior
  session; restarted cleanly, no data loss — local dev volume only).
- `bunx supabase db reset` — clean, all migrations applied, seed loaded.
- `bun run test src/lib/data/dashboard-selectors.test.ts` → 8 pass, 0 fail
  (includes the 2 new characterization tests).
- `bun run test supabase/tests/tasks.test.ts
  supabase/tests/follow-up-logs.test.ts src/lib/data/tasks.test.ts
  src/lib/data/dashboard-selectors.test.ts` → 18 pass, 5 fail (all 5
  failures are the pre-existing `src/lib/data/tasks.test.ts` environment
  issue above, including 3 tests this session did not write).
- `bun run test supabase/tests/super-admin-rls.test.ts
  supabase/tests/activity-log.test.ts` → 46 pass, 0 fail.
- `git diff --check` — clean.
- No migration created or applied beyond the existing committed set. No
  `supabase db push` / `apply_migration` / `execute_sql` / remote mutation.
  No non-test source file changed. No `.env.local` change. No dependency
  added. No commit, push, PR, or deployment performed this session.
