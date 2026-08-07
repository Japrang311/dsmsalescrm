-- Migration: extend_trend_rpcs_with_report_filters
--
-- Reports route (Executive Reports) gap: its KPI totals card already swaps
-- to sales_orders_metrics (full client/tax/source/soType filter parity),
-- but the trend chart / owner-YTD / top-customers RPCs built for the
-- Dashboard only ever supported year+owner, so those Reports sections
-- couldn't move off an unbounded listSalesOrders() fetch without silently
-- dropping the report's client/tax/source/soType filters. Add the same
-- filter set sales_orders_metrics already has, purely additive (new
-- trailing default-null params -- "no filter" when omitted), so every
-- existing Dashboard caller is unaffected.
--
-- Adding a trailing parameter creates a new overload rather than replacing
-- the existing one (Postgres function identity includes the parameter
-- list), so PostgREST would be unable to disambiguate calls unless the old
-- signature is dropped first (same fix as
-- 20260807010000_add_sales_order_source_quotation_link.sql).

drop function if exists public.sales_orders_monthly_trend(int, uuid);
drop function if exists public.sales_orders_owner_ytd(int, uuid);
drop function if exists public.sales_orders_top_customers(int, uuid, int);
drop function if exists public.sales_task_client_metrics(uuid);

create function public.sales_orders_monthly_trend(
  p_year int default null,
  p_owner_id uuid default null,
  p_client_id uuid default null,
  p_tax_type public.tax_type default null,
  p_so_type public.so_type default null,
  p_source public.revenue_source default null
)
returns table (
  month int,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
  v_year int := coalesce(p_year, extract(year from current_date)::int);
begin
  if v_role is null then
    raise exception 'sales_orders_monthly_trend requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    m.month::int,
    coalesce(sum(so.total_value), 0)::numeric as revenue
  from generate_series(1, 12) as m(month)
  left join public.sales_orders so
    on extract(month from so.date)::int = m.month
    and extract(year from so.date)::int = v_year
    and so.deleted_at is null
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id)
    and (p_tax_type is null or so.tax_type = p_tax_type)
    and (p_so_type is null or so.type = p_so_type)
    and (p_source is null or so.source = p_source)
  group by m.month
  order by m.month;
end;
$$;

comment on function public.sales_orders_monthly_trend(
  int, uuid, uuid, public.tax_type, public.so_type, public.revenue_source
) is
'Per-month revenue totals (Jan-Dec) for a given year, for the Dashboard revenue trend / target charts and the Reports route trend charts. Sales callers are forced to their own owner_id regardless of p_owner_id, matching sales_orders_select RLS.';

grant execute on function public.sales_orders_monthly_trend(
  int, uuid, uuid, public.tax_type, public.so_type, public.revenue_source
) to authenticated;
revoke execute on function public.sales_orders_monthly_trend(
  int, uuid, uuid, public.tax_type, public.so_type, public.revenue_source
) from anon, public;

create function public.sales_orders_owner_ytd(
  p_year int default null,
  p_owner_id uuid default null,
  p_client_id uuid default null,
  p_tax_type public.tax_type default null,
  p_so_type public.so_type default null,
  p_source public.revenue_source default null
)
returns table (
  owner_id uuid,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
  v_year int := coalesce(p_year, extract(year from current_date)::int);
begin
  if v_role is null then
    raise exception 'sales_orders_owner_ytd requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    so.owner_id,
    coalesce(sum(so.total_value), 0)::numeric as revenue
  from public.sales_orders so
  where so.deleted_at is null
    and extract(year from so.date)::int = v_year
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id)
    and (p_tax_type is null or so.tax_type = p_tax_type)
    and (p_so_type is null or so.type = p_so_type)
    and (p_source is null or so.source = p_source)
  group by so.owner_id;
end;
$$;

comment on function public.sales_orders_owner_ytd(
  int, uuid, uuid, public.tax_type, public.so_type, public.revenue_source
) is
'Per-owner YTD revenue totals for the Dashboard "Target All Sales" chart and the Reports route Sales Performance table. Sales callers are forced to their own owner_id regardless of p_owner_id, matching sales_orders_select RLS.';

grant execute on function public.sales_orders_owner_ytd(
  int, uuid, uuid, public.tax_type, public.so_type, public.revenue_source
) to authenticated;
revoke execute on function public.sales_orders_owner_ytd(
  int, uuid, uuid, public.tax_type, public.so_type, public.revenue_source
) from anon, public;

create function public.sales_orders_top_customers(
  p_year int default null,
  p_owner_id uuid default null,
  p_limit int default 5,
  p_client_id uuid default null,
  p_tax_type public.tax_type default null,
  p_so_type public.so_type default null,
  p_source public.revenue_source default null
)
returns table (
  client_id uuid,
  client_name text,
  client_status public.client_status,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
  v_year int := coalesce(p_year, extract(year from current_date)::int);
begin
  if v_role is null then
    raise exception 'sales_orders_top_customers requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    c.id as client_id,
    c.name as client_name,
    c.status as client_status,
    coalesce(sum(so.total_value), 0)::numeric as revenue
  from public.sales_orders so
  join public.clients c on c.id = so.client_id
  where so.deleted_at is null
    and extract(year from so.date)::int = v_year
    and (v_owner_id is null or so.owner_id = v_owner_id)
    and (p_client_id is null or so.client_id = p_client_id)
    and (p_tax_type is null or so.tax_type = p_tax_type)
    and (p_so_type is null or so.type = p_so_type)
    and (p_source is null or so.source = p_source)
  group by c.id, c.name, c.status
  -- coalesce to 0 above matters here: a client whose only 2026 orders are
  -- Prototype FOC (total_value NULL) would otherwise sum() to NULL, and
  -- Postgres defaults NULLS FIRST for DESC — silently pushing zero-revenue
  -- clients to the top of "top customers" ahead of real revenue.
  order by revenue desc
  limit greatest(p_limit, 0);
end;
$$;

comment on function public.sales_orders_top_customers(
  int, uuid, int, uuid, public.tax_type, public.so_type, public.revenue_source
) is
'Top-N clients by YTD sales order revenue, for the Dashboard Top Customers card and the Reports route. Sales callers are forced to their own owner_id.';

grant execute on function public.sales_orders_top_customers(
  int, uuid, int, uuid, public.tax_type, public.so_type, public.revenue_source
) to authenticated;
revoke execute on function public.sales_orders_top_customers(
  int, uuid, int, uuid, public.tax_type, public.so_type, public.revenue_source
) from anon, public;

-- sales_task_client_metrics gains escalated/completed/cancelled counts so
-- the Reports route's Sales Performance table can drop its dependency on
-- an unbounded listTasks() fetch for task-detail columns, same as the
-- Dashboard's version already does for open/overdue/active-clients.
-- completed_tasks/cancelled_tasks intentionally include archived rows
-- (lifetime totals) -- only open_tasks/overdue_tasks/escalated_tasks
-- exclude archived, matching the "still open working set" semantics the
-- existing open/overdue columns already use.
create function public.sales_task_client_metrics(
  p_owner_id uuid default null
)
returns table (
  owner_id uuid,
  open_tasks bigint,
  overdue_tasks bigint,
  escalated_tasks bigint,
  completed_tasks bigint,
  cancelled_tasks bigint,
  active_clients bigint
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
    raise exception 'sales_task_client_metrics requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  with task_cte as (
    select
      t.owner_id,
      count(*) filter (
        where t.workflow_status in ('Open', 'In Progress', 'Waiting External')
          and not t.archived
      )::bigint as open_tasks,
      -- Kept as the same Overdue+Escalated union the Dashboard's existing
      -- "overdue" badge already relies on (backward compatible); escalated
      -- is additionally broken out on its own below for Reports, which
      -- needs the two counts separately.
      count(*) filter (
        where ds.due_state in ('Overdue', 'Escalated') and not t.archived
      )::bigint as overdue_tasks,
      count(*) filter (
        where ds.due_state = 'Escalated' and not t.archived
      )::bigint as escalated_tasks,
      count(*) filter (
        where t.workflow_status = 'Done'
      )::bigint as completed_tasks,
      count(*) filter (
        where t.workflow_status = 'Cancelled'
      )::bigint as cancelled_tasks
    from public.tasks t
    cross join lateral public.compute_task_due_state(t.due_date, t.workflow_status) ds
    where (v_owner_id is null or t.owner_id = v_owner_id)
    group by t.owner_id
  ),
  client_cte as (
    select c.owner_id, count(*)::bigint as active_clients
    from public.clients c
    where c.status != 'Lost'
      and (v_owner_id is null or c.owner_id = v_owner_id)
    group by c.owner_id
  )
  select
    coalesce(task_cte.owner_id, client_cte.owner_id) as owner_id,
    coalesce(task_cte.open_tasks, 0) as open_tasks,
    coalesce(task_cte.overdue_tasks, 0) as overdue_tasks,
    coalesce(task_cte.escalated_tasks, 0) as escalated_tasks,
    coalesce(task_cte.completed_tasks, 0) as completed_tasks,
    coalesce(task_cte.cancelled_tasks, 0) as cancelled_tasks,
    coalesce(client_cte.active_clients, 0) as active_clients
  from task_cte
  full outer join client_cte on client_cte.owner_id = task_cte.owner_id;
end;
$$;

comment on function public.sales_task_client_metrics(uuid) is
'Per-owner open/overdue/escalated task counts, lifetime completed/cancelled task counts, and active (non-Lost) client counts for the Dashboard and Reports Sales Performance tables. Sales callers are forced to their own owner_id.';

grant execute on function public.sales_task_client_metrics(uuid) to authenticated;
revoke execute on function public.sales_task_client_metrics(uuid) from anon, public;
