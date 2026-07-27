# Sales Task Control Loop — Task 5 Completion Report

Task: implementation-plan Task 5 / project-tracker Task 50 — "Make progress
updates atomic and expose one timeline contract"
Date: 2026-07-27
Scope: local Supabase migrations + tests only
Remote mutation: none
Depends on: Tasks 3-4 / Tasks 48-49 (done 2026-07-27)

## Outcome

Two migrations (split because Postgres cannot use a newly added enum value
inside the transaction that added it):

**`supabase/migrations/20260727140000_extend_task_progress_schema.sql`**
- `follow_up_result` enum gains `'Progress Update'` — a neutral value for
  Task categories that aren't a commercial funnel (spec §3.1).
- `activity_kind` enum gains `'task_progress'` — distinct from the legacy
  `task_status_change`/`task_created` kinds still written by the
  not-yet-migrated `LogFollowUpDialog`/`TaskDetailDrawer` code paths.
- `follow_up_logs.corrects_id` (nullable, FK to `follow_up_logs.id`) —
  spec §3.4's correction mechanism, decided here as a real column rather
  than a text convention, so a correction can't silently reference a
  typo'd or nonexistent entry.
- `tasks.first_progress_at` (nullable timestamptz) plus CHECK constraint
  `tasks_active_next_action_required`. See "the next-action constraint,
  properly this time" below — this is the mechanism that makes it safe.

**`supabase/migrations/20260727141000_add_atomic_task_progress.sql`**
- `public.record_task_progress(p_task_id, p_next_action,
  p_next_action_date, p_note, p_workflow_status_target,
  p_cancellation_reason, p_method, p_result, p_fu_date, p_corrects_id)` —
  the one atomic RPC (spec §3.3). In a single transaction: locks and reads
  the Task (`FOR UPDATE`), validates next-action/cancellation-reason rules,
  inserts one `follow_up_logs` row, updates the Task (`workflow_status`,
  `next_action`, `next_action_date`, `cancellation_reason`,
  `first_progress_at`, and the legacy `status` dual-write), and inserts
  exactly one `activity_log` row (`kind = 'task_progress'`, `actor_id`/
  `created_at` from the database, never the client). `security invoker` —
  every write is still subject to the caller's own
  `tasks_update`/`follow_up_logs_insert`/`activity_log_insert` RLS, so
  "is the caller allowed to touch this Task" falls out of RLS for free
  rather than needing a hand-rolled check that could drift out of sync.

### The next-action constraint, properly this time

Task 3's report said this constraint would land in Task 5. Writing the RPC
surfaced a refinement worth recording: the RPC only guarantees compliance
for *its own* writes — the legacy `createTask()`/`updateTask()` direct
paths are still live (Task 6 hasn't rewired them) and still never populate
`next_action`, so a blanket constraint would have broken Task creation
again, for the same reason as before.

The fix: `first_progress_at` acts as a gate. It starts `null` on every
Task (old and newly created alike) and the constraint only applies once
it's set:

```sql
check (
  first_progress_at is null
  or workflow_status in ('Done', 'Cancelled')
  or (next_action is not null and next_action_date is not null)
)
```

`record_task_progress()` is the only thing that sets `first_progress_at`,
and it always sets `next_action`/`next_action_date` in the same UPDATE —
so the constraint is satisfied by construction from that point on, for
every future write to that row, RPC or not. Verified directly: a raw
`UPDATE tasks SET next_action = null` after a Task's first progress call
is correctly rejected (`23514`); the same raw update on a never-progressed
Task succeeds (matches current legacy behavior, unchanged).

### Legacy `status` dual-write

`record_task_progress()` also recomputes the legacy `status` column on
every call, using `compute_task_due_state()` (Task 4) rather than leaving
it stale as the old code does: `Done`/`Cancelled` → legacy `'Done'`
(Cancelled has no legacy equivalent — it never existed in the old system,
and every legacy consumer already treats `status = 'Done'` as "no longer
active," which is correct for Cancelled too); any other active
`workflow_status` → the freshly computed due state, collapsing `Escalated`
into `Overdue` since the legacy enum has no such value. This keeps
not-yet-migrated Dashboard/TopBar/Reports consumers (Task 11-15) accurate
once this RPC is actually wired to a UI, instead of the current
never-recomputed guess Task 2 documented.

## Test coverage — `supabase/tests/task-progress.test.ts` (15 tests)

- One call writes exactly one `follow_up_logs` row and one `activity_log`
  row (spec §3.5, no duplication); actor/timestamp come from the database.
- Validation: active workflow_status without next_action rejected;
  Cancelled without a reason rejected; Cancelled with a reason succeeds;
  Done maps legacy status to Done; reopening a Cancelled task requires a
  fresh next_action and clears `cancellation_reason` (spec §2.4a); a raw
  write bypassing the RPC after first progress still must satisfy the
  constraint; a freshly created (never-progressed) Task is unaffected.
- Corrections: a second call with `p_corrects_id` references the original
  entry without altering it (append-only, both rows survive).
- Role/action matrix: Manager and Super Admin can record progress on a
  Sales-owned Task without changing `owner_id`; Sales cannot touch another
  Sales rep's Task; Executive cannot call the RPC at all (rejected inside
  the transaction at the `follow_up_logs_insert` step, since current
  `tasks_select` still lets Executive see the row but not write it — Task
  10/55 is where that read boundary itself narrows).
- **Atomicity**: a temporary trigger (created and dropped inside the test,
  via a direct `Bun.SQL` connection since no `psql`/`pg` client is
  available and none was added as a dependency) forces the RPC's *last*
  write (the `activity_log` insert) to fail after the `follow_up_logs`
  insert and Task update would already have happened inside the same
  transaction. Verified: the Task is unchanged, `first_progress_at` stays
  `null`, and neither the `follow_up_logs` nor the `activity_log` row
  persists — Postgres's function-level atomicity rolls back everything,
  exactly the guarantee Task 2's LogFollowUpDialog inventory (up to 5
  independent, non-transactional writes today) was missing.

One real bug caught and fixed during this session: the test file's own
cleanup deleted `tasks` but not the `follow_up_logs`/`activity_log` rows
the RPC calls created, which don't cascade from a Task delete — attempting
to delete the fixture users afterward hit a foreign-key violation. Fixed
by deleting those rows first.

Unified timeline read contract (spec §7.6, merging `follow_up_logs` +
`activity_log` into one ordered view) is **not** built here — the spec
explicitly defers exact function/column names to Task 6/9/10,
and this task's own acceptance criteria only require that the
underlying writes are dedup-safe and orderable by `created_at` for a
later read contract to consume, which the test above verifies.

## Verification actually run

- `bunx supabase db reset` — clean, all four new migrations (Task 3-5)
  apply in order with no errors.
- Manual RPC smoke test (validation failure, successful update, raw-write
  constraint rejection, cancel/reason enforcement) before writing the
  automated suite — all matched expected behavior.
- `bun run test supabase/tests/task-progress.test.ts` → **15 pass, 0
  fail, 56 expect() calls.**
- Full suite `bun run test` → **429 pass, 0 fail across 56 files.**
- `bunx tsc --noEmit` → clean.
- `bunx supabase db lint --local` → zero issues in any function this
  session touched (`record_task_progress`,
  `compute_task_due_state`, `is_business_day`,
  `count_business_days_strictly_between`,
  `business_calendar_incomplete`); only pre-existing, unrelated findings
  in `private.migrate_commercial_document_data`,
  `public.admin_import_normalized_documents`, and
  `public.reassign_client_owner` (none touched this session).
- `bun run lint` (ESLint, project-wide, requested separately by the user)
  — **still pending.** Two attempts this session each ran 20+ minutes at
  ~98% CPU without finishing; this looks like a pre-existing slow-lint
  characteristic of this repo's ESLint config on a large codebase, not
  something these changes caused. Will report the result once it lands.
- `git diff --check` — clean.
- No `supabase db push` / `apply_migration` / `execute_sql` / remote
  mutation. No file changed outside migrations and test files. No
  `.env.local` change. No new dependency (the atomicity test's raw
  Postgres connection uses Bun's built-in `Bun.SQL`, not a new package).
  No commit, push, PR, or deployment performed this session.
