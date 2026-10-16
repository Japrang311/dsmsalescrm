-- Additive endpoint: Dashboard's year-based endpoints remain compatible.
create function public.crm_report_metrics(
  p_from date, p_to date, p_owner_id uuid default null,
  p_client_id uuid default null, p_tax_type public.tax_type default null,
  p_so_type public.so_type default null, p_source public.revenue_source default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb; v_role public.app_role := public.current_user_role();
begin
  if v_role is null then raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'INVALID_METRIC_RANGE'; end if;
  with scoped as materialized (
    select so.* from public.sales_orders so
    where so.deleted_at is null and so.date between p_from and p_to
      and (v_role = 'sales' or p_owner_id is null or so.owner_id=p_owner_id)
      and (p_client_id is null or so.client_id=p_client_id)
      and (p_tax_type is null or so.tax_type=p_tax_type)
      and (p_so_type is null or so.type=p_so_type)
      and (p_source is null or so.source=p_source)
  ), customers as (
    select s.client_id, max(c.name) client_name, sum(coalesce(s.total_value,0)) revenue from scoped s left join public.client_search_index c on c.id=s.client_id group by s.client_id
  ), owners as (
    select s.owner_id, sum(coalesce(s.total_value,0)) revenue from scoped s group by s.owner_id
  ), months as (
    select to_char(m.period,'YYYY-MM') period, coalesce(sum(s.total_value),0) revenue
    from generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),interval '1 month') m(period)
    left join scoped s on date_trunc('month',s.date::timestamp)=m.period group by m.period
  ) select jsonb_build_object(
    'total',coalesce(sum(s.total_value),0),
    'ppn',coalesce(sum(s.total_value) filter(where s.tax_type='PPN'),0),
    'nonPpn',coalesce(sum(s.total_value) filter(where s.tax_type='Non-PPN'),0),
    'newProduct',coalesce(sum(s.total_value) filter(where s.source='RFQ / New Product'),0),
    'existing',coalesce(sum(s.total_value) filter(where s.source='Existing / Repeat Order'),0),
    'protoPaid',coalesce(sum(s.total_value) filter(where s.type='Prototype' and s.prototype_status='Paid'),0),
    'totalCount',count(*),
    'protoFocCount',count(*) filter(where s.type='Prototype' and s.prototype_status='FOC'),
    'protoPaidCount',count(*) filter(where s.type='Prototype' and s.prototype_status='Paid'),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('clientId',c.client_id,'clientName',c.client_name,'revenue',c.revenue) order by c.revenue desc,c.client_id) from (select * from customers order by revenue desc,client_id limit 5) c),'[]'::jsonb),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('ownerId',o.owner_id,'revenue',o.revenue) order by o.owner_id) from owners o),'[]'::jsonb),
    'months',coalesce((select jsonb_agg(jsonb_build_object('period',m.period,'revenue',m.revenue) order by m.period) from months m),'[]'::jsonb),
    'fetchedAt',statement_timestamp()
  ) into v_result from scoped s;
  return v_result;
end; $$;
revoke all on function public.crm_report_metrics(date,date,uuid,uuid,public.tax_type,public.so_type,public.revenue_source) from public,anon;
grant execute on function public.crm_report_metrics(date,date,uuid,uuid,public.tax_type,public.so_type,public.revenue_source) to authenticated;
