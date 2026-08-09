-- Migration: add_sales_orders_trend_rpcs
--
-- Stage 3: Dashboard aggregate RPCs (continued). The Dashboard's revenue
-- trend chart and the four Target charts (YTD cumulative, monthly,
-- single-sales, all-sales) all derive their data from an unbounded
-- listSalesOrders() fetch via monthlyRevenueTrend/ytdCumulativeTrend/
-- targetPerSales in dashboard-selectors.ts. Two new aggregate RPCs replace
-- that client-side reduce(), following the exact self-scoping pattern of
-- sales_orders_metrics/pipeline_metrics (20260806031500 fix): a Sales caller
-- is always forced to their own owner_id regardless of what it requests;
-- manager/executive/super_admin get unrestricted (company-wide) access.

create function public.sales_orders_monthly_trend(
  p_year int default null,
  p_owner_id uuid default null
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
  group by m.month
  order by m.month;
end;
$$;

comment on function public.sales_orders_monthly_trend(int, uuid) is
'Per-month revenue totals (Jan-Dec) for a given year, for the Dashboard revenue trend / target charts. Sales callers are forced to their own owner_id regardless of p_owner_id, matching sales_orders_select RLS.';

grant execute on function public.sales_orders_monthly_trend(int, uuid) to authenticated;
revoke execute on function public.sales_orders_monthly_trend(int, uuid) from anon, public;

create function public.sales_orders_owner_ytd(
  p_year int default null,
  p_owner_id uuid default null
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
  group by so.owner_id;
end;
$$;

comment on function public.sales_orders_owner_ytd(int, uuid) is
'Per-owner YTD revenue totals for the Dashboard "Target All Sales" chart. Sales callers are forced to their own owner_id regardless of p_owner_id, matching sales_orders_select RLS.';

grant execute on function public.sales_orders_owner_ytd(int, uuid) to authenticated;
revoke execute on function public.sales_orders_owner_ytd(int, uuid) from anon, public;
