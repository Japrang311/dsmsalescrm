alter table public.activity_log
  drop constraint if exists activity_log_administrative_reason_required;

alter table public.activity_log
  add constraint activity_log_administrative_reason_required
  check (
    kind not in (
      'team_member_created',
      'team_member_profile_updated',
      'team_member_role_changed',
      'team_member_deactivated',
      'team_member_reactivated',
      'team_member_ownership_transferred',
      'team_member_deleted',
      'team_member_password_reset'
    )
    or (
      administrative_reason is not null
      and btrim(administrative_reason) <> ''
    )
  );

create or replace view public.activity_feed_events
with (security_invoker = true) as
select * from (
  select
    'activity-' || al.id as event_id,
    'activity_log' as source,
    al.id as source_id,
    al.created_at as at,
    case al.kind
      when 'client_created' then 'client_created'
      when 'client_status_change' then
        case
          when btrim(split_part(split_part(coalesce(al.detail, ''), E'\n', 1), ' → ', 1))
            in ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order')
            and btrim(split_part(split_part(coalesce(al.detail, ''), E'\n', 1), ' → ', 2))
              in ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order')
            then 'status_change'
          else 'ownership_change'
        end
      when 'client_owner_change' then 'ownership_change'
      when 'commercial_item_created' then 'commercial_created'
      when 'commercial_item_stage_change' then 'commercial_history'
      when 'task_created' then 'task_created'
      when 'task_status_change' then 'task_history'
      when 'sales_order_created' then 'order_created'
      when 'sales_order_tax_change' then 'so_tax_change'
      when 'commercial_document_deleted' then 'record_lifecycle'
      when 'commercial_document_restored' then 'record_lifecycle'
      when 'sales_order_deleted' then 'record_lifecycle'
      when 'sales_order_restored' then 'record_lifecycle'
      when 'team_member_created' then 'team_admin'
      when 'team_member_profile_updated' then 'team_admin'
      when 'team_member_role_changed' then 'team_admin'
      when 'team_member_deactivated' then 'team_admin'
      when 'team_member_reactivated' then 'team_admin'
      when 'team_member_ownership_transferred' then 'team_admin'
      when 'team_member_deleted' then 'team_admin'
      when 'team_member_password_reset' then 'team_admin'
      else null
    end as feed_kind,
    al.kind::text as db_kind,
    al.client_id,
    al.owner_id,
    al.actor_id,
    al.target_profile_id,
    al.target_profile_snapshot,
    al.administrative_reason,
    case al.kind
      when 'client_owner_change' then 'Perubahan Owner Client'
      when 'client_status_change' then
        case
          when btrim(split_part(split_part(coalesce(al.detail, ''), E'\n', 1), ' → ', 1))
            in ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order')
            and btrim(split_part(split_part(coalesce(al.detail, ''), E'\n', 1), ' → ', 2))
              in ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order')
            then null
          else 'Perubahan Owner Client'
        end
      when 'team_member_created' then 'Anggota Tim Dibuat'
      when 'team_member_profile_updated' then 'Profil Anggota Tim Diperbarui'
      when 'team_member_role_changed' then 'Role Anggota Tim Diubah'
      when 'team_member_deactivated' then 'Anggota Tim Dinonaktifkan'
      when 'team_member_reactivated' then 'Anggota Tim Diaktifkan Kembali'
      when 'team_member_ownership_transferred'
        then 'Kepemilikan Anggota Tim Dialihkan'
      when 'team_member_deleted' then 'Anggota Tim Dihapus Permanen'
      when 'team_member_password_reset' then 'Kata Sandi Anggota Tim Direset'
      else null
    end as kind_label,
    al.title,
    al.detail,
    coalesce(al.commercial_document_id, al.commercial_item_id)
      as commercial_item_id,
    commercial_doc.type::text as commercial_item_type,
    al.sales_order_id,
    lower(concat_ws(' ',
      al.title, al.detail, al.administrative_reason,
      case al.kind
        when 'client_created' then 'Client Baru'
        when 'client_status_change' then
          case
            when btrim(split_part(split_part(coalesce(al.detail, ''), E'\n', 1), ' → ', 1))
              in ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order')
              and btrim(split_part(split_part(coalesce(al.detail, ''), E'\n', 1), ' → ', 2))
                in ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order')
              then 'Perubahan Status'
            else 'Perubahan Owner Client'
          end
        when 'client_owner_change' then 'Perubahan Owner Client'
        when 'commercial_item_created' then 'Commercial Baru'
        when 'commercial_item_stage_change' then 'Pipeline Update'
        when 'task_created' then 'Task Baru'
        when 'task_status_change' then 'Task Update'
        when 'sales_order_created' then 'Sales Order'
        when 'sales_order_tax_change' then 'Koreksi Pajak SO'
        when 'commercial_document_deleted' then 'Hapus / Pulihkan'
        when 'commercial_document_restored' then 'Hapus / Pulihkan'
        when 'sales_order_deleted' then 'Hapus / Pulihkan'
        when 'sales_order_restored' then 'Hapus / Pulihkan'
        when 'team_member_created' then 'Anggota Tim Dibuat'
        when 'team_member_profile_updated' then 'Profil Anggota Tim Diperbarui'
        when 'team_member_role_changed' then 'Role Anggota Tim Diubah'
        when 'team_member_deactivated' then 'Anggota Tim Dinonaktifkan'
        when 'team_member_reactivated' then 'Anggota Tim Diaktifkan Kembali'
        when 'team_member_ownership_transferred'
          then 'Kepemilikan Anggota Tim Dialihkan'
        when 'team_member_deleted' then 'Anggota Tim Dihapus Permanen'
        when 'team_member_password_reset' then 'Kata Sandi Anggota Tim Direset'
        else null
      end,
      client.name,
      owner_profile.name,
      actor_profile.name,
      target_profile.name
    )) as search_text
  from public.activity_log al
  left join public.clients client on client.id = al.client_id
  left join public.profiles owner_profile on owner_profile.id = al.owner_id
  left join public.profiles actor_profile on actor_profile.id = al.actor_id
  left join public.profiles target_profile
    on target_profile.id = al.target_profile_id
  left join public.commercial_documents commercial_doc
    on commercial_doc.id
      = coalesce(al.commercial_document_id, al.commercial_item_id)

  union all

  select
    'follow-up-' || fu.id as event_id,
    'follow_up_logs' as source,
    fu.id as source_id,
    fu.created_at as at,
    'follow_up' as feed_kind,
    null::text as db_kind,
    fu.client_id,
    fu.owner_id,
    null::uuid as actor_id,
    null::uuid as target_profile_id,
    null::jsonb as target_profile_snapshot,
    null::text as administrative_reason,
    null::text as kind_label,
    (fu.method::text || ' · ' || fu.result::text) as title,
    coalesce(nullif(fu.notes, ''), fu.next_action) as detail,
    coalesce(fu.commercial_document_id, fu.commercial_item_id)
      as commercial_item_id,
    commercial_doc.type::text as commercial_item_type,
    null::uuid as sales_order_id,
    lower(concat_ws(' ',
      fu.method::text, fu.result::text, fu.notes, fu.next_action,
      'Follow-Up',
      client.name,
      owner_profile.name
    )) as search_text
  from public.follow_up_logs fu
  left join public.clients client on client.id = fu.client_id
  left join public.profiles owner_profile on owner_profile.id = fu.owner_id
  left join public.commercial_documents commercial_doc
    on commercial_doc.id
      = coalesce(fu.commercial_document_id, fu.commercial_item_id)
) events
where feed_kind is not null;

comment on view public.activity_feed_events is
'Unified, RLS-scoped, search-ready feed of activity_log + follow_up_logs for the paginated Activity Log page. security_invoker so RLS applies per caller. Excludes db_kinds with no feed-kind mapping (client_details_change, task_progress, sales_order_header_change, sales_order_item_change), and maps client_owner_change as ownership_change.';

grant select on public.activity_feed_events to authenticated;
revoke select on public.activity_feed_events from anon, public;

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
        'team_member_deleted', 'team_member_password_reset'
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
