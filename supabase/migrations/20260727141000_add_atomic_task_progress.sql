-- Migration: add_atomic_task_progress
--
-- Sales Task Control Loop implementation-plan Task 5 / project-tracker
-- Task 50, part 2 of 2. Adds public.record_task_progress(...), the single
-- atomic RPC that replaces LogFollowUpDialog's current up-to-5 independent
-- Supabase calls (spec §1.5, §3.3) with one transaction: insert the
-- progress-domain record, update the Task, and append exactly one audit
-- event -- or roll back everything if any step fails.
--
-- security invoker (not definer): every write below is still subject to
-- the caller's own RLS policies (tasks_update, follow_up_logs_insert,
-- activity_log_insert), so this function grants no privilege beyond what
-- the caller already has directly. This also means "is the caller allowed
-- to touch this Task" (spec §3.3 step 1) falls out of the SELECT ... FOR
-- UPDATE below for free -- if RLS hides the row, FOUND is false and the
-- function raises, rather than needing a hand-rolled ownership check that
-- could drift out of sync with the real RLS policy.

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
  v_legacy_status public.task_status;
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

  -- Legacy `status` dual-write (spec §6.1): Done/Cancelled both collapse to
  -- legacy 'Done' (Cancelled has no legacy equivalent -- it never existed
  -- in the old system -- and every legacy consumer treats status='Done' as
  -- "no longer active", which is correct for Cancelled too). Any other
  -- active workflow_status is recomputed from the real due-state engine
  -- (Task 4) rather than the old never-recomputed stored guess, collapsing
  -- Escalated into Overdue since the legacy enum has no Escalated value.
  if v_target_status in ('Done', 'Cancelled') then
    v_legacy_status := 'Done';
    v_due_state := null;
    v_calendar_incomplete := false;
  else
    select ds.due_state, ds.calendar_incomplete
    into v_due_state, v_calendar_incomplete
    from public.compute_task_due_state(v_task.due_date, v_target_status) as ds;

    v_legacy_status := case v_due_state
      when 'Escalated' then 'Overdue'
      else v_due_state
    end::public.task_status;
  end if;

  update public.tasks
  set
    workflow_status = v_target_status,
    next_action = p_next_action,
    next_action_date = p_next_action_date,
    cancellation_reason = case when v_target_status = 'Cancelled' then p_cancellation_reason else null end,
    first_progress_at = coalesce(first_progress_at, now()),
    status = v_legacy_status
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
'Atomic Sales Task Control Loop progress update (spec §3.3): inserts one follow_up_logs row, updates the Task (workflow_status/next_action/next_action_date/cancellation_reason/legacy status), and appends exactly one activity_log audit row, all in one transaction. security invoker -- callers need the same tasks_update/follow_up_logs_insert/activity_log_insert RLS access they would need to write these tables directly.';

revoke execute on function public.record_task_progress(
  uuid, text, date, text, public.task_workflow_status, text,
  public.task_method, public.follow_up_result, date, uuid
) from public;

grant execute on function public.record_task_progress(
  uuid, text, date, text, public.task_workflow_status, text,
  public.task_method, public.follow_up_result, date, uuid
) to authenticated;
