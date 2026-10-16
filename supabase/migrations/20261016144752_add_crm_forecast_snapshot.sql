-- Task 10a: one server-side scope for the Sales Order value and the current
-- weighted open-pipeline drilldown. Historical periods deliberately return an
-- unavailable pipeline instead of projecting today's open deals into the past.

create function public.crm_forecast_snapshot(
  p_from date,
  p_to date,
  p_owner_id uuid default null,
  p_client_id uuid default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid;
  v_sales_order_value numeric := 0;
  v_open_pipeline_value numeric;
  v_items jsonb := '[]'::jsonb;
  v_page jsonb;
  v_undated jsonb;
  v_overdue jsonb;
  v_current_snapshot boolean;
begin
  if v_role is null or auth.uid() is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_FORECAST_RANGE' using errcode = '22007';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200
     or p_offset is null or p_offset < 0
  then
    raise exception 'INVALID_FORECAST_PAGE' using errcode = '22023';
  end if;

  v_owner_id := case when v_role = 'sales' then auth.uid() else p_owner_id end;
  v_current_snapshot :=
    p_to >= (statement_timestamp() at time zone 'Asia/Jakarta')::date;

  select coalesce(sum(so.total_value), 0)
  into v_sales_order_value
  from public.sales_orders so
  where so.deleted_at is null
    and so.date between p_from and p_to
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id);

  with open_quotations as materialized (
    select
      d.id,
      d.quotation_number,
      d.client_id,
      c.name as client_name,
      d.owner_id,
      p.name as owner_name,
      d.stage,
      d.expected_close_date,
      coalesce(sum(i.line_total), 0)::numeric as total_value,
      case d.stage
        when 'Quotes Sent' then 0.30::numeric
        when 'Negotiation' then 0.55::numeric
        when 'Hot Prospect' then 0.75::numeric
        when 'Commit' then 0.90::numeric
      end as weight
    from public.commercial_documents d
    join public.clients c on c.id = d.client_id
    join public.profiles p on p.id = d.owner_id
    left join public.commercial_document_items i
      on i.commercial_document_id = d.id
    where d.type = 'Quotation'
      and d.is_current_revision
      and d.deleted_at is null
      and d.stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and (v_owner_id is null or d.owner_id = v_owner_id)
      and (p_client_id is null or d.client_id = p_client_id)
    group by d.id, c.name, p.name
  ), summarized as (
    select
      coalesce(sum(total_value * weight) filter (
        where expected_close_date between p_from and p_to
      ), 0)::numeric as pipeline_value,
      count(*) filter (where expected_close_date is null) as undated_count,
      coalesce(sum(total_value) filter (
        where expected_close_date is null
      ), 0)::numeric as undated_value,
      count(*) filter (
        where expected_close_date < (statement_timestamp() at time zone 'Asia/Jakarta')::date
      ) as overdue_count,
      coalesce(sum(total_value) filter (
        where expected_close_date < (statement_timestamp() at time zone 'Asia/Jakarta')::date
      ), 0)::numeric as overdue_value,
      coalesce(sum(total_value * weight) filter (
        where expected_close_date < (statement_timestamp() at time zone 'Asia/Jakarta')::date
      ), 0)::numeric as overdue_weighted_value
    from open_quotations
  ), drilldown_rows as materialized (
    select
      q.*,
      case
        when q.expected_close_date is null then 'undated'
        when q.expected_close_date < (statement_timestamp() at time zone 'Asia/Jakarta')::date then 'overdue'
        else 'scheduled'
      end as bucket,
      coalesce(q.expected_close_date between p_from and p_to, false) as contributes
    from open_quotations q
    where q.expected_close_date is null
       or q.expected_close_date < (statement_timestamp() at time zone 'Asia/Jakarta')::date
       or q.expected_close_date between p_from and p_to
  ), drilldown as (
    select
      coalesce(jsonb_agg(
      jsonb_build_object(
        'documentId', q.id,
        'quotationNumber', q.quotation_number,
        'clientId', q.client_id,
        'clientName', q.client_name,
        'ownerId', q.owner_id,
        'ownerName', q.owner_name,
        'stage', q.stage,
        'expectedCloseDate', q.expected_close_date,
        'totalValue', q.total_value,
        'weight', q.weight,
        'weightedValue', q.total_value * q.weight,
        'bucket', q.bucket,
        'contributes', q.contributes
      ) order by q.expected_close_date nulls last, q.id
      ), '[]'::jsonb) as items,
      coalesce(sum(q.total_value * q.weight) filter (
        where q.contributes
      ), 0)::numeric as contribution_value
    from (
      select *
      from drilldown_rows
      order by expected_close_date nulls last, id
      limit p_limit offset p_offset
    ) q
  ), drilldown_count as (
    select count(*)::integer as total_count from drilldown_rows
  )
  select
    case when v_current_snapshot then s.pipeline_value else null end,
    case when v_current_snapshot then d.items else '[]'::jsonb end,
    jsonb_build_object(
      'count', s.undated_count,
      'totalValue', s.undated_value
    ),
    jsonb_build_object(
      'count', s.overdue_count,
      'totalValue', s.overdue_value,
      'weightedValue', s.overdue_weighted_value
    ),
    jsonb_build_object(
      'limit', p_limit,
      'offset', p_offset,
      'totalCount', case when v_current_snapshot then dc.total_count else 0 end,
      'contributionValue', case
        when v_current_snapshot then d.contribution_value
        else 0
      end
    )
  into v_open_pipeline_value, v_items, v_undated, v_overdue, v_page
  from summarized s
  cross join drilldown d
  cross join drilldown_count dc;

  return jsonb_build_object(
    'snapshotMode', case
      when v_current_snapshot then 'current'
      else 'historical_unavailable'
    end,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'asOfDate', (statement_timestamp() at time zone 'Asia/Jakarta')::date,
    'fetchedAt', statement_timestamp(),
    'salesOrderValue', v_sales_order_value,
    'openPipelineValue', v_open_pipeline_value,
    'forecastValue', case
      when v_current_snapshot
        then v_sales_order_value + v_open_pipeline_value
      else null
    end,
    'undated', v_undated,
    'overdue', v_overdue,
    'page', v_page,
    'items', v_items
  );
end;
$$;

revoke all on function public.crm_forecast_snapshot(
  date, date, uuid, uuid, integer, integer
)
  from public, anon;
grant execute on function public.crm_forecast_snapshot(
  date, date, uuid, uuid, integer, integer
)
  to authenticated;

comment on function public.crm_forecast_snapshot(
  date, date, uuid, uuid, integer, integer
) is
  'Current forecast snapshot: Sales Order value in period plus current open Quotation value weighted by the existing stage contract and expected close date. Historical periods return pipeline/forecast as unavailable rather than back-projecting current pipeline.';
