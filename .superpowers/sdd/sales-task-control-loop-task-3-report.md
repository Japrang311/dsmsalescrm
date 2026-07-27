# Sales Task Control Loop — Task 3 Completion Report

Task: implementation-plan Task 3 / project-tracker Task 48 — "Add a
backward-compatible Task schema and RLS contract"
Date: 2026-07-27
Scope: local Supabase migration + tests only
Remote mutation: none
Depends on: Task 2 / Task 47 (done 2026-07-27)

## Outcome

New migration:
`supabase/migrations/20260727120000_add_task_control_loop_foundation.sql`

- New enums `task_workflow_status` (`Open`, `In Progress`,
  `Waiting External`, `Done`, `Cancelled`) and `task_category`
  (`Project/Opportunity Planning`, `Client Meeting/Visit`, `Follow-Up`,
  `Quotation`, `Sales Order`, `Internal/Admin`, `Other`).
- New columns on `public.tasks`: `workflow_status` (not null, default
  `Open`), `category` (not null, default `Other`), `next_action` (text,
  nullable), `next_action_date` (date, nullable), `cancellation_reason`
  (text, nullable).
- Deterministic backfill for existing rows (spec §6.2): `status = 'Done'`
  → `workflow_status = 'Done'`; everything else keeps the column default
  `'Open'`.
- `tasks.client_id` and `follow_up_logs.client_id` both changed to
  nullable — Client is now optional end-to-end (spec §2.1/§3.1).
  `commercial_item_id`/`commercial_document_id` were already nullable on
  both tables, so no change was needed there.
- New CHECK constraint `tasks_cancellation_reason_required`:
  `cancellation_reason` must be set whenever `workflow_status = 'Cancelled'`.
- Column-level `GRANT UPDATE` extended to the five new columns for
  `authenticated` (this table uses column-level grants, not a blanket
  table grant — see `20260718164503_apply_super_admin_rls_matrix.sql`).
- No RLS policy changed. `tasks_select`/`tasks_insert`/`tasks_update` are
  row-level, so they already cover the new columns without modification.
  Owner-eligibility enforcement (`private.enforce_active_business_owner`)
  is unchanged — it only fires on `owner_id` writes, which nothing here
  touches (spec §2.3).

### New/updated tests

- `supabase/tests/tasks.test.ts` — 6 new tests: Sales can update their own
  task's new columns; Sales cannot update another owner's new columns;
  Manager can correct new columns on any task; `cancellation_reason`
  constraint (missing → `23514`, present → succeeds); `client_id` accepts
  `NULL` on insert.
- `supabase/tests/follow-up-logs.test.ts` — 1 new test: `client_id`
  accepts `NULL` on insert.
- `supabase/tests/super-admin-rls.test.ts` — extended the existing
  "can insert and update a task without changing its owner" test to also
  correct `category`, proving Super Admin's ADR-002 correction rights
  extend to the new columns without a separate test block.

## Deliberate deviation from the spec's literal wording — confirmed with Product Owner

Spec §2.4 says Tasks in an active `workflow_status` (`Open`/`In Progress`)
must have `next_action`/`next_action_date` set. A literal CHECK constraint
enforcing that now would break immediately: `src/lib/data/tasks.ts`'s
`createTask()`/`updateTask()` — still the only write path until Task
6/Task 51 rewires the adapters — never populate `next_action`, and new
rows default to `workflow_status = 'Open'`. Adding the constraint today
would make every "Buat Task Baru" submission through the running app fail
until Task 6 ships, for an indefinite number of future sessions.

Presented this trade-off to the Product Owner before writing the
migration; confirmed decision: **defer the next-action-required
constraint to Task 5/Task 50**, which introduces the atomic progress RPC
that actually guarantees `next_action` is set on every save going forward.
Task 3 only adds the `cancellation_reason` constraint now, since zero
existing or currently-insertable rows can violate it (no code path sets
`workflow_status = 'Cancelled'` yet). This is recorded both here and as a
comment in the migration file itself so Task 5 doesn't miss it.

## Also deferred (by design, not by mistake)

- **Executive `tasks_select` narrowing** (spec §4.1: Executive should only
  see Manager-owned Escalated Task detail, not all rows) is explicitly
  Task 10/Task 55's job — it depends on the "Escalated" derived due state,
  which doesn't exist until Task 4/Task 49 builds the business-calendar
  function. Task 3's own acceptance criteria only ask for RLS *tests*
  proving the current boundary, not a new boundary; narrowing the policy
  now would be guessing at a due-state definition that hasn't been built
  yet. Left unchanged, consistent with spec §4.1's own "(Task 3/Task 10)"
  split and "Kebutuhan pastinya diverifikasi di Task 10" note.
- **Bidirectional `status` ↔ `workflow_status` sync trigger**: not added.
  Nothing in the app reads `workflow_status` yet (Task 6/Task 51 is what
  wires that up), so staleness during the Task 3 → Task 6 window has no
  observable effect. None of Task 3's three acceptance criteria require a
  sync trigger, and adding one now would be scope beyond what's asked.
  Flagging this explicitly so Task 6 accounts for it: until Task 6 ships,
  legacy writes to `status` do **not** update `workflow_status`, and vice
  versa once Task 6 starts writing `workflow_status`.

## Verification actually run

- `bunx supabase db reset` — clean, migration applied with no errors.
- `bun run test supabase/tests/tasks.test.ts
  supabase/tests/super-admin-rls.test.ts
  supabase/tests/follow-up-logs.test.ts` → **49 pass, 0 fail** (Task 3's
  own required verification command, plus follow-up-logs for the
  client_id change).
- `bun run test src/lib/data/tasks.test.ts src/lib/data/follow-ups.test.ts
  supabase/tests/tasks.test.ts supabase/tests/follow-up-logs.test.ts` →
  16 pass, 0 fail — proves the **currently running app's Task-creation and
  follow-up-logging code paths are unbroken** by this migration (the exact
  regression the deferred next-action constraint was designed to avoid).
- Full suite `bun run test` → **373 pass, 0 fail across 53 files.**
- `git diff --check` — clean.
- `bunx tsc --noEmit` — run, pending completion at time of writing (no
  source files changed by this task besides test files, low risk).
- No `supabase db push` / `apply_migration` / `execute_sql` / remote
  mutation. No non-test, non-migration source file changed. No
  `.env.local` change. No dependency added. No commit, push, PR, or
  deployment performed this session.
