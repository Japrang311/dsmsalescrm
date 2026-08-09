-- Stage 4 Task 4.2: explicit Customer PO business milestone date.
-- Approved 2026-08-07 (docs/decisions/2026-08-07-stage-4-metric-dictionary-
-- proposal.md): a business date the Sales rep enters when the PO actually
-- lands, separate from customer_po_number (free text) and from
-- sales_orders.date (the SO's own document date). Nullable/additive, no
-- backfill of existing rows -- Stage 4 cycle-time metrics (Quote -> PO,
-- PO -> SO) exclude rows where this is null rather than inferring a value.

alter table public.sales_orders
  add column customer_po_date date;

-- 20260719041351_harden_normalized_document_permissions.sql locked
-- sales_orders UPDATE down to a column allowlist (customer_po_number, date,
-- tax_type, updated_at). Add the new column to that allowlist so
-- updateSalesOrderHeader() can set/clear it; row-level access is still the
-- existing sales_orders_update RLS policy, unaffected by this grant.
grant update (customer_po_date) on table public.sales_orders to authenticated;

-- Adding a new parameter changes create_sales_order's identity (Postgres
-- function identity is name + parameter types), so CREATE OR REPLACE alone
-- would add a second overload instead of extending the existing one, same
-- issue as 20260807010000. Drop the current 12-parameter signature first.
drop function if exists public.create_sales_order(
  uuid, date, text, public.so_type, public.tax_type, public.prototype_status,
  public.revenue_source, public.document_number_mode, text, text, jsonb, uuid
);

create or replace function public.create_sales_order(
  p_client_id uuid,
  p_date date,
  p_customer_po_number text,
  p_type public.so_type,
  p_tax_type public.tax_type,
  p_prototype_status public.prototype_status,
  p_source public.revenue_source,
  p_number_mode public.document_number_mode,
  p_manual_so_number text,
  p_backdate_reason text,
  p_items jsonb,
  p_source_commercial_document_id uuid default null,
  p_customer_po_date date default null
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
  v_owner_id uuid;
  v_client_name text;
  v_sales_order_id uuid;
  v_number text;
  v_is_foc boolean;
  v_total numeric := 0;
  v_item jsonb;
  v_position integer := 0;
  v_result jsonb;
begin
  v_actor_role := public.current_user_role();
  -- Explicit null check first: `null not in (...)` is null, not true, so the
  -- gate below alone lets a deactivated or profile-less caller through.
  if v_actor_role is null then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;
  if v_actor_id is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;
  if p_date is null then
    raise exception using message = 'DOCUMENT_DATE_REQUIRED';
  end if;
  if nullif(btrim(p_customer_po_number), '') is null then
    raise exception using message = 'CUSTOMER_PO_NUMBER_REQUIRED';
  end if;
  if p_number_mode is null
    or p_number_mode not in ('Manual', 'Hariff Backdate')
  then
    raise exception using message = 'MANUAL_SO_NUMBER_MODE_REQUIRED';
  end if;
  if nullif(btrim(p_manual_so_number), '') is null then
    raise exception using message = 'SO_NUMBER_REQUIRED';
  end if;

  select owner_id, name into v_owner_id, v_client_name
  from public.clients
  where id = p_client_id;
  if not found then
    raise exception using message = 'CLIENT_NOT_FOUND';
  end if;
  if v_actor_role = 'sales' and v_owner_id <> v_actor_id then
    raise exception using message = 'CLIENT_OWNERSHIP_REQUIRED';
  end if;

  v_is_foc := p_type = 'Prototype'
    and p_prototype_status is not distinct from 'FOC';
  if p_type = 'Prototype' and p_prototype_status is null then
    raise exception using message = 'PROTOTYPE_STATUS_REQUIRED';
  end if;
  if p_type = 'Regular' and p_prototype_status is not null then
    raise exception using message = 'REGULAR_PROTOTYPE_STATUS_MUST_BE_NULL';
  end if;
  perform private.assert_document_items(p_items, not v_is_foc);

  if p_number_mode = 'Hariff Backdate' then
    if v_client_name <> 'PT. HARIFF DAYA TUNGGAL ENGINEERING' then
      raise exception using message = 'HARIFF_BACKDATE_CLIENT_REQUIRED';
    end if;
    if nullif(btrim(p_backdate_reason), '') is null then
      raise exception using message = 'HARIFF_BACKDATE_REASON_REQUIRED';
    end if;
  elsif p_backdate_reason is not null then
    raise exception using message = 'BACKDATE_REASON_NOT_ALLOWED';
  end if;

  v_number := btrim(p_manual_so_number);
  if exists (
    select 1 from public.sales_orders
    where so_number = v_number
  ) then
    raise exception using message = 'SO_NUMBER_ALREADY_EXISTS';
  end if;

  if not v_is_foc then
    select sum(
      (value ->> 'qty')::numeric * (value ->> 'unitPrice')::numeric
    )
    into v_total
    from jsonb_array_elements(p_items);
  end if;

  begin
    insert into public.sales_orders (
      so_number,
      customer_po_number,
      customer_po_date,
      date,
      client_id,
      owner_id,
      type,
      tax_type,
      prototype_status,
      source,
      number_mode,
      backdate_reason,
      total_value,
      source_commercial_document_id
    ) values (
      v_number,
      btrim(p_customer_po_number),
      p_customer_po_date,
      p_date,
      p_client_id,
      v_owner_id,
      p_type,
      p_tax_type,
      p_prototype_status,
      p_source,
      p_number_mode,
      nullif(btrim(p_backdate_reason), ''),
      case when v_is_foc then null else v_total end,
      p_source_commercial_document_id
    )
    returning id into v_sales_order_id;
  exception
    when unique_violation then
      if sqlerrm like '%sales_orders_source_commercial_document_id_key%' then
        raise exception using message = 'QUOTATION_ALREADY_HAS_SALES_ORDER';
      end if;
      raise;
  end;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    insert into public.sales_order_items (
      sales_order_id,
      product_name,
      description,
      qty,
      uom,
      unit_price,
      line_total,
      line_position
    ) values (
      v_sales_order_id,
      btrim(v_item ->> 'productName'),
      nullif(btrim(v_item ->> 'description'), ''),
      (v_item ->> 'qty')::numeric,
      (v_item ->> 'uom')::public.uom_type,
      case when v_is_foc then null else (v_item ->> 'unitPrice')::numeric end,
      case
        when v_is_foc then null
        else (v_item ->> 'qty')::numeric
          * (v_item ->> 'unitPrice')::numeric
      end,
      v_position
    );
  end loop;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    sales_order_id,
    title,
    detail
  ) values (
    'sales_order_created',
    v_owner_id,
    v_actor_id,
    p_client_id,
    v_sales_order_id,
    case
      when p_number_mode = 'Hariff Backdate'
        then 'Sales Order Backdate dibuat'
      else 'Sales Order dibuat'
    end,
    jsonb_build_object(
      'so_number', v_number,
      'number_mode', p_number_mode,
      'backdate_reason', p_backdate_reason,
      'source_commercial_document_id', p_source_commercial_document_id,
      'customer_po_date', p_customer_po_date
    )::text
  );

  select to_jsonb(s) || jsonb_build_object(
    'items',
    (
      select jsonb_agg(to_jsonb(i) order by i.line_position)
      from public.sales_order_items i
      where i.sales_order_id = s.id
    )
  )
  into v_result
  from public.sales_orders s
  where s.id = v_sales_order_id;

  return v_result;
end;
$$;

comment on function public.create_sales_order(
  uuid, date, text, public.so_type, public.tax_type, public.prototype_status,
  public.revenue_source, public.document_number_mode, text, text, jsonb, uuid,
  date
) is
'Creates a Sales Order, optionally linked back to the Quotation it originated from via p_source_commercial_document_id, and optionally recording the Customer PO business milestone date via p_customer_po_date. A Quotation can be linked to at most one Sales Order (unique constraint); a second attempt raises QUOTATION_ALREADY_HAS_SALES_ORDER.';

-- DROP FUNCTION discards any explicit grants on the old signature (see
-- 20260807020000_restore_create_sales_order_execute_grant.sql for the same
-- issue on the prior signature change). Restore the anon/public revoke on
-- the new 13-parameter signature so this security-definer RPC stays closed
-- to unauthenticated callers.
revoke all privileges on function public.create_sales_order(
  uuid, date, text, public.so_type, public.tax_type, public.prototype_status,
  public.revenue_source, public.document_number_mode, text, text, jsonb, uuid,
  date
) from public, anon;

grant execute on function public.create_sales_order(
  uuid, date, text, public.so_type, public.tax_type, public.prototype_status,
  public.revenue_source, public.document_number_mode, text, text, jsonb, uuid,
  date
) to authenticated;
