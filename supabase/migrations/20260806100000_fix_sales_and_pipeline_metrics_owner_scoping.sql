-- Migration: fix_sales_and_pipeline_metrics_owner_scoping
--
-- Security fix: sales_orders_metrics() and pipeline_metrics() are both
-- `security definer` (they bypass sales_orders/commercial_documents RLS) and
-- neither one enforced any role-based owner scoping of its own -- they only
-- filtered by whatever p_owner_id the caller chose to pass. Both pages that
-- call them (Sales Orders, Pipeline) default their owner filter to "all" for
-- every role including Sales, so a Sales rep loading either page saw
-- company-wide totals in the KPI tiles while the row-level table below
-- correctly stayed RLS-scoped to their own book of business -- confirmed
-- live: a Sales fixture user with 0 owned sales orders got back the full
-- company total_count/ppn_value/etc. from sales_orders_metrics() with no
-- owner filter passed.
--
-- Fix: both functions now look up the caller's role via
-- current_user_role() and, for role = 'sales', force the owner filter to
-- auth.uid() regardless of what p_owner_id was requested -- matching the
-- exact scoping sales_orders_select/commercial_documents_select RLS
-- policies apply to the base tables. manager/executive/super_admin keep
-- unrestricted access (including p_owner_id = null for company-wide),
-- matching those same RLS policies. A null/deactivated caller role is
-- rejected outright (fail-closed, same pattern as task_control_loop_metrics
-- and admin_team_summary).

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
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
begin
  if v_role is null then
    raise exception 'sales_orders_metrics requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

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
    and (v_owner_id is null or so.owner_id = v_owner_id)
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
'Aggregate Sales Orders KPI metrics (PPN/Non-PPN/source totals, FOC count) for Stage 3 pagination. Sales callers are forced to their own owner_id regardless of p_owner_id, matching sales_orders_select RLS.';

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
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid := p_owner_id;
begin
  if v_role is null then
    raise exception 'pipeline_metrics requires an active profile'
      using errcode = '42501';
  end if;

  if v_role = 'sales' then
    v_owner_id := auth.uid();
  end if;

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
    and (v_owner_id is null or cd.owner_id = v_owner_id)
    and (p_client_status is null or c.status = p_client_status)
  group by cd.stage;
end;
$$;

comment on function public.pipeline_metrics(uuid, public.client_status) is
'Aggregate Pipeline metrics per stage for Stage 3 pagination. Sales callers are forced to their own owner_id regardless of p_owner_id, matching commercial_documents_select RLS.';
