-- Migration: add_pipeline_metrics_rpc
--
-- Stage 3 pagination: aggregate metrics for Pipeline header/analytics,
-- replacing client-side computation from unbounded full-list fetch.
-- Follows the task_control_loop_metrics pattern (20260727150000).

create or replace function public.pipeline_metrics(
  p_owner_id uuid default null,
  p_client_status public.client_status default null
)
returns table (
  stage text,
  item_count bigint,
  total_value numeric,
  open_value numeric,
  won_value numeric,
  lost_value numeric,
  won_count bigint,
  lost_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    cd.stage::text,
    count(*)::bigint as item_count,
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
    count(*) filter (where cd.stage = 'Closed Won')::bigint as won_count,
    count(*) filter (where cd.stage = 'Closed Lost')::bigint as lost_count
  from public.commercial_documents cd
  cross join lateral (
    select coalesce(sum(cdi.line_total), 0) as total_value
    from public.commercial_document_items cdi
    where cdi.commercial_document_id = cd.id
  ) items_total
  left join public.clients c on c.id = cd.client_id
  where cd.deleted_at is null
    and cd.type != 'RFQ'
    -- Only count current Quotation revisions; non-Quotation types always counted
    and (cd.type != 'Quotation' or cd.is_current_revision = true)
    and (p_owner_id is null or cd.owner_id = p_owner_id)
    and (p_client_status is null or c.status = p_client_status)
  group by cd.stage;
end;
$$;

comment on function public.pipeline_metrics(uuid, public.client_status) is
'Aggregate Pipeline metrics per stage for Stage 3 pagination. Replaces client-side computation from unbounded commercial_documents fetch. Excludes superseded Quotation revisions and soft-deleted documents.';

grant execute on function public.pipeline_metrics(uuid, public.client_status)
  to authenticated;

revoke execute on function public.pipeline_metrics(uuid, public.client_status)
  from anon, public;
