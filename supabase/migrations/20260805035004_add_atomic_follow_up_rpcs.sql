-- Stage 1 Task 1.2: atomic follow-up wrappers.
-- These wrappers keep record_task_progress() as the canonical Task progress
-- implementation while adding the explicit "existing Task vs create Task"
-- choice required by client and commercial follow-up flows.

create or replace function public.record_client_follow_up(
  p_client_id uuid,
  p_task_id uuid default null,
  p_create_task_title text default null,
  p_task_due_date date default null,
  p_next_action text default null,
  p_next_action_date date default null,
  p_note text default null,
  p_method public.task_method default 'Phone',
  p_result public.follow_up_result default 'Progress Update',
  p_fu_date date default null,
  p_workflow_status_target public.task_workflow_status default 'In Progress'
)
returns table (
  task_id uuid,
  follow_up_log_id uuid,
  activity_log_id uuid,
  created_task boolean,
  workflow_status public.task_workflow_status,
  due_state text,
  calendar_incomplete boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client record;
  v_task_id uuid;
  v_progress record;
  v_create_title text := nullif(btrim(p_create_task_title), '');
  v_created_task boolean := false;
  v_target_status public.task_workflow_status := coalesce(p_workflow_status_target, 'In Progress');
begin
  if (p_task_id is null and v_create_title is null)
     or (p_task_id is not null and v_create_title is not null) then
    raise exception 'Choose exactly one of p_task_id or p_create_task_title'
      using errcode = '23514';
  end if;

  select c.id, c.owner_id
  into v_client
  from public.clients c
  where c.id = p_client_id
  for update;

  if not found then
    raise exception 'Client % not found or not accessible', p_client_id
      using errcode = 'P0002';
  end if;

  if p_task_id is not null then
    select t.id
    into v_task_id
    from public.tasks t
    where t.id = p_task_id
      and t.client_id = p_client_id
    for update;

    if not found then
      raise exception 'Task % is not linked to Client % or is not accessible', p_task_id, p_client_id
        using errcode = 'P0002';
    end if;
  else
    if p_task_due_date is null then
      raise exception 'p_task_due_date is required when creating a follow-up Task'
        using errcode = '23514';
    end if;

    if v_target_status not in ('Done', 'Cancelled')
       and (nullif(btrim(p_next_action), '') is null or p_next_action_date is null) then
      raise exception 'p_next_action and p_next_action_date are required when creating an active follow-up Task'
        using errcode = '23514';
    end if;

    insert into public.tasks (
      client_id, owner_id, title, due_date, method, category
    ) values (
      p_client_id, v_client.owner_id, v_create_title, p_task_due_date,
      coalesce(p_method, 'Phone'), 'Follow-Up'
    )
    returning id into v_task_id;

    v_created_task := true;
  end if;

  select *
  into v_progress
  from public.record_task_progress(
    v_task_id,
    p_next_action,
    p_next_action_date,
    p_note,
    v_target_status,
    null,
    coalesce(p_method, 'Phone'),
    coalesce(p_result, 'Progress Update'),
    p_fu_date,
    null
  );

  return query select
    v_progress.task_id,
    v_progress.follow_up_log_id,
    v_progress.activity_log_id,
    v_created_task,
    v_progress.workflow_status,
    v_progress.due_state,
    v_progress.calendar_incomplete;
end;
$$;

create or replace function public.record_commercial_follow_up(
  p_commercial_document_id uuid,
  p_task_id uuid default null,
  p_create_task_title text default null,
  p_task_due_date date default null,
  p_next_action text default null,
  p_next_action_date date default null,
  p_note text default null,
  p_method public.task_method default 'Phone',
  p_result public.follow_up_result default 'Progress Update',
  p_fu_date date default null,
  p_workflow_status_target public.task_workflow_status default 'In Progress'
)
returns table (
  task_id uuid,
  follow_up_log_id uuid,
  activity_log_id uuid,
  created_task boolean,
  workflow_status public.task_workflow_status,
  due_state text,
  calendar_incomplete boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document record;
  v_task_id uuid;
  v_progress record;
  v_create_title text := nullif(btrim(p_create_task_title), '');
  v_created_task boolean := false;
  v_target_status public.task_workflow_status := coalesce(p_workflow_status_target, 'In Progress');
begin
  if (p_task_id is null and v_create_title is null)
     or (p_task_id is not null and v_create_title is not null) then
    raise exception 'Choose exactly one of p_task_id or p_create_task_title'
      using errcode = '23514';
  end if;

  select d.id, d.client_id, d.owner_id
  into v_document
  from public.commercial_documents d
  where d.id = p_commercial_document_id
    and d.deleted_at is null
  for update;

  if not found then
    raise exception 'Commercial document % not found or not accessible', p_commercial_document_id
      using errcode = 'P0002';
  end if;

  if p_task_id is not null then
    select t.id
    into v_task_id
    from public.tasks t
    where t.id = p_task_id
      and t.commercial_document_id = p_commercial_document_id
    for update;

    if not found then
      raise exception 'Task % is not linked to Commercial Document % or is not accessible', p_task_id, p_commercial_document_id
        using errcode = 'P0002';
    end if;
  else
    if p_task_due_date is null then
      raise exception 'p_task_due_date is required when creating a commercial follow-up Task'
        using errcode = '23514';
    end if;

    if v_target_status not in ('Done', 'Cancelled')
       and (nullif(btrim(p_next_action), '') is null or p_next_action_date is null) then
      raise exception 'p_next_action and p_next_action_date are required when creating an active commercial follow-up Task'
        using errcode = '23514';
    end if;

    insert into public.tasks (
      client_id, commercial_document_id, owner_id, title, due_date, method, category
    ) values (
      v_document.client_id, p_commercial_document_id, v_document.owner_id,
      v_create_title, p_task_due_date, coalesce(p_method, 'Phone'), 'Follow-Up'
    )
    returning id into v_task_id;

    v_created_task := true;
  end if;

  select *
  into v_progress
  from public.record_task_progress(
    v_task_id,
    p_next_action,
    p_next_action_date,
    p_note,
    v_target_status,
    null,
    coalesce(p_method, 'Phone'),
    coalesce(p_result, 'Progress Update'),
    p_fu_date,
    null
  );

  return query select
    v_progress.task_id,
    v_progress.follow_up_log_id,
    v_progress.activity_log_id,
    v_created_task,
    v_progress.workflow_status,
    v_progress.due_state,
    v_progress.calendar_incomplete;
end;
$$;

revoke execute on function public.record_client_follow_up(
  uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) from public, anon;

revoke execute on function public.record_commercial_follow_up(
  uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) from public, anon;

grant execute on function public.record_client_follow_up(
  uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) to authenticated;

grant execute on function public.record_commercial_follow_up(
  uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) to authenticated;

comment on function public.record_client_follow_up(
  uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) is
'Atomic client follow-up command. Requires exactly one explicit existing Task ID or one explicit create-new Task title; writes Task progress, follow_up_logs, and activity_log through record_task_progress in a single transaction.';

comment on function public.record_commercial_follow_up(
  uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) is
'Atomic commercial follow-up command. Requires exactly one explicit existing Task ID or one explicit create-new Task title linked to the selected commercial document; writes Task progress, follow_up_logs, and activity_log through record_task_progress in a single transaction.';
