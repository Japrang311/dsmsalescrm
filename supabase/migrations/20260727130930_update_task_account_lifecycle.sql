-- Task 60/15: migrate account-lifecycle Task predicates from the legacy
-- due-state-shaped tasks.status column to workflow_status + archived.
-- Historical attribution tables remain untouched; this only changes the
-- active/open transfer scope.

create or replace function private.is_active_transfer_task(
  p_workflow_status public.task_workflow_status,
  p_archived boolean
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(not p_archived, false)
    and p_workflow_status in ('Open', 'In Progress', 'Waiting External');
$$;

revoke all privileges on function private.is_active_transfer_task(
  public.task_workflow_status,
  boolean
) from public, anon, authenticated;
grant execute on function private.is_active_transfer_task(
  public.task_workflow_status,
  boolean
) to service_role;

comment on function private.is_active_transfer_task(
  public.task_workflow_status,
  boolean
) is
'True for Task records eligible for account-lifecycle ownership transfer: non-archived and workflow-active. Done and Cancelled remain historical attribution.';

-- Default ownership-transfer scope, derived from the accepted workflows:
--   * clients: every status except Lost (Dormant may be reactivated),
--   * tasks: workflow-active and not archived,
--   * commercial items: not a terminal workflow stage.
-- Sales Orders/revenue, targets, follow-up history, and Activity Log are never
-- rewritten; they retain the owner/actor attribution recorded at creation.
create or replace function private.transfer_active_ownership(
  source_id uuid,
  destination_id uuid,
  actor_id uuid,
  reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_profile public.profiles%rowtype;
  destination_profile public.profiles%rowtype;
  actor_profile public.profiles%rowtype;
  client_count integer := 0;
  task_count integer := 0;
  commercial_count integer := 0;
  transfer_counts jsonb;
begin
  if reason is null or btrim(reason) = '' then
    raise exception using message = 'ADMINISTRATIVE_REASON_REQUIRED';
  end if;
  if source_id = destination_id then
    raise exception using message = 'OWNERSHIP_SOURCE_EQUALS_DESTINATION';
  end if;

  -- Deterministic profile-row locking prevents two concurrent transfer/status
  -- actions from observing incompatible lifecycle state.
  perform id
  from public.profiles
  where id = any(array[source_id, destination_id, actor_id])
  order by id
  for update;

  select * into source_profile
  from public.profiles
  where id = source_id;
  select * into destination_profile
  from public.profiles
  where id = destination_id;
  select * into actor_profile
  from public.profiles
  where id = actor_id;

  if actor_profile.id is null
    or actor_profile.role <> 'super_admin'
    or actor_profile.account_status <> 'active'
  then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  if source_profile.id is null
    or source_profile.role not in ('sales', 'manager')
  then
    raise exception using message = 'INVALID_OWNERSHIP_SOURCE';
  end if;
  if destination_profile.id is null
    or destination_profile.account_status <> 'active'
    or destination_profile.role not in ('sales', 'manager')
  then
    raise exception using message = 'INVALID_OWNERSHIP_DESTINATION';
  end if;

  update public.clients
  set owner_id = destination_id
  where owner_id = source_id
    and status <> 'Lost';
  get diagnostics client_count = row_count;

  update public.tasks
  set owner_id = destination_id
  where owner_id = source_id
    and private.is_active_transfer_task(workflow_status, archived);
  get diagnostics task_count = row_count;

  update public.commercial_documents
  set owner_id = destination_id
  where owner_id = source_id
    and lower(btrim(stage)) not in (
      'closed won',
      'closed lost',
      'revenue recorded',
      'closed'
    );
  get diagnostics commercial_count = row_count;

  transfer_counts := jsonb_build_object(
    'clients', client_count,
    'tasks', task_count,
    'commercial_items', commercial_count,
    'total', client_count + task_count + commercial_count
  );

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    target_profile_id,
    target_profile_snapshot,
    administrative_reason,
    title,
    detail
  ) values (
    'team_member_ownership_transferred',
    destination_id,
    actor_id,
    source_id,
    jsonb_build_object(
      'name', source_profile.name,
      'email', source_profile.email,
      'role', source_profile.role
    ),
    reason,
    'Ownership anggota tim ditransfer',
    jsonb_build_object(
      'result', 'success',
      'before_owner_id', source_id,
      'after_owner_id', destination_id,
      'before', jsonb_build_object('owner_id', source_id),
      'after', jsonb_build_object('owner_id', destination_id),
      'counts', transfer_counts
    )::text
  );

  return transfer_counts;
end;
$$;

revoke all privileges on function private.transfer_active_ownership(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function private.transfer_active_ownership(
  uuid,
  uuid,
  uuid,
  text
) to service_role;
