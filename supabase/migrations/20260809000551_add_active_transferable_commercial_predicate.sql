-- Task C2: separate active-transferable commercial ownership from historical
-- account references. Summary/workload and transfer use this predicate; delete
-- blockers continue to count every historical reference through
-- private.account_reference_counts().

create or replace function private.is_active_transfer_commercial_document(
  p_type public.commercial_type,
  p_stage text,
  p_deleted_at timestamptz,
  p_is_current_revision boolean
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_deleted_at is null
    and (p_type <> 'Quotation'::public.commercial_type
      or coalesce(p_is_current_revision, false))
    and lower(btrim(coalesce(p_stage, ''))) not in (
      'closed won',
      'closed lost',
      'revenue recorded',
      'closed'
    );
$$;

revoke all privileges on function private.is_active_transfer_commercial_document(
  public.commercial_type,
  text,
  timestamptz,
  boolean
) from public, anon, authenticated;
grant execute on function private.is_active_transfer_commercial_document(
  public.commercial_type,
  text,
  timestamptz,
  boolean
) to service_role;

comment on function private.is_active_transfer_commercial_document(
  public.commercial_type,
  text,
  timestamptz,
  boolean
) is
'True for commercial document records eligible for account-lifecycle ownership transfer and active workload summaries: not soft-deleted, not terminal-stage, and current when the record is a Quotation revision.';

create or replace function private.count_active_commercial_items(
  target_owner_id uuid
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.commercial_documents
  where owner_id = target_owner_id
    and private.is_active_transfer_commercial_document(
      type,
      stage,
      deleted_at,
      is_current_revision
    );
$$;

revoke all privileges on function private.count_active_commercial_items(uuid)
from public, anon, authenticated;
grant execute on function private.count_active_commercial_items(uuid)
to service_role;

comment on function private.count_active_commercial_items(uuid) is
'Counts active transferable commercial documents for workload summaries using private.is_active_transfer_commercial_document(). Historical references are counted separately by private.account_reference_counts().';

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
    and private.is_active_transfer_commercial_document(
      type,
      stage,
      deleted_at,
      is_current_revision
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

comment on function private.transfer_active_ownership(
  uuid,
  uuid,
  uuid,
  text
) is
'Transfers only active ownership: non-Lost clients, active/unarchived tasks, and commercial documents accepted by private.is_active_transfer_commercial_document(). Historical attribution remains untouched.';

create or replace function public.admin_team_summary()
returns table (
  id uuid,
  name text,
  initials text,
  role public.app_role,
  email text,
  account_status public.account_status,
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_change_reason text,
  clients_count bigint,
  tasks_count bigint,
  commercial_items_count bigint,
  last_change_kind text,
  last_change_title text,
  last_change_reason text,
  last_change_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role public.app_role;
begin
  caller_role := public.current_user_role();
  if caller_role is null then
    raise exception using message = 'ACTIVE_PRIVILEGED_ROLE_REQUIRED';
  end if;
  if caller_role not in ('manager', 'executive', 'super_admin') then
    raise exception using message = 'INSUFFICIENT_PRIVILEGE';
  end if;

  return query
  select
    p.id,
    p.name,
    p.initials,
    p.role,
    p.email,
    p.account_status,
    p.status_changed_at,
    p.status_changed_by,
    p.status_change_reason,
    coalesce(clients_agg.n, 0)::bigint as clients_count,
    coalesce(tasks_agg.n, 0)::bigint as tasks_count,
    coalesce(commercial_agg.n, 0)::bigint as commercial_items_count,
    last_change.kind::text as last_change_kind,
    last_change.title as last_change_title,
    last_change.administrative_reason as last_change_reason,
    last_change.created_at as last_change_at
  from public.profiles p
  left join lateral (
    select count(*) as n
    from public.clients c
    where c.owner_id = p.id and c.status != 'Lost'
  ) clients_agg on true
  left join lateral (
    select count(*) as n
    from public.tasks t
    where t.owner_id = p.id
      and private.is_active_transfer_task(t.workflow_status, t.archived)
  ) tasks_agg on true
  left join lateral (
    select private.count_active_commercial_items(p.id) as n
  ) commercial_agg on true
  left join lateral (
    select al.kind, al.title, al.administrative_reason, al.created_at
    from public.activity_log al
    where al.target_profile_id = p.id
      and al.kind in (
        'team_member_created', 'team_member_profile_updated',
        'team_member_role_changed', 'team_member_deactivated',
        'team_member_reactivated', 'team_member_ownership_transferred',
        'team_member_deleted'
      )
    order by al.created_at desc
    limit 1
  ) last_change on true;
end;
$$;

comment on function public.admin_team_summary() is
'One-query aggregate replacement for listTeamMembers()''s N+1 per-member fetch. Active commercial workload is counted through private.count_active_commercial_items(), which shares the transfer predicate.';

revoke all privileges on function public.admin_team_summary()
from public, anon;
grant execute on function public.admin_team_summary()
to authenticated, service_role;
