-- Migration: add_activity_feed_events_view
--
-- Stage 3 pagination: the Activity Log page (src/routes/_app.activity.tsx)
-- currently fetches the *entire* activity_log and follow_up_logs tables,
-- merges them into one timeline in the browser (buildActivityFeed), and
-- filters/searches that in-memory array. This view moves the merge, the
-- feed-kind classification, and a search haystack into the database so the
-- page can read one bounded, filtered, server-sorted page instead.
--
-- security_invoker = true is required: without it, a view defaults to
-- running with the view owner's privileges, which would silently bypass
-- the row-level security on activity_log/follow_up_logs/clients/profiles
-- for every caller. With it, each underlying table reference is evaluated
-- under the querying user's own RLS, exactly like the two separate
-- listActivityLog()/listAllFollowUps() reads it replaces.
--
-- Rows whose db_kind has no feed-kind mapping (client_details_change,
-- task_progress, sales_order_header_change, sales_order_item_change) are
-- excluded entirely, matching the existing behavior of
-- activityFeedEvent() in src/lib/data/activity-feed.ts, which returns
-- undefined for those kinds and is filtered out before rendering.

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
      when 'client_status_change' then 'status_change'
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
        when 'client_status_change' then 'Perubahan Status'
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
'Unified, RLS-scoped, search-ready feed of activity_log + follow_up_logs for the paginated Activity Log page. security_invoker so RLS applies per caller. Excludes db_kinds with no feed-kind mapping (client_details_change, task_progress, sales_order_header_change, sales_order_item_change), matching the prior client-side filter in activity-feed.ts.';

grant select on public.activity_feed_events to authenticated;
revoke select on public.activity_feed_events from anon, public;
