-- Transactional account-lifecycle primitives live outside the exposed Data
-- API schema. Public wrappers are service-role-only because PostgREST exposes
-- RPCs only from configured schemas; browser roles receive no EXECUTE grant.
-- Sources:
-- https://supabase.com/docs/guides/database/functions#function-privileges
-- https://supabase.com/docs/guides/api/securing-your-api

-- Reference eligibility checks cover these two foreign-key paths in addition
-- to the owner indexes created by the RLS hardening migration.
create index if not exists activity_log_actor_id_idx
on public.activity_log using btree (actor_id);

create index if not exists profiles_status_changed_by_idx
on public.profiles using btree (status_changed_by);

create or replace function private.active_super_admin_count()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.profiles
  where role = 'super_admin'
    and account_status = 'active';
$$;

-- Counts every current foreign-key path to profiles. A target-only
-- administrative Activity Log reference is reported but deliberately does not
-- contribute to total_blocking: Task 3 made that FK ON DELETE SET NULL and
-- preserved a safe immutable snapshot specifically so an otherwise-unused
-- account can be deleted without deleting or rewriting its audit event.
create or replace function private.account_reference_counts(target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with counts as (
    select
      (select count(*) from public.clients where owner_id = target_id) as clients,
      (select count(*) from public.tasks where owner_id = target_id) as tasks,
      (select count(*) from public.commercial_items where owner_id = target_id) as commercial_items,
      (select count(*) from public.sales_orders where owner_id = target_id) as sales_orders,
      (select count(*) from public.follow_up_logs where owner_id = target_id) as follow_up_logs,
      (select count(*) from public.targets where sales_id = target_id) as targets,
      (select count(*) from public.activity_log where owner_id = target_id) as activity_log_owner,
      (select count(*) from public.activity_log where actor_id = target_id) as activity_log_actor,
      (select count(*) from public.activity_log where target_profile_id = target_id) as activity_log_target,
      (select count(*) from public.profiles where status_changed_by = target_id) as profile_status_changes
  ), totals as (
    select
      *,
      clients + tasks + commercial_items + sales_orders + follow_up_logs
        + targets + activity_log_owner + activity_log_actor
        + profile_status_changes as total_blocking
    from counts
  )
  select jsonb_build_object(
    'clients', clients,
    'tasks', tasks,
    'commercial_items', commercial_items,
    'sales_orders', sales_orders,
    'follow_up_logs', follow_up_logs,
    'targets', targets,
    'activity_log_owner', activity_log_owner,
    'activity_log_actor', activity_log_actor,
    'activity_log_target', activity_log_target,
    'profile_status_changes', profile_status_changes,
    'total_blocking', total_blocking,
    'total_all', total_blocking + activity_log_target
  )
  from totals;
$$;

revoke all privileges on function private.active_super_admin_count()
from public, anon, authenticated;
revoke all privileges on function private.account_reference_counts(uuid)
from public, anon, authenticated;
grant execute on function private.active_super_admin_count() to service_role;
grant execute on function private.account_reference_counts(uuid) to service_role;

create or replace function public.admin_active_super_admin_count()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select private.active_super_admin_count();
$$;

create or replace function public.admin_account_reference_counts(p_target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.account_reference_counts(p_target_id);
$$;

revoke all privileges on function public.admin_active_super_admin_count()
from public, anon, authenticated;
revoke all privileges on function public.admin_account_reference_counts(uuid)
from public, anon, authenticated;
grant execute on function public.admin_active_super_admin_count() to service_role;
grant execute on function public.admin_account_reference_counts(uuid) to service_role;

-- Default ownership-transfer scope, derived from the accepted workflows:
--   * clients: every status except Lost (Dormant may be reactivated),
--   * tasks: not Done and not archived,
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
    and status <> 'Done'
    and archived = false;
  get diagnostics task_count = row_count;

  update public.commercial_items
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

create or replace function public.admin_transfer_active_ownership(
  p_actor_id uuid,
  p_source_id uuid,
  p_destination_id uuid,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transfer_active_ownership(
    p_source_id,
    p_destination_id,
    p_actor_id,
    p_reason
  );
$$;

revoke all privileges on function public.admin_transfer_active_ownership(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.admin_transfer_active_ownership(
  uuid,
  uuid,
  uuid,
  text
) to service_role;

create or replace function private.is_active_super_admin(candidate_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = candidate_id
      and role = 'super_admin'
      and account_status = 'active'
  );
$$;

create or replace function private.account_ownership_counts(target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with counts as (
    select
      (select count(*) from public.clients where owner_id = target_id) as clients,
      (select count(*) from public.tasks where owner_id = target_id) as tasks,
      (select count(*) from public.commercial_items where owner_id = target_id) as commercial_items,
      (select count(*) from public.sales_orders where owner_id = target_id) as sales_orders,
      (select count(*) from public.follow_up_logs where owner_id = target_id) as follow_up_logs,
      (select count(*) from public.targets where sales_id = target_id) as targets,
      (select count(*) from public.activity_log where owner_id = target_id) as activity_log_owner
  )
  select jsonb_build_object(
    'clients', clients,
    'tasks', tasks,
    'commercial_items', commercial_items,
    'sales_orders', sales_orders,
    'follow_up_logs', follow_up_logs,
    'targets', targets,
    'activity_log_owner', activity_log_owner,
    'total', clients + tasks + commercial_items + sales_orders
      + follow_up_logs + targets + activity_log_owner
  )
  from counts;
$$;

create or replace function private.insert_team_admin_audit(
  p_kind public.activity_kind,
  p_owner_id uuid,
  p_actor_id uuid,
  p_target_id uuid,
  p_target_snapshot jsonb,
  p_reason text,
  p_title text,
  p_detail jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using message = 'ADMINISTRATIVE_REASON_REQUIRED';
  end if;

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
    p_kind,
    p_owner_id,
    p_actor_id,
    p_target_id,
    p_target_snapshot,
    p_reason,
    p_title,
    p_detail::text
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function private.create_team_member_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_name text,
  p_email text,
  p_initials text,
  p_role public.app_role
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snapshot jsonb;
  audit_id uuid;
begin
  perform id
  from public.profiles
  where id = p_actor_id
  for update;

  if not private.is_active_super_admin(p_actor_id) then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  if p_name is null or btrim(p_name) = ''
    or p_email is null or btrim(p_email) = ''
    or p_initials is null or btrim(p_initials) = ''
  then
    raise exception using message = 'PROFILE_FIELDS_REQUIRED';
  end if;

  insert into public.profiles (
    id,
    role,
    account_status,
    name,
    initials,
    email
  ) values (
    p_target_id,
    p_role,
    'active',
    btrim(p_name),
    upper(btrim(p_initials)),
    lower(btrim(p_email))
  );

  snapshot := jsonb_build_object(
    'name', btrim(p_name),
    'email', lower(btrim(p_email)),
    'role', p_role
  );
  audit_id := private.insert_team_admin_audit(
    'team_member_created',
    p_actor_id,
    p_actor_id,
    p_target_id,
    snapshot,
    'Membuat anggota tim',
    'Anggota tim dibuat',
    jsonb_build_object(
      'result', 'success',
      'before', null,
      'after', jsonb_build_object(
        'name', btrim(p_name),
        'initials', upper(btrim(p_initials)),
        'role', p_role,
        'account_status', 'active'
      )
    )
  );

  return jsonb_build_object(
    'id', p_target_id,
    'action', 'create',
    'audit_id', audit_id
  );
end;
$$;

create or replace function private.update_team_member_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_name text,
  p_initials text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  audit_id uuid;
begin
  perform id
  from public.profiles
  where id = any(array[p_actor_id, p_target_id])
  order by id
  for update;

  if not private.is_active_super_admin(p_actor_id) then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  select * into target_profile
  from public.profiles
  where id = p_target_id;
  if target_profile.id is null then
    raise exception using message = 'TEAM_MEMBER_NOT_FOUND';
  end if;
  if p_name is null or btrim(p_name) = ''
    or p_initials is null or btrim(p_initials) = ''
  then
    raise exception using message = 'PROFILE_FIELDS_REQUIRED';
  end if;

  update public.profiles
  set name = btrim(p_name),
      initials = upper(btrim(p_initials))
  where id = p_target_id;

  audit_id := private.insert_team_admin_audit(
    'team_member_profile_updated',
    p_actor_id,
    p_actor_id,
    p_target_id,
    jsonb_build_object(
      'name', btrim(p_name),
      'email', target_profile.email,
      'role', target_profile.role
    ),
    'Memperbarui profil anggota tim',
    'Profil anggota tim diperbarui',
    jsonb_build_object(
      'result', 'success',
      'before', jsonb_build_object(
        'name', target_profile.name,
        'initials', target_profile.initials
      ),
      'after', jsonb_build_object(
        'name', btrim(p_name),
        'initials', upper(btrim(p_initials))
      )
    )
  );

  return jsonb_build_object(
    'id', p_target_id,
    'action', 'update_profile',
    'audit_id', audit_id
  );
end;
$$;

create or replace function private.change_team_member_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_role public.app_role,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  ownership_counts jsonb;
  audit_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using message = 'ADMINISTRATIVE_REASON_REQUIRED';
  end if;

  perform id
  from public.profiles
  where id = any(array[p_actor_id, p_target_id])
  order by id
  for update;

  if not private.is_active_super_admin(p_actor_id) then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  select * into target_profile
  from public.profiles
  where id = p_target_id;
  if target_profile.id is null then
    raise exception using message = 'TEAM_MEMBER_NOT_FOUND';
  end if;
  if p_target_id = p_actor_id and p_role <> target_profile.role then
    raise exception using message = 'SELF_ROLE_CHANGE_FORBIDDEN';
  end if;
  if p_role = target_profile.role then
    raise exception using message = 'ROLE_UNCHANGED';
  end if;
  if target_profile.role = 'super_admin'
    and target_profile.account_status = 'active'
    and p_role <> 'super_admin'
    and private.active_super_admin_count() <= 1
  then
    raise exception using message = 'LAST_ACTIVE_SUPER_ADMIN';
  end if;

  if p_role not in ('sales', 'manager') then
    ownership_counts := private.account_ownership_counts(p_target_id);
    if (ownership_counts ->> 'total')::bigint > 0 then
      raise exception using
        message = 'ACCOUNT_HAS_OWNERSHIP',
        detail = ownership_counts::text;
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_target_id;

  audit_id := private.insert_team_admin_audit(
    'team_member_role_changed',
    p_actor_id,
    p_actor_id,
    p_target_id,
    jsonb_build_object(
      'name', target_profile.name,
      'email', target_profile.email,
      'role', p_role
    ),
    p_reason,
    'Role anggota tim diubah',
    jsonb_build_object(
      'result', 'success',
      'before', jsonb_build_object('role', target_profile.role),
      'after', jsonb_build_object('role', p_role)
    )
  );

  return jsonb_build_object(
    'id', p_target_id,
    'action', 'change_role',
    'audit_id', audit_id
  );
end;
$$;

create or replace function private.set_team_member_status(
  p_actor_id uuid,
  p_target_id uuid,
  p_account_status public.account_status,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  event_kind public.activity_kind;
  action_name text;
  audit_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using message = 'ADMINISTRATIVE_REASON_REQUIRED';
  end if;

  perform id
  from public.profiles
  where id = any(array[p_actor_id, p_target_id])
  order by id
  for update;

  if not private.is_active_super_admin(p_actor_id) then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  select * into target_profile
  from public.profiles
  where id = p_target_id;
  if target_profile.id is null then
    raise exception using message = 'TEAM_MEMBER_NOT_FOUND';
  end if;
  if p_account_status = target_profile.account_status then
    raise exception using message = 'ACCOUNT_STATUS_UNCHANGED';
  end if;
  if p_account_status = 'inactive' and p_target_id = p_actor_id then
    raise exception using message = 'SELF_DEACTIVATION_FORBIDDEN';
  end if;
  if p_account_status = 'inactive'
    and target_profile.role = 'super_admin'
    and target_profile.account_status = 'active'
    and private.active_super_admin_count() <= 1
  then
    raise exception using message = 'LAST_ACTIVE_SUPER_ADMIN';
  end if;

  if p_account_status = 'inactive' then
    event_kind := 'team_member_deactivated';
    action_name := 'deactivate';
  else
    event_kind := 'team_member_reactivated';
    action_name := 'reactivate';
  end if;

  -- This write is the immediate/fail-closed authority boundary. Any Auth ban
  -- or refresh-token revocation happens only after this transaction commits.
  update public.profiles
  set account_status = p_account_status,
      status_changed_at = now(),
      status_changed_by = p_actor_id,
      status_change_reason = p_reason
  where id = p_target_id;

  audit_id := private.insert_team_admin_audit(
    event_kind,
    p_actor_id,
    p_actor_id,
    p_target_id,
    jsonb_build_object(
      'name', target_profile.name,
      'email', target_profile.email,
      'role', target_profile.role
    ),
    p_reason,
    case p_account_status
      when 'inactive' then 'Anggota tim dinonaktifkan'
      else 'Anggota tim diaktifkan kembali'
    end,
    jsonb_build_object(
      'result', 'success',
      'before', jsonb_build_object(
        'account_status', target_profile.account_status
      ),
      'after', jsonb_build_object('account_status', p_account_status)
    )
  );

  return jsonb_build_object(
    'id', p_target_id,
    'action', action_name,
    'audit_id', audit_id
  );
end;
$$;

create or replace function private.delete_eligible_account(
  p_actor_id uuid,
  p_target_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  reference_counts jsonb;
  snapshot jsonb;
  audit_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using message = 'ADMINISTRATIVE_REASON_REQUIRED';
  end if;

  perform id
  from public.profiles
  where id = any(array[p_actor_id, p_target_id])
  order by id
  for update;

  if not private.is_active_super_admin(p_actor_id) then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  select * into target_profile
  from public.profiles
  where id = p_target_id;
  if target_profile.id is null then
    raise exception using message = 'TEAM_MEMBER_NOT_FOUND';
  end if;
  if p_target_id = p_actor_id then
    raise exception using message = 'SELF_DELETE_FORBIDDEN';
  end if;
  if target_profile.role = 'super_admin'
    and target_profile.account_status = 'active'
    and private.active_super_admin_count() <= 1
  then
    raise exception using message = 'LAST_ACTIVE_SUPER_ADMIN';
  end if;

  -- The profile row lock makes this reference check fresh: concurrent FK
  -- inserts must wait for the subsequent delete and then fail if it commits.
  reference_counts := private.account_reference_counts(p_target_id);
  if (reference_counts ->> 'total_blocking')::bigint > 0 then
    raise exception using
      message = 'ACCOUNT_HAS_REFERENCES',
      detail = reference_counts::text;
  end if;

  snapshot := jsonb_build_object(
    'name', target_profile.name,
    'email', target_profile.email,
    'role', target_profile.role
  );
  audit_id := private.insert_team_admin_audit(
    'team_member_deleted',
    p_actor_id,
    p_actor_id,
    p_target_id,
    snapshot,
    p_reason,
    'Akun anggota tim dihapus permanen',
    jsonb_build_object(
      'result', 'database_deleted',
      'before', jsonb_build_object(
        'id', target_profile.id,
        'role', target_profile.role,
        'account_status', target_profile.account_status
      ),
      'after', null,
      'reference_counts', reference_counts
    )
  );

  delete from public.profiles
  where id = p_target_id;

  return jsonb_build_object(
    'id', p_target_id,
    'action', 'delete_eligible_account',
    'audit_id', audit_id,
    'target_snapshot', snapshot,
    'reference_counts', reference_counts
  );
end;
$$;

revoke all privileges on function private.is_active_super_admin(uuid)
from public, anon, authenticated;
revoke all privileges on function private.account_ownership_counts(uuid)
from public, anon, authenticated;
revoke all privileges on function private.insert_team_admin_audit(
  public.activity_kind,
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  text,
  jsonb
) from public, anon, authenticated;
revoke all privileges on function private.create_team_member_profile(
  uuid,
  uuid,
  text,
  text,
  text,
  public.app_role
) from public, anon, authenticated;
revoke all privileges on function private.update_team_member_profile(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all privileges on function private.change_team_member_role(
  uuid,
  uuid,
  public.app_role,
  text
) from public, anon, authenticated;
revoke all privileges on function private.set_team_member_status(
  uuid,
  uuid,
  public.account_status,
  text
) from public, anon, authenticated;
revoke all privileges on function private.delete_eligible_account(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function private.is_active_super_admin(uuid) to service_role;
grant execute on function private.account_ownership_counts(uuid) to service_role;
grant execute on function private.insert_team_admin_audit(
  public.activity_kind,
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  text,
  jsonb
) to service_role;
grant execute on function private.create_team_member_profile(
  uuid,
  uuid,
  text,
  text,
  text,
  public.app_role
) to service_role;
grant execute on function private.update_team_member_profile(
  uuid,
  uuid,
  text,
  text
) to service_role;
grant execute on function private.change_team_member_role(
  uuid,
  uuid,
  public.app_role,
  text
) to service_role;
grant execute on function private.set_team_member_status(
  uuid,
  uuid,
  public.account_status,
  text
) to service_role;
grant execute on function private.delete_eligible_account(
  uuid,
  uuid,
  text
) to service_role;

create or replace function public.admin_create_team_member_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_name text,
  p_email text,
  p_initials text,
  p_role public.app_role
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_team_member_profile(
    p_actor_id,
    p_target_id,
    p_name,
    p_email,
    p_initials,
    p_role
  );
$$;

create or replace function public.admin_update_team_member_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_name text,
  p_initials text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.update_team_member_profile(
    p_actor_id,
    p_target_id,
    p_name,
    p_initials
  );
$$;

create or replace function public.admin_change_team_member_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_role public.app_role,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.change_team_member_role(
    p_actor_id,
    p_target_id,
    p_role,
    p_reason
  );
$$;

create or replace function public.admin_set_team_member_status(
  p_actor_id uuid,
  p_target_id uuid,
  p_account_status public.account_status,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_team_member_status(
    p_actor_id,
    p_target_id,
    p_account_status,
    p_reason
  );
$$;

create or replace function public.admin_delete_eligible_account(
  p_actor_id uuid,
  p_target_id uuid,
  p_reason text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.delete_eligible_account(
    p_actor_id,
    p_target_id,
    p_reason
  );
$$;

revoke all privileges on function public.admin_create_team_member_profile(
  uuid,
  uuid,
  text,
  text,
  text,
  public.app_role
) from public, anon, authenticated;
revoke all privileges on function public.admin_update_team_member_profile(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all privileges on function public.admin_change_team_member_role(
  uuid,
  uuid,
  public.app_role,
  text
) from public, anon, authenticated;
revoke all privileges on function public.admin_set_team_member_status(
  uuid,
  uuid,
  public.account_status,
  text
) from public, anon, authenticated;
revoke all privileges on function public.admin_delete_eligible_account(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.admin_create_team_member_profile(
  uuid,
  uuid,
  text,
  text,
  text,
  public.app_role
) to service_role;
grant execute on function public.admin_update_team_member_profile(
  uuid,
  uuid,
  text,
  text
) to service_role;
grant execute on function public.admin_change_team_member_role(
  uuid,
  uuid,
  public.app_role,
  text
) to service_role;
grant execute on function public.admin_set_team_member_status(
  uuid,
  uuid,
  public.account_status,
  text
) to service_role;
grant execute on function public.admin_delete_eligible_account(
  uuid,
  uuid,
  text
) to service_role;
