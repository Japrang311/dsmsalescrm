-- Migration: backfill_task_control_loop
--
-- Task 16 / project-tracker Task 61, part 1 of 2. This is the
-- deterministic reconciliation gate before retiring the legacy tasks.status
-- contract. It does not fabricate any business values: workflow_status was
-- already backfilled in Task 48 (Done -> Done, every other legacy status ->
-- Open), and the compatibility period has since migrated active consumers to
-- workflow_status + derived due state.
--
-- The table is intentionally private and machine-readable. scripts/
-- task-migration-audit.ts reads it after a clean local reset and saves the
-- JSON evidence report used by docs/reports/.

create table if not exists private.task_control_loop_migration_audit (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  task_count bigint not null,
  deterministic_count bigint not null,
  review_required_count bigint not null,
  owner_mismatch_count bigint not null,
  standalone_task_count bigint not null,
  archive_mismatch_count bigint not null,
  timeline_orphan_count bigint not null,
  legacy_status_distribution jsonb not null,
  workflow_status_distribution jsonb not null,
  due_state_distribution jsonb not null,
  review_required_task_ids uuid[] not null,
  unexplained_mismatches jsonb not null,
  passed boolean not null
);

insert into private.task_control_loop_migration_audit (
  task_count,
  deterministic_count,
  review_required_count,
  owner_mismatch_count,
  standalone_task_count,
  archive_mismatch_count,
  timeline_orphan_count,
  legacy_status_distribution,
  workflow_status_distribution,
  due_state_distribution,
  review_required_task_ids,
  unexplained_mismatches,
  passed
)
with task_rows as (
  select
    t.id,
    t.status as legacy_status,
    t.workflow_status,
    t.owner_id,
    t.client_id,
    t.commercial_item_id,
    t.commercial_document_id,
    t.archived,
    ds.due_state
  from public.tasks t
  cross join lateral public.compute_task_due_state(
    t.due_date,
    t.workflow_status
  ) ds
),
timeline_orphans as (
  select count(*)::bigint as count
  from (
    select fl.task_id
    from public.follow_up_logs fl
    where fl.task_id is not null
      and not exists (select 1 from public.tasks t where t.id = fl.task_id)
    union all
    select al.task_id
    from public.activity_log al
    where al.task_id is not null
      and not exists (select 1 from public.tasks t where t.id = al.task_id)
  ) orphaned_task_refs
),
summary as (
  select
    count(*)::bigint as task_count,
    count(*) filter (
      where
        (legacy_status = 'Done' and workflow_status = 'Done')
        or (legacy_status <> 'Done' and workflow_status in (
          'Open', 'In Progress', 'Waiting External', 'Done', 'Cancelled'
        ))
    )::bigint as deterministic_count,
    count(*) filter (
      where
        legacy_status is null
        or workflow_status is null
        or owner_id is null
        or archived is null
    )::bigint as review_required_count,
    count(*) filter (where owner_id is null)::bigint as owner_mismatch_count,
    count(*) filter (where archived is null)::bigint as archive_mismatch_count
  from task_rows
),
standalone_summary as (
  select count(*)::bigint as standalone_task_count
  from task_rows
  where client_id is null
    and commercial_item_id is null
    and commercial_document_id is null
),
legacy_distribution as (
  select coalesce(
    jsonb_object_agg(legacy_status::text, count order by legacy_status::text),
    '{}'::jsonb
  ) as distribution
  from (
    select legacy_status, count(*)::bigint as count
    from task_rows
    group by legacy_status
  ) grouped
),
workflow_distribution as (
  select coalesce(
    jsonb_object_agg(workflow_status::text, count order by workflow_status::text),
    '{}'::jsonb
  ) as distribution
  from (
    select workflow_status, count(*)::bigint as count
    from task_rows
    group by workflow_status
  ) grouped
),
due_distribution as (
  select coalesce(
    jsonb_object_agg(coalesce(due_state, 'Terminal'), count order by coalesce(due_state, 'Terminal')),
    '{}'::jsonb
  ) as distribution
  from (
    select due_state, count(*)::bigint as count
    from task_rows
    group by due_state
  ) grouped
),
review_ids as (
  select coalesce(array_agg(id order by id), array[]::uuid[]) as ids
  from task_rows
  where legacy_status is null
     or workflow_status is null
     or owner_id is null
     or archived is null
),
mismatches as (
  select jsonb_strip_nulls(jsonb_build_object(
    'review_required_task_ids', to_jsonb(review_ids.ids),
    'timeline_orphan_count', timeline_orphans.count
  )) as value
  from review_ids
  cross join timeline_orphans
)
select
  summary.task_count,
  summary.deterministic_count,
  summary.review_required_count,
  summary.owner_mismatch_count,
  standalone_summary.standalone_task_count,
  summary.archive_mismatch_count,
  timeline_orphans.count,
  legacy_distribution.distribution,
  workflow_distribution.distribution,
  due_distribution.distribution,
  review_ids.ids,
  mismatches.value,
  summary.task_count = summary.deterministic_count
    and summary.review_required_count = 0
    and summary.owner_mismatch_count = 0
    and summary.archive_mismatch_count = 0
    and timeline_orphans.count = 0
from summary
cross join standalone_summary
cross join legacy_distribution
cross join workflow_distribution
cross join due_distribution
cross join review_ids
cross join timeline_orphans
cross join mismatches;
