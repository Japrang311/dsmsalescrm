-- Stage 1 Task 1.3: atomic commercial stage transition.
-- The function locks the commercial document, validates the requested stage
-- move, writes one structured stage audit event, then delegates the required
-- Task/follow-up progress to record_commercial_follow_up() in the same
-- transaction.

create or replace function public.transition_commercial_stage(
  p_commercial_document_id uuid,
  p_expected_from_stage text,
  p_to_stage text,
  p_task_id uuid default null,
  p_create_task_title text default null,
  p_task_due_date date default null,
  p_next_action text default null,
  p_next_action_date date default null,
  p_note text default null,
  p_method public.task_method default 'Phone',
  p_result public.follow_up_result default 'Progress Update',
  p_fu_date date default null,
  p_workflow_status_target public.task_workflow_status default 'In Progress',
  p_lost_reason text default null,
  p_lost_reason_detail text default null
)
returns table (
  commercial_document_id uuid,
  from_stage text,
  to_stage text,
  stage_activity_log_id uuid,
  task_id uuid,
  follow_up_log_id uuid,
  task_activity_log_id uuid,
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
  v_stage_activity_log_id uuid;
  v_progress record;
  v_to_stage text := nullif(btrim(p_to_stage), '');
  v_lost_reason text := nullif(btrim(p_lost_reason), '');
  v_lost_reason_detail text := nullif(btrim(p_lost_reason_detail), '');
  v_effective_at timestamptz := now();
begin
  if v_to_stage is null then
    raise exception 'p_to_stage is required'
      using errcode = '23514';
  end if;

  if v_to_stage not in (
    'Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit',
    'Closed Won', 'Closed Lost'
  ) then
    raise exception 'Unsupported commercial stage: %', v_to_stage
      using errcode = '23514';
  end if;

  select d.id, d.client_id, d.owner_id, d.type, d.stage
  into v_document
  from public.commercial_documents d
  where d.id = p_commercial_document_id
    and d.deleted_at is null
  for update;

  if not found then
    raise exception 'Commercial document % not found or not accessible', p_commercial_document_id
      using errcode = 'P0002';
  end if;

  if p_expected_from_stage is null
     or v_document.stage is distinct from p_expected_from_stage then
    raise exception 'STALE_COMMERCIAL_STAGE: document %, expected %, found %',
      p_commercial_document_id, p_expected_from_stage, v_document.stage
      using errcode = 'P0001';
  end if;

  if v_document.stage = v_to_stage then
    raise exception 'Commercial document % is already in stage %',
      p_commercial_document_id, v_to_stage
      using errcode = '23514';
  end if;

  if v_document.type = 'Quotation' and v_to_stage = 'Closed Lost' then
    if v_lost_reason is null or v_lost_reason = 'Belum diklasifikasi' then
      raise exception 'lost_reason is required when a Quotation moves to Closed Lost'
        using errcode = '23514';
    end if;
    if v_lost_reason = 'Lainnya' and v_lost_reason_detail is null then
      raise exception 'lost_reason_detail is required when lost_reason is Lainnya'
        using errcode = '23514';
    end if;
  end if;

  update public.commercial_documents
  set
    stage = v_to_stage,
    lost_reason = case
      when type = 'Quotation' and v_to_stage = 'Closed Lost' then v_lost_reason
      else null
    end,
    lost_reason_detail = case
      when type = 'Quotation' and v_to_stage = 'Closed Lost' then v_lost_reason_detail
      else null
    end,
    updated_at = now()
  where id = p_commercial_document_id;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    commercial_document_id,
    title,
    detail,
    event_data
  ) values (
    'commercial_item_stage_change',
    v_document.owner_id,
    (select auth.uid()),
    v_document.client_id,
    p_commercial_document_id,
    'Stage -> ' || v_to_stage,
    coalesce(p_note, 'stage: ' || v_document.stage || ' -> ' || v_to_stage),
    jsonb_build_object(
      'schema_version', 1,
      'from_stage', v_document.stage,
      'to_stage', v_to_stage,
      'effective_at', v_effective_at
    )
  )
  returning id into v_stage_activity_log_id;

  select *
  into v_progress
  from public.record_commercial_follow_up(
    p_commercial_document_id,
    p_task_id,
    p_create_task_title,
    p_task_due_date,
    p_next_action,
    p_next_action_date,
    p_note,
    p_method,
    p_result,
    p_fu_date,
    p_workflow_status_target
  );

  return query select
    p_commercial_document_id,
    v_document.stage,
    v_to_stage,
    v_stage_activity_log_id,
    v_progress.task_id,
    v_progress.follow_up_log_id,
    v_progress.activity_log_id,
    v_progress.created_task,
    v_progress.workflow_status,
    v_progress.due_state,
    v_progress.calendar_incomplete;
end;
$$;

revoke execute on function public.transition_commercial_stage(
  uuid, text, text, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date,
  public.task_workflow_status, text, text
) from public, anon;

grant execute on function public.transition_commercial_stage(
  uuid, text, text, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date,
  public.task_workflow_status, text, text
) to authenticated;

comment on function public.transition_commercial_stage(
  uuid, text, text, uuid, text, date, text, date, text,
  public.task_method, public.follow_up_result, date,
  public.task_workflow_status, text, text
) is
'Atomic commercial stage transition. Locks the document, rejects stale expected stages, enforces Closed Lost reason rules, writes structured stage audit data, and delegates Task/follow-up progress to record_commercial_follow_up in one transaction.';
