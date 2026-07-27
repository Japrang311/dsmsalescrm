-- Migration: add_task_control_loop_foundation
--
-- Sales Task Control Loop implementation-plan Task 3 / project-tracker
-- Task 48. Adds the approved backward-compatible schema foundation:
-- workflow_status, category, next_action, next_action_date, and
-- cancellation_reason on tasks, plus nullable client_id end-to-end on
-- tasks and follow_up_logs. The legacy `status` column and enum are left
-- untouched for dual-read migration -- they are retired only in Task
-- 16/61, after every consumer in the current-state audit
-- (docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md
-- §1.7) has migrated off them.
--
-- See spec §2 (target domain model) and §6 (existing-data migration) for
-- the approved contract. One deliberate deviation from spec §2.4's literal
-- wording, confirmed with the Product Owner before writing this migration:
-- the "next action required for active Tasks" CHECK constraint is NOT
-- added here. src/lib/data/tasks.ts's createTask()/updateTask() (Task 6)
-- do not populate next_action yet, so enforcing that rule now would break
-- every Task creation in the running app until Task 6 ships. That
-- constraint is deferred to Task 5/Task 50, which introduces the atomic
-- progress RPC that actually guarantees next_action is set going forward.

create type public.task_workflow_status as enum (
  'Open', 'In Progress', 'Waiting External', 'Done', 'Cancelled'
);

create type public.task_category as enum (
  'Project/Opportunity Planning', 'Client Meeting/Visit', 'Follow-Up',
  'Quotation', 'Sales Order', 'Internal/Admin', 'Other'
);

alter table public.tasks
  add column workflow_status public.task_workflow_status not null default 'Open',
  add column category public.task_category not null default 'Other',
  add column next_action text,
  add column next_action_date date,
  add column cancellation_reason text;

-- Deterministic backfill (spec §6.2): Done -> Done, everything else ->
-- Open (the column default already applied to every existing row). No
-- existing row can be deterministically mapped to In Progress, Waiting
-- External, or Cancelled -- those values never existed in the legacy
-- system, so guessing one would fabricate history that isn't there.
update public.tasks set workflow_status = 'Done' where status = 'Done';

-- Client becomes optional end-to-end (spec §2.1, §3.1). Existing rows keep
-- whatever client_id they already have; only new Tasks/follow-ups may omit
-- it going forward. commercial_item_id/commercial_document_id are already
-- nullable on both tables, so this is the only relation that needed
-- changing.
alter table public.tasks alter column client_id drop not null;
alter table public.follow_up_logs alter column client_id drop not null;

-- Cancellation reason is required whenever a Task is Cancelled (spec
-- §2.1). No existing row has workflow_status = 'Cancelled' (spec §6.2), so
-- this validates immediately with no backward-compatibility gap -- unlike
-- the next-action rule above, there is no live code path this could break.
alter table public.tasks
  add constraint tasks_cancellation_reason_required
  check (
    workflow_status <> 'Cancelled' or cancellation_reason is not null
  );

-- New columns are correction-style fields, same treatment as the existing
-- non-owner Task columns already grantable to authenticated (see
-- 20260718164503_apply_super_admin_rls_matrix.sql). Row-level security
-- (tasks_select/insert/update) already covers these columns because RLS
-- policies apply to the whole row, not per-column -- only the
-- column-level UPDATE grant needs extending. Owner eligibility
-- (private.enforce_active_business_owner) and Sales/Manager/Super Admin
-- RLS boundaries are unchanged, per spec §2.3 and §4.1.
grant update (
  workflow_status,
  category,
  next_action,
  next_action_date,
  cancellation_reason
) on table public.tasks to authenticated;
