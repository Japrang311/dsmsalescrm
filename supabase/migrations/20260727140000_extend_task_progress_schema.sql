-- Migration: extend_task_progress_schema
--
-- Sales Task Control Loop implementation-plan Task 5 / project-tracker
-- Task 50, part 1 of 2. Adds the schema the atomic progress RPC (next
-- migration) needs. Split into its own migration/transaction because
-- Postgres cannot use a newly added enum value inside the same
-- transaction that added it -- the RPC's default parameter references
-- 'Progress Update', so the enum value must already be committed first.
--
-- See docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md
-- §3 (timeline and atomic progress) and §3.4 (immutability/correction).

-- A neutral progress value so non-commercial Task categories
-- (Internal/Admin, Project/Opportunity Planning, etc.) aren't forced into
-- a quotation-funnel-shaped result (spec §3.1).
alter type public.follow_up_result add value if not exists 'Progress Update';

-- Distinct from the legacy 'task_status_change'/'task_created' kinds
-- (still written by the not-yet-migrated LogFollowUpDialog/TaskDetailDrawer
-- code paths) so RPC-driven audit events are identifiable during the
-- transition (spec §3.2).
alter type public.activity_kind add value if not exists 'task_progress';

-- Structured correction reference (spec §3.4 -- "kolom corrects_id baru vs
-- konvensi teks", decided here: a real FK column over a text convention,
-- so a correction can't silently point at a typo'd/nonexistent entry).
alter table public.follow_up_logs
  add column corrects_id uuid references public.follow_up_logs (id);

-- Tracks whether a Task has ever had a progress update recorded through
-- the atomic RPC. This is what makes the next-action-required rule
-- (spec §2.4) safe to enforce as a real CHECK constraint without breaking
-- the still-live legacy createTask()/updateTask() flow (Task 6 has not
-- rewired them yet): a freshly created row has first_progress_at = null,
-- so the constraint below does not apply to it. The constraint only
-- starts applying to a given row once record_task_progress() sets this
-- column -- and that same call is what guarantees next_action/
-- next_action_date are populated, so the constraint is satisfied by
-- construction from that point on.
alter table public.tasks
  add column first_progress_at timestamptz;

alter table public.tasks
  add constraint tasks_active_next_action_required
  check (
    first_progress_at is null
    or workflow_status in ('Done', 'Cancelled')
    or (next_action is not null and next_action_date is not null)
  );

grant update (first_progress_at) on table public.tasks to authenticated;
