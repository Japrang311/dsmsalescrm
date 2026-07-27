-- Migration: retire_legacy_task_status
--
-- Task 16 / project-tracker Task 61, part 2 of 2. Retires the old
-- due-state-shaped tasks.status column and public.task_status enum after
-- Tasks 11-15 migrated active consumers to workflow_status + derived
-- due_state. Rollback companion guidance is documented in
-- docs/reports/sales-task-control-loop-migration.md.

create or replace function public.record_task_progress(
  p_task_id uuid,
  p_next_action text,
  p_next_action_date date,
  p_note text default null,
  p_workflow_status_target public.task_workflow_status default null,
  p_cancellation_reason text default null,
  p_method public.task_method default 'Phone',
  p_result public.follow_up_result default 'Progress Update',
  p_fu_date date default null,
  p_corrects_id uuid default null
)
returns table (
  task_id uuid,
  follow_up_log_id uuid,
  activity_log_id uuid,
  workflow_status public.task_workflow_status,
  due_state text,
  calendar_incomplete boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task record;
  v_target_status public.task_workflow_status;
  v_actor_id uuid := (select auth.uid());
  v_fu_date date := coalesce(p_fu_date, (now() at time zone 'Asia/Jakarta')::date);
  v_follow_up_log_id uuid;
  v_activity_log_id uuid;
  v_due_state text;
  v_calendar_incomplete boolean;
  v_title text;
begin
  select t.owner_id, t.client_id, t.commercial_item_id, t.commercial_document_id,
         t.due_date, t.workflow_status
  into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'Task % not found or not accessible', p_task_id
      using errcode = 'P0002';
  end if;

  v_target_status := coalesce(p_workflow_status_target, v_task.workflow_status);

  if v_target_status = 'Cancelled' and p_cancellation_reason is null then
    raise exception 'cancellation_reason is required when workflow_status_target is Cancelled'
      using errcode = '23514';
  end if;

  if v_target_status not in ('Done', 'Cancelled')
     and (p_next_action is null or p_next_action_date is null) then
    raise exception 'next_action and next_action_date are required for an active workflow_status'
      using errcode = '23514';
  end if;

  insert into public.follow_up_logs (
    task_id, client_id, commercial_item_id, commercial_document_id, owner_id,
    fu_date, method, result, next_action, next_fu_date, notes, corrects_id
  ) values (
    p_task_id, v_task.client_id, v_task.commercial_item_id, v_task.commercial_document_id,
    v_task.owner_id, v_fu_date, p_method, p_result, p_next_action, p_next_action_date,
    p_note, p_corrects_id
  )
  returning id into v_follow_up_log_id;

  if v_target_status in ('Done', 'Cancelled') then
    v_due_state := null;
    v_calendar_incomplete := false;
  else
    select ds.due_state, ds.calendar_incomplete
    into v_due_state, v_calendar_incomplete
    from public.compute_task_due_state(v_task.due_date, v_target_status) as ds;
  end if;

  update public.tasks
  set
    workflow_status = v_target_status,
    next_action = p_next_action,
    next_action_date = p_next_action_date,
    cancellation_reason = case when v_target_status = 'Cancelled' then p_cancellation_reason else null end,
    first_progress_at = coalesce(first_progress_at, now())
  where id = p_task_id;

  v_title := case
    when p_workflow_status_target is not null and p_workflow_status_target is distinct from v_task.workflow_status
      then 'Status -> ' || v_target_status
    else 'Progress dicatat'
  end;

  insert into public.activity_log (
    kind, owner_id, actor_id, client_id, task_id, commercial_item_id,
    commercial_document_id, title, detail
  ) values (
    'task_progress', v_task.owner_id, v_actor_id, v_task.client_id, p_task_id,
    v_task.commercial_item_id, v_task.commercial_document_id, v_title, p_note
  )
  returning id into v_activity_log_id;

  return query select
    p_task_id, v_follow_up_log_id, v_activity_log_id, v_target_status,
    v_due_state, coalesce(v_calendar_incomplete, false);
end;
$$;

comment on function public.record_task_progress(
  uuid, text, date, text, public.task_workflow_status, text,
  public.task_method, public.follow_up_result, date, uuid
) is
'Atomic Sales Task Control Loop progress update. Task 16 removed the retired tasks.status dual-write; workflow_status and derived due_state are now the only active Task state contract.';

alter table public.tasks drop column status;
drop type public.task_status;
