-- Link an already-released Sales Order to the current Closed Won Quotation
-- that produced it. This is the correction/manual counterpart to
-- create_sales_order(p_source_commercial_document_id): it writes the same
-- canonical FK, so existing revision-lock and analytics consumers continue to
-- work without a second relationship model.

create function public.link_sales_order_to_quotation(
  p_sales_order_id uuid,
  p_quotation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_sales_order public.sales_orders%rowtype;
  v_quotation public.commercial_documents%rowtype;
begin
  v_actor_role := public.current_user_role();
  if v_actor_id is null
    or v_actor_role is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;

  select *
  into v_sales_order
  from public.sales_orders
  where id = p_sales_order_id
    and deleted_at is null
  for update;

  if not found then
    raise exception using message = 'SALES_ORDER_NOT_FOUND';
  end if;
  if v_actor_role = 'sales' and v_sales_order.owner_id <> v_actor_id then
    raise exception using message = 'SALES_ORDER_OWNERSHIP_REQUIRED';
  end if;
  if v_sales_order.source_commercial_document_id is not null then
    raise exception using message = 'SALES_ORDER_ALREADY_LINKED';
  end if;

  select *
  into v_quotation
  from public.commercial_documents
  where id = p_quotation_id
  for update;

  if not found then
    raise exception using message = 'QUOTATION_NOT_FOUND';
  end if;
  if v_actor_role = 'sales' and v_quotation.owner_id <> v_actor_id then
    raise exception using message = 'QUOTATION_OWNERSHIP_REQUIRED';
  end if;
  if v_quotation.type <> 'Quotation'
    or v_quotation.stage <> 'Closed Won'
    or not v_quotation.is_current_revision
    or v_quotation.deleted_at is not null
  then
    raise exception using message = 'CURRENT_CLOSED_WON_QUOTATION_REQUIRED';
  end if;
  if v_quotation.client_id <> v_sales_order.client_id then
    raise exception using message = 'QUOTATION_CLIENT_MISMATCH';
  end if;
  if exists (
    select 1
    from public.sales_orders
    where source_commercial_document_id = v_quotation.id
  ) then
    raise exception using message = 'QUOTATION_ALREADY_HAS_SALES_ORDER';
  end if;

  begin
    update public.sales_orders
    set source_commercial_document_id = v_quotation.id,
        updated_at = now()
    where id = v_sales_order.id
    returning * into v_sales_order;
  exception
    when unique_violation then
      raise exception using message = 'QUOTATION_ALREADY_HAS_SALES_ORDER';
  end;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    commercial_document_id,
    sales_order_id,
    title,
    detail
  ) values (
    'sales_order_header_change',
    v_sales_order.owner_id,
    v_actor_id,
    v_sales_order.client_id,
    v_quotation.id,
    v_sales_order.id,
    'Quotation dihubungkan ke Sales Order',
    jsonb_build_object(
      'so_number', v_sales_order.so_number,
      'quotation_id', v_quotation.id,
      'quotation_number', v_quotation.quotation_number,
      'change', 'source_commercial_document_linked'
    )::text
  );

  return to_jsonb(v_sales_order);
end;
$$;

revoke all on function public.link_sales_order_to_quotation(uuid, uuid)
from public, anon;
grant execute on function public.link_sales_order_to_quotation(uuid, uuid)
to authenticated, service_role;

comment on function public.link_sales_order_to_quotation(uuid, uuid) is
'Atomically links one active released Sales Order to one active current Closed Won same-client Quotation. Sales may link only owned rows; Manager and Super Admin may link company-wide. Existing links are immutable through this command.';
