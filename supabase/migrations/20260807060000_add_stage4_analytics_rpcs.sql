-- Stage 4 Task 4.4: RLS-scoped analytics RPCs per the approved metric
-- dictionary (docs/decisions/2026-08-07-stage-4-metric-dictionary-proposal.md).
--
-- All six functions are `security definer` (they bypass commercial_documents/
-- sales_orders/activity_log RLS to compute aggregates) and therefore must
-- self-enforce the same owner scoping those tables' RLS policies apply --
-- RLS does not cover security-definer calls. Follows the exact pattern
-- fixed in 20260806100000_fix_sales_and_pipeline_metrics_owner_scoping.sql:
-- look up current_user_role(), force sales callers to auth.uid(), reject a
-- null/deactivated role outright (fail-closed), leave manager/executive/
-- super_admin unrestricted (including p_owner_id = null for company-wide).
--
-- No legacy backfill anywhere: cycle-time/funnel/dwell metrics only ever
-- read from source_commercial_document_id, customer_po_date, and the
-- structured commercial_item_stage_change activity_log event_data -- rows
-- missing those fields are excluded and counted, never inferred or treated
-- as zero (spec 7.2/7.5).

-- ---------------------------------------------------------------------------
-- 1. Win/loss count, value, and rate (Metrics 1-2)
-- ---------------------------------------------------------------------------
create or replace function public.commercial_win_loss_metrics(
  p_from date default null,
  p_to date default null,
  p_owner_id uuid default null,
  p_client_id uuid default null
)
returns table (
  won_count bigint,
  won_value numeric,
  lost_count bigint,
  lost_value numeric,
  terminal_count bigint,
  win_rate numeric
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
    raise exception 'commercial_win_loss_metrics requires an active profile'
      using errcode = '42501';
  end if;
  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    count(*) filter (where cd.stage = 'Closed Won')::bigint,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage = 'Closed Won'
    ), 0)::numeric,
    count(*) filter (where cd.stage = 'Closed Lost')::bigint,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage = 'Closed Lost'
    ), 0)::numeric,
    count(*)::bigint,
    case
      when count(*) = 0 then null
      else round(
        count(*) filter (where cd.stage = 'Closed Won')::numeric
          / count(*)::numeric,
        4
      )
    end
  from public.commercial_documents cd
  cross join lateral (
    select coalesce(sum(cdi.line_total), 0) as total_value
    from public.commercial_document_items cdi
    where cdi.commercial_document_id = cd.id
  ) items_total
  where cd.type = 'Quotation'
    and cd.is_current_revision = true
    and cd.deleted_at is null
    and cd.stage in ('Closed Won', 'Closed Lost')
    and (p_from is null or cd.document_date >= p_from)
    and (p_to is null or cd.document_date <= p_to)
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_id is null or cd.client_id = p_client_id);
end;
$$;

comment on function public.commercial_win_loss_metrics(date, date, uuid, uuid) is
'Stage 4 Metric 1-2: win/loss count, value, and rate for terminal (Closed Won/Lost) current-revision Quotations. Sales callers forced to their own owner_id. No lineage dependency -- available for all history.';

revoke all privileges on function public.commercial_win_loss_metrics(date, date, uuid, uuid)
  from public, anon;
grant execute on function public.commercial_win_loss_metrics(date, date, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lost-reason breakdown (Metric 3)
-- ---------------------------------------------------------------------------
create or replace function public.commercial_lost_reason_metrics(
  p_from date default null,
  p_to date default null,
  p_owner_id uuid default null,
  p_client_id uuid default null
)
returns table (
  lost_reason text,
  lost_count bigint,
  lost_value numeric
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
    raise exception 'commercial_lost_reason_metrics requires an active profile'
      using errcode = '42501';
  end if;
  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    coalesce(cd.lost_reason, 'Belum diklasifikasi'),
    count(*)::bigint,
    coalesce(sum(items_total.total_value), 0)::numeric
  from public.commercial_documents cd
  cross join lateral (
    select coalesce(sum(cdi.line_total), 0) as total_value
    from public.commercial_document_items cdi
    where cdi.commercial_document_id = cd.id
  ) items_total
  where cd.type = 'Quotation'
    and cd.is_current_revision = true
    and cd.deleted_at is null
    and cd.stage = 'Closed Lost'
    and (p_from is null or cd.document_date >= p_from)
    and (p_to is null or cd.document_date <= p_to)
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_id is null or cd.client_id = p_client_id)
  group by cd.lost_reason;
end;
$$;

comment on function public.commercial_lost_reason_metrics(date, date, uuid, uuid) is
'Stage 4 Metric 3: Closed Lost count/value grouped by the existing lost_reason contract. Sales callers forced to their own owner_id.';

revoke all privileges on function public.commercial_lost_reason_metrics(date, date, uuid, uuid)
  from public, anon;
grant execute on function public.commercial_lost_reason_metrics(date, date, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cycle-time distributions (Metrics 4-6)
-- ---------------------------------------------------------------------------
-- Population is every Sales Order in the period (matching sales_orders_
-- metrics' p_from/p_to on so.date). Each leg has its own eligible subset;
-- rows outside that subset are excluded and counted, never treated as zero.
create or replace function public.commercial_cycle_time_metrics(
  p_from date default null,
  p_to date default null,
  p_owner_id uuid default null,
  p_client_id uuid default null
)
returns table (
  leg text,
  median_days numeric,
  p75_days numeric,
  p90_days numeric,
  included_count bigint,
  excluded_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
  v_total_count bigint;
begin
  if v_role is null then
    raise exception 'commercial_cycle_time_metrics requires an active profile'
      using errcode = '42501';
  end if;
  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  select count(*) into v_total_count
  from public.sales_orders so
  where so.deleted_at is null
    and (p_from is null or so.date >= p_from)
    and (p_to is null or so.date <= p_to)
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id);

  return query
  with pop as (
    select
      so.source_commercial_document_id,
      so.customer_po_date,
      so.date as so_date,
      cd.document_date as quote_date
    from public.sales_orders so
    left join public.commercial_documents cd
      on cd.id = so.source_commercial_document_id
    where so.deleted_at is null
      and (p_from is null or so.date >= p_from)
      and (p_to is null or so.date <= p_to)
      and (v_owner_id is null or so.owner_id = v_owner_id)
      and (p_client_id is null or so.client_id = p_client_id)
  )
  select
    'quote_to_po'::text,
    (percentile_cont(0.5) within group (
      order by (customer_po_date - quote_date)
    ) filter (where source_commercial_document_id is not null and customer_po_date is not null))::numeric,
    (percentile_cont(0.75) within group (
      order by (customer_po_date - quote_date)
    ) filter (where source_commercial_document_id is not null and customer_po_date is not null))::numeric,
    (percentile_cont(0.9) within group (
      order by (customer_po_date - quote_date)
    ) filter (where source_commercial_document_id is not null and customer_po_date is not null))::numeric,
    count(*) filter (where source_commercial_document_id is not null and customer_po_date is not null)::bigint,
    (v_total_count - count(*) filter (where source_commercial_document_id is not null and customer_po_date is not null))::bigint
  from pop
  union all
  select
    'po_to_so'::text,
    (percentile_cont(0.5) within group (
      order by (so_date - customer_po_date)
    ) filter (where source_commercial_document_id is not null and customer_po_date is not null))::numeric,
    (percentile_cont(0.75) within group (
      order by (so_date - customer_po_date)
    ) filter (where source_commercial_document_id is not null and customer_po_date is not null))::numeric,
    (percentile_cont(0.9) within group (
      order by (so_date - customer_po_date)
    ) filter (where source_commercial_document_id is not null and customer_po_date is not null))::numeric,
    count(*) filter (where source_commercial_document_id is not null and customer_po_date is not null)::bigint,
    (v_total_count - count(*) filter (where source_commercial_document_id is not null and customer_po_date is not null))::bigint
  from pop
  union all
  select
    'quote_to_so'::text,
    (percentile_cont(0.5) within group (
      order by (so_date - quote_date)
    ) filter (where source_commercial_document_id is not null))::numeric,
    (percentile_cont(0.75) within group (
      order by (so_date - quote_date)
    ) filter (where source_commercial_document_id is not null))::numeric,
    (percentile_cont(0.9) within group (
      order by (so_date - quote_date)
    ) filter (where source_commercial_document_id is not null))::numeric,
    count(*) filter (where source_commercial_document_id is not null)::bigint,
    (v_total_count - count(*) filter (where source_commercial_document_id is not null))::bigint
  from pop;
end;
$$;

comment on function public.commercial_cycle_time_metrics(date, date, uuid, uuid) is
'Stage 4 Metrics 4-6: Quote->PO, PO->SO, and Quote->SO cycle-time distributions (median/p75/p90 days) over Sales Orders in the period. Excludes unlinked SOs (no source_commercial_document_id) and SOs missing customer_po_date, counted separately, never treated as zero. Sales callers forced to their own owner_id.';

revoke all privileges on function public.commercial_cycle_time_metrics(date, date, uuid, uuid)
  from public, anon;
grant execute on function public.commercial_cycle_time_metrics(date, date, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Stage-entry funnel, event-based (Metric 7)
-- ---------------------------------------------------------------------------
create or replace function public.commercial_stage_funnel_metrics(
  p_from date default null,
  p_to date default null,
  p_owner_id uuid default null,
  p_client_id uuid default null
)
returns table (
  stage text,
  entered_count bigint
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
    raise exception 'commercial_stage_funnel_metrics requires an active profile'
      using errcode = '42501';
  end if;
  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    al.event_data ->> 'to_stage' as stage,
    count(distinct al.commercial_document_id)::bigint
  from public.activity_log al
  where al.kind = 'commercial_item_stage_change'
    and al.event_data is not null
    and al.commercial_document_id is not null
    and (p_from is null or (al.event_data ->> 'effective_at')::timestamptz >= p_from)
    and (p_to is null or (al.event_data ->> 'effective_at')::timestamptz < (p_to + 1))
    and (v_owner_id is null or al.owner_id = v_owner_id)
    and (p_client_id is null or al.client_id = p_client_id)
  group by al.event_data ->> 'to_stage';
end;
$$;

comment on function public.commercial_stage_funnel_metrics(date, date, uuid, uuid) is
'Stage 4 Metric 7: distinct-document stage-entry funnel from structured commercial_item_stage_change events (effective_from 2026-08-05). Pre-cutover stage history has no event and is silently absent here, not folded into any stage -- see commercial_analytics_coverage for the exclusion count. Sales callers forced to their own owner_id.';

revoke all privileges on function public.commercial_stage_funnel_metrics(date, date, uuid, uuid)
  from public, anon;
grant execute on function public.commercial_stage_funnel_metrics(date, date, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Stage dwell time, completed vs open (Metric 8)
-- ---------------------------------------------------------------------------
create or replace function public.commercial_stage_dwell_metrics(
  p_owner_id uuid default null,
  p_client_id uuid default null
)
returns table (
  stage text,
  completed_median_days numeric,
  completed_count bigint,
  open_median_days numeric,
  open_count bigint
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
    raise exception 'commercial_stage_dwell_metrics requires an active profile'
      using errcode = '42501';
  end if;
  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  with events as (
    select
      al.commercial_document_id,
      al.event_data ->> 'to_stage' as stage,
      (al.event_data ->> 'effective_at')::timestamptz as effective_at,
      lead((al.event_data ->> 'effective_at')::timestamptz) over (
        partition by al.commercial_document_id
        order by (al.event_data ->> 'effective_at')::timestamptz
      ) as next_effective_at
    from public.activity_log al
    where al.kind = 'commercial_item_stage_change'
      and al.event_data is not null
      and al.commercial_document_id is not null
      and (v_owner_id is null or al.owner_id = v_owner_id)
      and (p_client_id is null or al.client_id = p_client_id)
  )
  select
    e.stage,
    (percentile_cont(0.5) within group (
      order by (extract(epoch from (e.next_effective_at - e.effective_at)) / 86400.0)
    ) filter (where e.next_effective_at is not null))::numeric,
    count(*) filter (where e.next_effective_at is not null)::bigint,
    (percentile_cont(0.5) within group (
      order by (extract(epoch from (now() - e.effective_at)) / 86400.0)
    ) filter (where e.next_effective_at is null))::numeric,
    count(*) filter (where e.next_effective_at is null)::bigint
  from events e
  group by e.stage;
end;
$$;

comment on function public.commercial_stage_dwell_metrics(uuid, uuid) is
'Stage 4 Metric 8: stage dwell time in days from consecutive structured stage events (effective_from 2026-08-05). Completed dwell is a closed interval between two events; open dwell (still accruing, no next event yet) is reported separately, never merged into completed dwell. Sales callers forced to their own owner_id.';

revoke all privileges on function public.commercial_stage_dwell_metrics(uuid, uuid)
  from public, anon;
grant execute on function public.commercial_stage_dwell_metrics(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Data-quality / coverage panel (Metric 9)
-- ---------------------------------------------------------------------------
create or replace function public.commercial_analytics_coverage(
  p_from date default null,
  p_to date default null,
  p_owner_id uuid default null,
  p_client_id uuid default null
)
returns table (
  metric_name text,
  analytics_effective_from date,
  included_count bigint,
  excluded_count bigint,
  exclusion_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
  v_terminal_count bigint;
  v_so_total bigint;
  v_so_linked bigint;
  v_so_linked_with_po bigint;
  v_quotation_total bigint;
  v_quotation_with_event bigint;
begin
  if v_role is null then
    raise exception 'commercial_analytics_coverage requires an active profile'
      using errcode = '42501';
  end if;
  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  select count(*) into v_terminal_count
  from public.commercial_documents cd
  where cd.type = 'Quotation'
    and cd.is_current_revision = true
    and cd.deleted_at is null
    and cd.stage in ('Closed Won', 'Closed Lost')
    and (p_from is null or cd.document_date >= p_from)
    and (p_to is null or cd.document_date <= p_to)
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_id is null or cd.client_id = p_client_id);

  select count(*), count(*) filter (where so.source_commercial_document_id is not null)
  into v_so_total, v_so_linked
  from public.sales_orders so
  where so.deleted_at is null
    and (p_from is null or so.date >= p_from)
    and (p_to is null or so.date <= p_to)
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id);

  select count(*)
  into v_so_linked_with_po
  from public.sales_orders so
  where so.deleted_at is null
    and so.source_commercial_document_id is not null
    and so.customer_po_date is not null
    and (p_from is null or so.date >= p_from)
    and (p_to is null or so.date <= p_to)
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id);

  select count(*)
  into v_quotation_total
  from public.commercial_documents cd
  where cd.type = 'Quotation'
    and cd.is_current_revision = true
    and cd.deleted_at is null
    and (p_from is null or cd.document_date >= p_from)
    and (p_to is null or cd.document_date <= p_to)
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_id is null or cd.client_id = p_client_id);

  select count(*)
  into v_quotation_with_event
  from public.commercial_documents cd
  where cd.type = 'Quotation'
    and cd.is_current_revision = true
    and cd.deleted_at is null
    and (p_from is null or cd.document_date >= p_from)
    and (p_to is null or cd.document_date <= p_to)
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_id is null or cd.client_id = p_client_id)
    and exists (
      select 1 from public.activity_log al
      where al.commercial_document_id = cd.id
        and al.kind = 'commercial_item_stage_change'
        and al.event_data is not null
    );

  return query values
    ('win_loss'::text, null::date, v_terminal_count, 0::bigint, null::text),
    ('lost_reason'::text, null::date, v_terminal_count, 0::bigint, null::text),
    (
      'cycle_time'::text,
      date '2026-08-07',
      v_so_linked_with_po,
      v_so_total - v_so_linked_with_po,
      'missing source_quotation_id or customer_po_date'::text
    ),
    (
      'funnel'::text,
      date '2026-08-05',
      v_quotation_with_event,
      v_quotation_total - v_quotation_with_event,
      'no structured stage event recorded (pre-2026-08-05 history)'::text
    ),
    (
      'dwell'::text,
      date '2026-08-05',
      v_quotation_with_event,
      v_quotation_total - v_quotation_with_event,
      'no structured stage event recorded (pre-2026-08-05 history)'::text
    );
end;
$$;

comment on function public.commercial_analytics_coverage(date, date, uuid, uuid) is
'Stage 4 Metric 9: per-metric analytics_effective_from, included/excluded row counts, and exclusion reason for the data-quality panel. Sales callers forced to their own owner_id.';

revoke all privileges on function public.commercial_analytics_coverage(date, date, uuid, uuid)
  from public, anon;
grant execute on function public.commercial_analytics_coverage(date, date, uuid, uuid)
  to authenticated;
