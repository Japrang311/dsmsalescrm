alter table public.activity_log
  drop constraint if exists activity_log_stage_event_data_valid;

alter table public.activity_log
  add constraint activity_log_event_data_valid
  check (
    event_data is null
    or (
      kind = 'commercial_item_stage_change'::public.activity_kind
      and jsonb_typeof(event_data) = 'object'
      and event_data ? 'schema_version'
      and event_data ? 'from_stage'
      and event_data ? 'to_stage'
      and event_data ? 'effective_at'
      and (event_data ->> 'schema_version') = '1'
      and jsonb_typeof(event_data -> 'from_stage') = 'string'
      and nullif(btrim(event_data ->> 'from_stage'), '') is not null
      and jsonb_typeof(event_data -> 'to_stage') = 'string'
      and nullif(btrim(event_data ->> 'to_stage'), '') is not null
      and (event_data ->> 'from_stage') <> (event_data ->> 'to_stage')
      and jsonb_typeof(event_data -> 'effective_at') = 'string'
      and nullif(btrim(event_data ->> 'effective_at'), '') is not null
    )
    or (
      kind = 'client_owner_change'::public.activity_kind
      and jsonb_typeof(event_data) = 'object'
      and event_data ? 'schema_version'
      and event_data ? 'old_owner_id'
      and event_data ? 'new_owner_id'
      and event_data ? 'effective_at'
      and (event_data ->> 'schema_version') = '1'
      and jsonb_typeof(event_data -> 'old_owner_id') = 'string'
      and jsonb_typeof(event_data -> 'new_owner_id') = 'string'
      and nullif(btrim(event_data ->> 'old_owner_id'), '') is not null
      and nullif(btrim(event_data ->> 'new_owner_id'), '') is not null
      and (event_data ->> 'old_owner_id') <> (event_data ->> 'new_owner_id')
      and jsonb_typeof(event_data -> 'effective_at') = 'string'
      and nullif(btrim(event_data ->> 'effective_at'), '') is not null
      and (
        not (event_data ? 'note')
        or (
          jsonb_typeof(event_data -> 'note') = 'string'
          and nullif(btrim(event_data ->> 'note'), '') is not null
        )
      )
    )
  );

grant insert (
  event_data
) on table public.activity_log to authenticated;

create or replace function public.reassign_client_owner(
  p_client_id uuid,
  p_new_owner_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_caller_role public.app_role := public.current_user_role();
  v_client_name text;
  v_old_owner_id uuid;
  v_old_owner_name text;
  v_new_owner_name text;
  v_note text := nullif(btrim(p_note), '');
  v_effective_at timestamptz := statement_timestamp();
begin
  if v_actor_id is null
    or v_caller_role is null
    or v_caller_role not in ('manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;

  select c.owner_id, c.name, p.name
  into v_old_owner_id, v_client_name, v_old_owner_name
  from public.clients c
  left join public.profiles p on p.id = c.owner_id
  where c.id = p_client_id
  for update of c;

  if not found then
    raise exception 'Klien tidak ditemukan'
      using errcode = 'P0002';
  end if;

  select name into v_new_owner_name
  from public.profiles
  where id = p_new_owner_id
    and account_status = 'active'
    and role in ('sales', 'manager');

  if not found then
    raise exception 'Sales tujuan tidak valid'
      using errcode = 'P0002';
  end if;

  if v_old_owner_id = p_new_owner_id then
    raise exception using message = 'CLIENT_OWNER_UNCHANGED';
  end if;

  update public.clients
  set owner_id = p_new_owner_id
  where id = p_client_id;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    title,
    detail,
    event_data
  ) values (
    'client_owner_change',
    p_new_owner_id,
    v_actor_id,
    p_client_id,
    format('%s direassign ke %s', v_client_name, v_new_owner_name),
    v_note,
    jsonb_strip_nulls(jsonb_build_object(
      'schema_version', 1,
      'old_owner_id', v_old_owner_id,
      'old_owner_name', v_old_owner_name,
      'new_owner_id', p_new_owner_id,
      'new_owner_name', v_new_owner_name,
      'note', v_note,
      'effective_at', to_char(v_effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
  );
end;
$$;

revoke execute on function public.reassign_client_owner(uuid, uuid, text)
from public, anon;

grant execute on function public.reassign_client_owner(uuid, uuid, text)
to authenticated;

drop function if exists public.reassign_client_owner(uuid, uuid);

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
