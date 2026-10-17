-- Task 15: transparent, versioned repeat-order cadence for the D05 pilot.
-- The function is SECURITY DEFINER because current client ownership controls
-- visibility while historical Sales Orders deliberately retain their original
-- owner attribution. Explicit client scoping below is therefore the security
-- boundary; no Sales Order number or cross-owner client detail is returned.

create index if not exists sales_orders_repeat_order_cadence_idx
  on public.sales_orders (client_id, date)
  where deleted_at is null
    and prototype_status is distinct from 'FOC'
    and total_value > 0;

create function public.crm_repeat_order_cadence(
  p_as_of date default null,
  p_owner_id uuid default null,
  p_client_status public.client_status default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid;
  v_as_of date := coalesce(
    p_as_of,
    (statement_timestamp() at time zone 'Asia/Jakarta')::date
  );
  v_window_start date;
  v_totals jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  if v_role is null or auth.uid() is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0
  then
    raise exception 'INVALID_REPEAT_ORDER_PAGE' using errcode = '22023';
  end if;

  v_window_start := v_as_of - 364;
  v_owner_id := case
    when v_role = 'sales' then auth.uid()
    when v_role = 'executive' then null
    else p_owner_id
  end;

  with scoped_clients as materialized (
    select
      c.id as client_id,
      c.name as client_name,
      c.status::text as client_status,
      c.owner_id,
      p.name as owner_name,
      least(
        (c.created_at at time zone 'Asia/Jakarta')::date,
        history.earliest_order_date
      ) as history_observed_from,
      history.latest_order_date
    from public.clients c
    join public.profiles p on p.id = c.owner_id
    cross join lateral (
      select
        min(so.date) as earliest_order_date,
        max(so.date) as latest_order_date
      from public.sales_orders so
      where so.client_id = c.id
        and so.deleted_at is null
        and so.prototype_status is distinct from 'FOC'
        and so.total_value > 0
        and so.date <= v_as_of
    ) history
    where history.earliest_order_date is not null
      and (v_owner_id is null or c.owner_id = v_owner_id)
      and (
        (p_client_status is null and c.status not in ('Dormant', 'Lost'))
        or c.status = p_client_status
      )
  ), order_events as materialized (
    select distinct
      c.client_id,
      c.client_name,
      c.client_status,
      c.owner_id,
      c.owner_name,
      c.history_observed_from,
      so.date as order_date
    from scoped_clients c
    join public.sales_orders so on so.client_id = c.client_id
    where so.deleted_at is null
      and so.prototype_status is distinct from 'FOC'
      and so.total_value > 0
      and so.date between v_window_start and v_as_of
  ), event_intervals as materialized (
    select
      events.*,
      events.order_date - lag(events.order_date) over (
        partition by events.client_id order by events.order_date
      ) as interval_days
    from order_events events
  ), window_rollup as materialized (
    select
      client_id,
      count(*)::integer as sample_count,
      greatest(count(*) - 1, 0)::integer as interval_count,
      percentile_cont(0.5) within group (order by interval_days)
        filter (where interval_days is not null)::numeric
        as raw_median_interval_days
    from event_intervals
    group by client_id
  ), rollup as materialized (
    select
      c.client_id,
      c.client_name,
      c.client_status,
      c.owner_id,
      c.owner_name,
      c.history_observed_from,
      coalesce(w.sample_count, 0) as sample_count,
      coalesce(w.interval_count, 0) as interval_count,
      c.latest_order_date as last_order_date,
      (v_as_of - c.latest_order_date)::integer as days_since_last_order,
      w.raw_median_interval_days
    from scoped_clients c
    left join window_rollup w on w.client_id = c.client_id
  ), cadence as materialized (
    select
      rollup.*,
      case when sample_count >= 4
        then raw_median_interval_days else null end as median_interval_days,
      case when sample_count >= 4 then greatest(
        raw_median_interval_days * 1.5,
        raw_median_interval_days + 7
      ) else null end as overdue_threshold_days
    from rollup
  ), evaluated as materialized (
    select
      cadence.*,
      case
        when sample_count < 4 then 'data_insufficient'
        when days_since_last_order > overdue_threshold_days then 'overdue'
        else 'on_cadence'
      end as state,
      case
        when sample_count < 4 then null
        when days_since_last_order > overdue_threshold_days
          then days_since_last_order - overdue_threshold_days
        else 0
      end as overdue_by_days,
      case when history_observed_from <= v_window_start
        then 'full_window' else 'partial_window' end as history_coverage
    from cadence
  ), results as materialized (
    select
      evaluated.*,
      case
        when state = 'data_insufficient' then
          'Data belum cukup: ' || sample_count ||
          ' dari minimum 4 tanggal order berbeda dalam 365 hari.'
        when state = 'overdue' then
          'Terlambat ' || rtrim(to_char(
            overdue_by_days, 'FM999999999990.99'
          ), '.') || ' hari: ' ||
          days_since_last_order ||
          ' hari sejak order terakhir, melewati ambang ' ||
          rtrim(to_char(
            overdue_threshold_days, 'FM999999999990.99'
          ), '.') || ' hari.'
        else
          'Dalam cadence: ' || days_since_last_order ||
          ' hari sejak order terakhir, ambang ' ||
          rtrim(to_char(
            overdue_threshold_days, 'FM999999999990.99'
          ), '.') || ' hari.'
      end as reason,
      case state
        when 'overdue' then 0
        when 'on_cadence' then 1
        else 2
      end as state_priority
    from evaluated
  ), page_rows as materialized (
    select *
    from results
    order by
      state_priority,
      overdue_by_days desc nulls last,
      last_order_date,
      client_id
    limit p_limit offset p_offset
  )
  select
    jsonb_build_object(
      'candidateCount', count(*)::integer,
      'overdueCount', count(*) filter (where state = 'overdue')::integer,
      'onCadenceCount', count(*) filter (where state = 'on_cadence')::integer,
      'dataInsufficientCount', count(*) filter (
        where state = 'data_insufficient'
      )::integer,
      'partialHistoryCount', count(*) filter (
        where history_coverage = 'partial_window'
      )::integer
    ),
    case when v_role = 'executive' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'clientId', row.client_id,
        'clientName', row.client_name,
        'ownerId', row.owner_id,
        'ownerName', row.owner_name,
        'clientStatus', row.client_status,
        'ruleVersion', 'd05-v1',
        'historyWindowStartDate', v_window_start,
        'historyWindowEndDate', v_as_of,
        'historyObservedFrom', row.history_observed_from,
        'historyCoverage', row.history_coverage,
        'sampleCount', row.sample_count,
        'intervalCount', row.interval_count,
        'lastOrderDate', row.last_order_date,
        'medianIntervalDays', row.median_interval_days,
        'daysSinceLastOrder', row.days_since_last_order,
        'overdueThresholdDays', row.overdue_threshold_days,
        'overdueByDays', row.overdue_by_days,
        'state', row.state,
        'reason', row.reason,
        'sourceHref', '/clients/' || row.client_id
      ) order by
        row.state_priority,
        row.overdue_by_days desc nulls last,
        row.last_order_date,
        row.client_id)
      from page_rows row
    ), '[]'::jsonb) end
  into v_totals, v_items
  from results;

  return jsonb_build_object(
    'asOfDate', v_as_of,
    'fetchedAt', statement_timestamp(),
    'ruleVersion', 'd05-v1',
    'historyWindow', jsonb_build_object(
      'days', 365,
      'startDate', v_window_start,
      'endDate', v_as_of
    ),
    'totals', v_totals,
    'page', jsonb_build_object(
      'limit', p_limit,
      'offset', p_offset,
      'returnedCount', jsonb_array_length(v_items),
      'totalCount', (v_totals ->> 'candidateCount')::integer
    ),
    'items', v_items
  );
end;
$$;

revoke all on function public.crm_repeat_order_cadence(
  date, uuid, public.client_status, integer, integer
) from public, anon;
grant execute on function public.crm_repeat_order_cadence(
  date, uuid, public.client_status, integer, integer
) to authenticated;

comment on function public.crm_repeat_order_cadence(
  date, uuid, public.client_status, integer, integer
) is
  'D05 repeat-order cadence over distinct eligible Sales Order dates. Sales is scoped by current client owner while historical Sales Order ownership remains unchanged; Executive receives aggregate counts only.';
