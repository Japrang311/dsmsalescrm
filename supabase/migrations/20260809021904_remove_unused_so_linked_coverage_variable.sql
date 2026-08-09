-- Redefine only to remove a PL/pgSQL lint warning from the unused
-- v_so_linked variable. Output and access semantics stay unchanged.
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

  select count(*)
  into v_so_total
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
