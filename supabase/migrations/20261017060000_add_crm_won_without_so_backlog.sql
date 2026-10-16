-- Task 11: exact current backlog for Closed Won Quotations that do not have an
-- active Sales Order. A soft-deleted linked SO remains a separate review
-- exception because the unique lineage constraint intentionally prevents a
-- second SO from being created for the same Quotation.

create function public.crm_won_without_so_backlog(
  p_owner_id uuid default null,
  p_client_status public.client_status default null,
  p_document_ids uuid[] default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid;
  v_totals jsonb;
  v_items jsonb;
  v_requested_states jsonb;
begin
  if v_role is null or auth.uid() is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200
     or p_offset is null or p_offset < 0
  then
    raise exception 'INVALID_WON_BACKLOG_PAGE' using errcode = '22023';
  end if;
  if p_document_ids is not null and cardinality(p_document_ids) > 200 then
    raise exception 'TOO_MANY_WON_BACKLOG_DOCUMENT_IDS' using errcode = '22023';
  end if;

  v_owner_id := case when v_role = 'sales' then auth.uid() else p_owner_id end;

  with scoped_documents as materialized (
    select
      d.id,
      d.quotation_number,
      d.client_id,
      c.name as client_name,
      d.owner_id,
      p.name as owner_name,
      d.document_date,
      d.updated_at,
      coalesce(items_total.total_value, 0)::numeric as total_value,
      so.id as sales_order_id,
      so.so_number as sales_order_number,
      so.deleted_at as sales_order_deleted_at,
      case
        when so.id is null then 'missing'
        when so.deleted_at is null then 'linked'
        else 'deleted_link'
      end as link_status
    from public.commercial_documents d
    join public.clients c on c.id = d.client_id
    join public.profiles p on p.id = d.owner_id
    cross join lateral (
      select coalesce(sum(i.line_total), 0) as total_value
      from public.commercial_document_items i
      where i.commercial_document_id = d.id
    ) items_total
    left join public.sales_orders so
      on so.source_commercial_document_id = d.id
    where d.type = 'Quotation'
      and d.stage = 'Closed Won'
      and d.is_current_revision
      and d.deleted_at is null
      and (v_owner_id is null or d.owner_id = v_owner_id)
      and (p_client_status is null or c.status = p_client_status)
  ), exceptions as materialized (
    select *
    from scoped_documents
    where link_status in ('missing', 'deleted_link')
  ), page_rows as materialized (
    select *
    from exceptions
    order by
      case link_status when 'deleted_link' then 0 else 1 end,
      updated_at,
      id
    limit p_limit offset p_offset
  )
  select
    jsonb_build_object(
      'exceptionCount', count(*)::integer,
      'exceptionValue', coalesce(sum(total_value), 0),
      'missingCount', count(*) filter (where link_status = 'missing')::integer,
      'missingValue', coalesce(sum(total_value) filter (
        where link_status = 'missing'
      ), 0),
      'deletedLinkCount', count(*) filter (
        where link_status = 'deleted_link'
      )::integer,
      'deletedLinkValue', coalesce(sum(total_value) filter (
        where link_status = 'deleted_link'
      ), 0)
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'documentId', row.id,
        'quotationNumber', row.quotation_number,
        'clientId', row.client_id,
        'clientName', row.client_name,
        'ownerId', row.owner_id,
        'ownerName', row.owner_name,
        'documentDate', row.document_date,
        'updatedAt', row.updated_at,
        'totalValue', row.total_value,
        'status', row.link_status,
        'salesOrderId', row.sales_order_id,
        'salesOrderNumber', row.sales_order_number,
        'salesOrderDeletedAt', row.sales_order_deleted_at
      ) order by
        case row.link_status when 'deleted_link' then 0 else 1 end,
        row.updated_at,
        row.id)
      from page_rows row
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'documentId', requested.id,
        'status', requested.link_status,
        'salesOrderId', requested.sales_order_id,
        'salesOrderNumber', requested.sales_order_number,
        'salesOrderDeletedAt', requested.sales_order_deleted_at
      ) order by requested.id)
      from scoped_documents requested
      where p_document_ids is not null
        and requested.id = any(p_document_ids)
    ), '[]'::jsonb)
  into v_totals, v_items, v_requested_states
  from exceptions;

  return jsonb_build_object(
    'fetchedAt', statement_timestamp(),
    'totals', v_totals,
    'page', jsonb_build_object(
      'limit', p_limit,
      'offset', p_offset,
      'totalCount', (v_totals ->> 'exceptionCount')::integer
    ),
    'items', v_items,
    'requestedStates', v_requested_states
  );
end;
$$;

revoke all on function public.crm_won_without_so_backlog(
  uuid, public.client_status, uuid[], integer, integer
)
  from public, anon;
grant execute on function public.crm_won_without_so_backlog(
  uuid, public.client_status, uuid[], integer, integer
)
  to authenticated;

comment on function public.crm_won_without_so_backlog(
  uuid, public.client_status, uuid[], integer, integer
) is
  'Exact current Closed Won Quotation backlog without an active Sales Order. Missing links and soft-deleted linked Sales Orders are separate exceptions; Sales callers are forced to their own owner scope.';
