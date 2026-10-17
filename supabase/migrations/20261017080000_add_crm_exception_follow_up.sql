-- Task 13 DB subtask: retry-safe follow-up command for CRM action signals.
-- The existing record_commercial_follow_up() contract remains unchanged.

create or replace function public.record_commercial_exception_follow_up(
  p_request_id uuid,
  p_commercial_document_id uuid,
  p_preferred_task_id uuid,
  p_create_task_title text,
  p_task_due_date date,
  p_next_action text,
  p_next_action_date date,
  p_note text default null,
  p_method public.task_method default 'Phone',
  p_result public.follow_up_result default 'Progress Update',
  p_fu_date date default null,
  p_workflow_status_target public.task_workflow_status default 'In Progress'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := public.current_user_role();
  v_document public.commercial_documents%rowtype;
  v_task_id uuid;
  v_active_task_count integer;
  v_progress record;
  v_created_task boolean := false;
  v_create_title text := nullif(btrim(p_create_task_title), '');
  v_target_status public.task_workflow_status :=
    coalesce(p_workflow_status_target, 'In Progress');
  v_payload jsonb := jsonb_build_object(
    'commercialDocumentId', p_commercial_document_id,
    'preferredTaskId', p_preferred_task_id,
    'createTaskTitle', nullif(btrim(p_create_task_title), ''),
    'taskDueDate', p_task_due_date,
    'nextAction', nullif(btrim(p_next_action), ''),
    'nextActionDate', p_next_action_date,
    'note', nullif(btrim(p_note), ''),
    'method', p_method,
    'result', p_result,
    'fuDate', p_fu_date,
    'workflowStatusTarget', v_target_status
  );
  v_replay private.crm_command_replays%rowtype;
  v_result jsonb;
begin
  if v_actor is null
     or v_role is null
     or v_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED'
      using errcode = '42501';
  end if;
  if p_request_id is null
     or p_commercial_document_id is null
     or v_create_title is null
     or p_task_due_date is null
     or nullif(btrim(p_next_action), '') is null
     or p_next_action_date is null
  then
    raise exception 'INVALID_COMMAND_INPUT'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_actor::text || 'commercial-exception-follow-up' || p_request_id::text,
      0
    )
  );

  -- The document row also serializes different request IDs for one quotation,
  -- so each waiter re-checks the active Task after the preceding commit.
  select d.*
  into v_document
  from public.commercial_documents d
  where d.id = p_commercial_document_id
    and d.type = 'Quotation'
    and d.is_current_revision
    and d.deleted_at is null
  for update;

  if not found then
    raise exception 'CURRENT_QUOTATION_REQUIRED'
      using errcode = 'P0002';
  end if;
  if v_role = 'sales' and v_document.owner_id <> v_actor then
    raise exception 'QUOTATION_OWNERSHIP_REQUIRED'
      using errcode = '42501';
  end if;
  if not private.is_active_business_owner(v_document.owner_id) then
    raise exception 'ACTIVE_BUSINESS_OWNER_REQUIRED'
      using errcode = '42501';
  end if;

  select *
  into v_replay
  from private.crm_command_replays
  where actor_id = v_actor
    and command = 'commercial_exception_follow_up'
    and request_id = p_request_id;
  if found then
    if v_replay.payload <> v_payload then
      raise exception 'REQUEST_PAYLOAD_MISMATCH'
        using errcode = '23514';
    end if;
    return v_replay.result;
  end if;

  if p_preferred_task_id is not null then
    select t.id
    into v_task_id
    from public.tasks t
    where t.id = p_preferred_task_id
      and t.commercial_document_id = p_commercial_document_id
      and t.client_id = v_document.client_id
      and t.owner_id = v_document.owner_id
      and not t.archived
      and t.workflow_status not in ('Done', 'Cancelled')
    for update;
    if not found then
      raise exception 'ACTIVE_TASK_NOT_FOUND'
        using errcode = '23514';
    end if;
  else
    select count(*)
    into v_active_task_count
    from public.tasks t
    where t.commercial_document_id = p_commercial_document_id
      and t.client_id = v_document.client_id
      and t.owner_id = v_document.owner_id
      and not t.archived
      and t.workflow_status not in ('Done', 'Cancelled');

    if v_active_task_count > 1 then
      raise exception 'ACTIVE_TASK_SELECTION_REQUIRED'
        using errcode = '23514';
    elsif v_active_task_count = 1 then
      select t.id
      into v_task_id
      from public.tasks t
      where t.commercial_document_id = p_commercial_document_id
        and t.client_id = v_document.client_id
        and t.owner_id = v_document.owner_id
        and not t.archived
        and t.workflow_status not in ('Done', 'Cancelled')
      order by t.id
      limit 1
      for update;
    else
      insert into public.tasks (
        client_id,
        commercial_document_id,
        owner_id,
        title,
        due_date,
        method,
        category
      ) values (
        v_document.client_id,
        p_commercial_document_id,
        v_document.owner_id,
        v_create_title,
        p_task_due_date,
        coalesce(p_method, 'Phone'),
        'Follow-Up'
      )
      returning id into v_task_id;
      v_created_task := true;
    end if;
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

  v_result := jsonb_build_object(
    'task_id', v_progress.task_id,
    'follow_up_log_id', v_progress.follow_up_log_id,
    'activity_log_id', v_progress.activity_log_id,
    'created_task', v_created_task,
    'workflow_status', v_progress.workflow_status,
    'due_state', v_progress.due_state,
    'calendar_incomplete', v_progress.calendar_incomplete
  );

  insert into private.crm_command_replays (
    actor_id,
    command,
    request_id,
    payload,
    result
  ) values (
    v_actor,
    'commercial_exception_follow_up',
    p_request_id,
    v_payload,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.record_commercial_exception_follow_up(
  uuid, uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) from public, anon;

grant execute on function public.record_commercial_exception_follow_up(
  uuid, uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) to authenticated;

comment on function public.record_commercial_exception_follow_up(
  uuid, uuid, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date, public.task_workflow_status
) is
'Retry-safe action-signal follow-up command. Serializes writes per quotation, reuses one active related Task, requires an explicit choice when several are active, and records Task progress, follow-up, and activity atomically.';
