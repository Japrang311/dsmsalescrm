-- Migration: add_admin_team_summary_rpc
--
-- Stage 3 N+1 fix: listTeamMembers() (src/lib/data/team.ts) fetches all
-- profiles, then for every profile fires 4 more queries (clients count,
-- tasks count, admin_count_active_commercial_items RPC, activity_log last
-- admin change) batched 8-at-a-time. That's 1 + 4*N round trips for a
-- roster that only grows. This RPC computes every member's row in one
-- query using LATERAL joins, mirroring the pipeline_metrics/
-- sales_orders_metrics aggregate-RPC pattern.
--
-- Also fixes a real (if minor) overcounting bug found while building this:
-- the existing private.count_active_commercial_items(uuid) (last redefined
-- in 20260719024024_migrate_commercial_document_data.sql, correctly
-- pointed at commercial_documents) never picked up the deleted_at/
-- is_current_revision filters that Pipeline and Sales Orders both needed
-- once soft-delete and Quotation revisions existed — soft-deleted
-- documents and superseded Quotation revisions were still being counted
-- as "active" for a member's ownership total. This RPC applies the same
-- filters Pipeline/Sales Orders use. The enforcement-side functions that
-- also embed this predicate (private.transfer_active_ownership,
-- private.account_reference_counts / account_ownership_counts,
-- private.delete_eligible_account in
-- 20260718180929_add_account_lifecycle_functions.sql, last touched
-- 20260719024024) are NOT changed here — same staleness, but changing
-- what gates actual deactivate/delete/transfer actions is a bigger,
-- separate decision than fixing a read-only summary display.

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
      and t.workflow_status in ('Open', 'In Progress', 'Waiting External')
      and t.archived = false
  ) tasks_agg on true
  left join lateral (
    select count(*) as n
    from public.commercial_documents cd
    where cd.owner_id = p.id
      and cd.deleted_at is null
      and (cd.type != 'Quotation' or cd.is_current_revision = true)
      and lower(btrim(cd.stage)) not in (
        'closed won', 'closed lost', 'revenue recorded', 'closed'
      )
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
'One-query aggregate replacement for listTeamMembers()''s N+1 per-member fetch (Stage 3). Manager/executive/super_admin only. Also corrects active-commercial-items counting to exclude soft-deleted documents and superseded Quotation revisions, matching Pipeline/Sales Orders.';

revoke all privileges on function public.admin_team_summary() from public, anon;
grant execute on function public.admin_team_summary() to authenticated, service_role;
