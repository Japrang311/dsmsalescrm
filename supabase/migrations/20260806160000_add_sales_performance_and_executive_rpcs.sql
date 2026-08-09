-- Migration: add_sales_performance_and_executive_rpcs
--
-- Stage 3: Dashboard aggregate RPCs (continued). Three new self-scoped
-- aggregates (same current_user_role()/auth.uid() pattern as every other
-- Stage 3 metrics RPC) replace client-side reduce() over the unbounded
-- orders/tasks/items/clients arrays for:
--   - SalesPerformanceTable: per-owner open/overdue task counts and active
--     client counts (revenue reuses the existing sales_orders_owner_ytd).
--   - TopCustomersCard: top-N clients by YTD revenue (was an in-memory
--     Map + sort over every order).
--   - RiskAlertsCard: the three threshold checks (overdue tasks, big
--     pending Commit-stage items, dormant high-value clients) it renders
--     as alerts, done as plain counts/sums instead of scanning full arrays.
-- ForecastVsAchievementCard and QuotationFunnelCard need no new RPC --
-- both are recomputable client-side from pipeline_metrics/sales_orders_
-- metrics output already fetched elsewhere on the page.

create function public.sales_task_client_metrics(
  p_owner_id uuid default null
)
returns table (
  owner_id uuid,
  open_tasks bigint,
  overdue_tasks bigint,
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
      count(*) filter (
        where ds.due_state in ('Overdue', 'Escalated') and not t.archived
      )::bigint as overdue_tasks
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
    coalesce(client_cte.active_clients, 0) as active_clients
  from task_cte
  full outer join client_cte on client_cte.owner_id = task_cte.owner_id;
end;
$$;

comment on function public.sales_task_client_metrics(uuid) is
'Per-owner open/overdue task counts and active (non-Lost) client counts for the Dashboard Sales Performance table. Sales callers are forced to their own owner_id.';

grant execute on function public.sales_task_client_metrics(uuid) to authenticated;
revoke execute on function public.sales_task_client_metrics(uuid) from anon, public;

create function public.sales_orders_top_customers(
  p_year int default null,
  p_owner_id uuid default null,
  p_limit int default 5
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
    sum(so.total_value)::numeric as revenue
  from public.sales_orders so
  join public.clients c on c.id = so.client_id
  where so.deleted_at is null
    and extract(year from so.date)::int = v_year
    and (v_owner_id is null or so.owner_id = v_owner_id)
  group by c.id, c.name, c.status
  order by revenue desc
  limit greatest(p_limit, 0);
end;
$$;

comment on function public.sales_orders_top_customers(int, uuid, int) is
'Top-N clients by YTD sales order revenue, for the Dashboard Top Customers card. Sales callers are forced to their own owner_id.';

grant execute on function public.sales_orders_top_customers(int, uuid, int) to authenticated;
revoke execute on function public.sales_orders_top_customers(int, uuid, int) from anon, public;

create function public.dashboard_risk_alert_counts(
  p_owner_id uuid default null
)
returns table (
  overdue_task_count bigint,
  big_pending_commit_count bigint,
  big_pending_commit_value numeric,
  dormant_high_value_client_count bigint
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
    raise exception 'dashboard_risk_alert_counts requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

  return query
  select
    (
      select count(*)
      from public.tasks t
      cross join lateral public.compute_task_due_state(t.due_date, t.workflow_status) ds
      where ds.due_state in ('Overdue', 'Escalated')
        and not t.archived
        and (v_owner_id is null or t.owner_id = v_owner_id)
    )::bigint as overdue_task_count,
    coalesce((
      select count(*)
      from public.commercial_documents cd
      cross join lateral (
        select coalesce(sum(cdi.line_total), 0) as total_value
        from public.commercial_document_items cdi
        where cdi.commercial_document_id = cd.id
      ) items_total
      where cd.deleted_at is null
        and cd.type != 'RFQ'
        and (cd.type != 'Quotation' or cd.is_current_revision = true)
        and cd.stage = 'Commit'
        and items_total.total_value > 400000000
        and (v_owner_id is null or cd.owner_id = v_owner_id)
    ), 0)::bigint as big_pending_commit_count,
    coalesce((
      select sum(items_total.total_value)
      from public.commercial_documents cd
      cross join lateral (
        select coalesce(sum(cdi.line_total), 0) as total_value
        from public.commercial_document_items cdi
        where cdi.commercial_document_id = cd.id
      ) items_total
      where cd.deleted_at is null
        and cd.type != 'RFQ'
        and (cd.type != 'Quotation' or cd.is_current_revision = true)
        and cd.stage = 'Commit'
        and items_total.total_value > 400000000
        and (v_owner_id is null or cd.owner_id = v_owner_id)
    ), 0)::numeric as big_pending_commit_value,
    (
      select count(*)
      from public.clients c
      where c.status = 'Dormant'
        and c.spending_ytd > 100000000
        and (v_owner_id is null or c.owner_id = v_owner_id)
    )::bigint as dormant_high_value_client_count;
end;
$$;

comment on function public.dashboard_risk_alert_counts(uuid) is
'Threshold counts backing the Dashboard Risk Alerts card (overdue tasks, big pending Commit-stage items, dormant high-value clients). Sales callers are forced to their own owner_id.';

grant execute on function public.dashboard_risk_alert_counts(uuid) to authenticated;
revoke execute on function public.dashboard_risk_alert_counts(uuid) from anon, public;
