-- Task 16: exact client lookup and owner-scoped pilot feedback for D05.
-- Feedback is append-only and never changes client status or creates a Task.

create table public.crm_repeat_order_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  owner_id uuid not null references public.profiles (id),
  actor_id uuid not null references public.profiles (id),
  feedback text not null check (feedback in ('relevant', 'not_relevant')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  rule_version text not null default 'd05-v1' check (rule_version = 'd05-v1'),
  request_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (actor_id, request_id)
);

create index crm_repeat_order_feedback_latest_idx
  on public.crm_repeat_order_feedback (
    client_id, owner_id, created_at desc, id desc
  );

alter table public.crm_repeat_order_feedback enable row level security;

create policy "crm_repeat_order_feedback_select"
on public.crm_repeat_order_feedback
for select
to authenticated
using (
  (
    (select public.current_user_role()) = 'sales'
    and owner_id = (select auth.uid())
    and exists (
      select 1
      from public.clients c
      where c.id = client_id and c.owner_id = (select auth.uid())
    )
  )
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

revoke all on table public.crm_repeat_order_feedback from public, anon;
grant select on table public.crm_repeat_order_feedback to authenticated;
grant select, insert, update, delete on table public.crm_repeat_order_feedback
to service_role;

drop function public.crm_repeat_order_cadence(
  date, uuid, public.client_status, integer, integer
);

create function public.crm_repeat_order_cadence(
  p_as_of date default null,
  p_owner_id uuid default null,
  p_client_status public.client_status default null,
  p_client_id uuid default null,
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
      and (p_client_id is null or c.id = p_client_id)
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
      end as state_priority,
      feedback.feedback as latest_feedback,
      feedback.reason as feedback_reason,
      feedback.rule_version as feedback_rule_version
    from evaluated
    left join lateral (
      select f.feedback, f.reason, f.rule_version
      from public.crm_repeat_order_feedback f
      where f.client_id = evaluated.client_id
        and f.owner_id = evaluated.owner_id
      order by f.created_at desc, f.id desc
      limit 1
    ) feedback on true
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
        'latestFeedback', row.latest_feedback,
        'feedbackReason', row.feedback_reason,
        'feedbackRuleVersion', row.feedback_rule_version,
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
  date, uuid, public.client_status, uuid, integer, integer
) from public, anon;
grant execute on function public.crm_repeat_order_cadence(
  date, uuid, public.client_status, uuid, integer, integer
) to authenticated;

comment on function public.crm_repeat_order_cadence(
  date, uuid, public.client_status, uuid, integer, integer
) is
  'D05 repeat-order cadence with exact client filter and owner-scoped pilot feedback. Executive receives aggregate counts only.';

create function public.record_crm_repeat_order_feedback(
  p_request_id uuid,
  p_client_id uuid,
  p_feedback text,
  p_reason text,
  p_as_of date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role := public.current_user_role();
  v_client public.clients%rowtype;
  v_existing public.crm_repeat_order_feedback%rowtype;
  v_created public.crm_repeat_order_feedback%rowtype;
  v_snapshot jsonb;
begin
  if v_actor_id is null
     or v_actor_role is null
     or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023';
  end if;
  if p_feedback not in ('relevant', 'not_relevant') then
    raise exception 'INVALID_REPEAT_ORDER_FEEDBACK' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REPEAT_ORDER_FEEDBACK_REASON_REQUIRED'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0)
  );

  select * into v_existing
  from public.crm_repeat_order_feedback
  where actor_id = v_actor_id and request_id = p_request_id;

  if found then
    if v_existing.client_id is distinct from p_client_id
       or v_existing.feedback is distinct from p_feedback
       or v_existing.reason is distinct from btrim(p_reason)
    then
      raise exception 'REQUEST_PAYLOAD_MISMATCH' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'clientId', v_existing.client_id,
      'ownerId', v_existing.owner_id,
      'actorId', v_existing.actor_id,
      'feedback', v_existing.feedback,
      'reason', v_existing.reason,
      'ruleVersion', v_existing.rule_version,
      'createdAt', v_existing.created_at
    );
  end if;

  select * into v_client
  from public.clients c
  where c.id = p_client_id
  for update;
  if not found then
    raise exception 'REPEAT_ORDER_CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_actor_role = 'sales' and v_client.owner_id <> v_actor_id then
    raise exception 'CLIENT_OWNERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if not private.is_active_business_owner(v_client.owner_id) then
    raise exception 'ACTIVE_BUSINESS_OWNER_REQUIRED' using errcode = '42501';
  end if;

  v_snapshot := public.crm_repeat_order_cadence(
    p_as_of,
    null,
    null,
    p_client_id,
    1,
    0
  );
  if coalesce(v_snapshot #>> '{items,0,state}', '') <> 'overdue' then
    raise exception 'REPEAT_ORDER_SIGNAL_NOT_OVERDUE' using errcode = '22023';
  end if;

  insert into public.crm_repeat_order_feedback (
    client_id, owner_id, actor_id, feedback, reason, request_id
  ) values (
    p_client_id, v_client.owner_id, v_actor_id, p_feedback,
    btrim(p_reason), p_request_id
  )
  returning * into v_created;

  return jsonb_build_object(
    'id', v_created.id,
    'clientId', v_created.client_id,
    'ownerId', v_created.owner_id,
    'actorId', v_created.actor_id,
    'feedback', v_created.feedback,
    'reason', v_created.reason,
    'ruleVersion', v_created.rule_version,
    'createdAt', v_created.created_at
  );
end;
$$;

revoke all on function public.record_crm_repeat_order_feedback(
  uuid, uuid, text, text, date
) from public, anon;
grant execute on function public.record_crm_repeat_order_feedback(
  uuid, uuid, text, text, date
) to authenticated;

comment on table public.crm_repeat_order_feedback is
  'Append-only owner-scoped relevance feedback for overdue D05 repeat-order signals.';

comment on function public.record_crm_repeat_order_feedback(
  uuid, uuid, text, text, date
) is
  'Idempotent D05 pilot feedback command for a currently overdue client; never mutates client status or creates a Task.';
