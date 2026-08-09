-- Migration: add_sales_orders_metrics_rpc
--
-- Stage 3 pagination: aggregate metrics for the Sales Orders & Revenue page
-- header/KPI tiles, replacing client-side computation from an unbounded
-- listSalesOrders() fetch. Follows the pipeline_metrics pattern
-- (20260805120000).

create or replace function public.sales_orders_metrics(
  p_from date default null,
  p_to date default null,
  p_owner_id uuid default null,
  p_client_id uuid default null,
  p_tax_type public.tax_type default null,
  p_so_type public.so_type default null,
  p_source public.revenue_source default null,
  p_deleted boolean default false
)
returns table (
  ppn_value numeric,
  non_ppn_value numeric,
  new_product_value numeric,
  existing_value numeric,
  prototype_paid_value numeric,
  foc_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    coalesce(sum(so.total_value) filter (where so.tax_type = 'PPN'), 0)::numeric,
    coalesce(sum(so.total_value) filter (where so.tax_type = 'Non-PPN'), 0)::numeric,
    coalesce(sum(so.total_value) filter (
      where so.source = 'RFQ / New Product'
    ), 0)::numeric,
    coalesce(sum(so.total_value) filter (
      where so.source = 'Existing / Repeat Order'
    ), 0)::numeric,
    coalesce(sum(so.total_value) filter (
      where so.source = 'Prototype Paid'
    ), 0)::numeric,
    count(*) filter (
      where so.type = 'Prototype' and so.prototype_status = 'FOC'
    )::bigint,
    count(*)::bigint
  from public.sales_orders so
  where (case when p_deleted then so.deleted_at is not null else so.deleted_at is null end)
    and (p_from is null or so.date >= p_from)
    and (p_to is null or so.date <= p_to)
    and (p_owner_id is null or so.owner_id = p_owner_id)
    and (p_client_id is null or so.client_id = p_client_id)
    and (p_tax_type is null or so.tax_type = p_tax_type)
    and (p_so_type is null or so.type = p_so_type)
    and (p_source is null or so.source = p_source);
end;
$$;

comment on function public.sales_orders_metrics(
  date, date, uuid, uuid, public.tax_type, public.so_type,
  public.revenue_source, boolean
) is
'Aggregate Sales Orders KPI metrics (PPN/Non-PPN/source totals, FOC count) for Stage 3 pagination. Replaces client-side computation from an unbounded listSalesOrders() fetch.';

grant execute on function public.sales_orders_metrics(
  date, date, uuid, uuid, public.tax_type, public.so_type,
  public.revenue_source, boolean
) to authenticated;

revoke execute on function public.sales_orders_metrics(
  date, date, uuid, uuid, public.tax_type, public.so_type,
  public.revenue_source, boolean
) from anon, public;
