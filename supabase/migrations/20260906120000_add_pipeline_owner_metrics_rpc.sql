-- Migration: add_pipeline_owner_metrics_rpc
--
-- The Pipeline "Performa per owner" panel has never shown data: the client
-- component hard-coded an empty list because pipeline_metrics() only returns
-- per-stage aggregates, and the paginated board only holds a partial slice of
-- each column (so client-side owner aggregation would be wrong). This adds a
-- dedicated per-owner aggregate RPC.
--
-- Same security model as pipeline_metrics() (20260806100000): security
-- definer + set search_path = '', reject a null/deactivated caller role
-- (fail-closed), and force a Sales caller to its own owner_id regardless of
-- p_owner_id -- matching commercial_documents_select RLS. manager /
-- executive / super_admin keep unrestricted access. The implicit PUBLIC
-- execute grant is revoked and re-granted to `authenticated` only, matching
-- 20260730120000_revoke_anon_execute_on_privileged_rpcs.

create or replace function public.pipeline_owner_metrics(
  p_owner_id uuid default null,
  p_client_status public.client_status default null
)
returns table (
  owner_id uuid,
  owner_name text,
  total_value numeric,
  open_value numeric,
  won_value numeric,
  lost_value numeric,
  open_count bigint,
  won_count bigint,
  lost_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
begin
  if v_role is null then
    raise exception 'pipeline_owner_metrics requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    cd.owner_id,
    coalesce(p.name, '—') as owner_name,
    coalesce(sum(items_total.total_value), 0)::numeric as total_value,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage not in ('Closed Won', 'Closed Lost')
    ), 0)::numeric as open_value,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage = 'Closed Won'
    ), 0)::numeric as won_value,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage = 'Closed Lost'
    ), 0)::numeric as lost_value,
    count(*) filter (
      where cd.stage not in ('Closed Won', 'Closed Lost')
    )::bigint as open_count,
    count(*) filter (where cd.stage = 'Closed Won')::bigint as won_count,
    count(*) filter (where cd.stage = 'Closed Lost')::bigint as lost_count
  from public.commercial_documents cd
  cross join lateral (
    select coalesce(sum(cdi.line_total), 0) as total_value
    from public.commercial_document_items cdi
    where cdi.commercial_document_id = cd.id
  ) items_total
  left join public.clients c on c.id = cd.client_id
  left join public.profiles p on p.id = cd.owner_id
  where cd.deleted_at is null
    and cd.type != 'RFQ'
    -- Only count current Quotation revisions; non-Quotation types always counted
    and (cd.type != 'Quotation' or cd.is_current_revision = true)
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_status is null or c.status = p_client_status)
  group by cd.owner_id, p.name
  order by total_value desc;
end;
$$;

comment on function public.pipeline_owner_metrics(uuid, public.client_status) is
'Aggregate Pipeline metrics grouped by owner for the "Performa per owner" panel. Sales callers are forced to their own owner_id regardless of p_owner_id, matching commercial_documents_select RLS.';

revoke execute on function public.pipeline_owner_metrics(uuid, public.client_status)
from public, anon;

grant execute on function public.pipeline_owner_metrics(uuid, public.client_status)
to authenticated;
