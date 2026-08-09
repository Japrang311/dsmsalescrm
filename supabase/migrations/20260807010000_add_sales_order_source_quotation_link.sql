-- Migration: add_sales_order_source_quotation_link
--
-- Feature: Pipeline Closed Won -> Create Sales Order (Stage 3 follow-up
-- work item). Adds the missing lineage between a won Quotation and the
-- Sales Order it produces, per user decision (2026-08-06): mandatory,
-- one Quotation -> at most one Sales Order.
--
-- - sales_orders.source_commercial_document_id: nullable (the direct-create
--   / repeat-order flow legitimately has no source Quotation) but UNIQUE,
--   so a second SO can never be linked to an already-linked Quotation.
-- - create_sales_order gains an optional trailing p_source_commercial_
--   document_id param (CREATE OR REPLACE can append a defaulted param
--   without a drop, unlike changing return type or existing param shapes).
--   A unique-violation on insert is caught and re-raised as a clear
--   application error instead of a raw Postgres constraint message.
-- - revise_quotation is extended with the mirror-image business rule (not
--   a data-integrity concern, since revising creates a new document row
--   with a new id -- the old row's SO link stays intact either way, but
--   the user does not want a won-and-SO'd Quotation revisable at all):
--   reject the revision outright if any Sales Order already references
--   this Quotation as its source.

alter table public.sales_orders
  add column source_commercial_document_id uuid
    references public.commercial_documents (id),
  add constraint sales_orders_source_commercial_document_id_key
    unique (source_commercial_document_id);

-- Adding a trailing parameter creates a new overload rather than replacing
-- the existing one (Postgres function identity includes the parameter
-- list), which left PostgREST unable to disambiguate calls. Drop the old
-- 11-parameter signature explicitly first.
drop function if exists public.create_sales_order(
  uuid, date, text, public.so_type, public.tax_type, public.prototype_status,
  public.revenue_source, public.document_number_mode, text, text, jsonb
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
  p_source_commercial_document_id uuid default null
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
      'source_commercial_document_id', p_source_commercial_document_id
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
  public.revenue_source, public.document_number_mode, text, text, jsonb, uuid
) is
'Creates a Sales Order, optionally linked back to the Quotation it originated from via p_source_commercial_document_id. A Quotation can be linked to at most one Sales Order (unique constraint); a second attempt raises QUOTATION_ALREADY_HAS_SALES_ORDER.';

-- revise_quotation: mirror-image business rule. Not a data-integrity
-- concern (revising creates a new document row; the old row's SO link, if
-- any, stays intact regardless) -- this is a deliberate process rule: once
-- a Quotation has a linked Sales Order, price/discount changes must not
-- happen via revision anymore.
create or replace function public.revise_quotation(
  p_document_id uuid,
  p_document_date date,
  p_client_address text,
  p_so_number text,
  p_note text,
  p_items jsonb,
  p_next_action text,
  p_next_action_date date
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
  v_current public.commercial_documents%rowtype;
  v_document_id uuid;
  v_revision integer;
  v_number text;
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
  if p_document_date is null then
    raise exception using message = 'DOCUMENT_DATE_REQUIRED';
  end if;
  if nullif(btrim(p_next_action), '') is null then
    raise exception using message = 'NEXT_ACTION_REQUIRED';
  end if;
  if p_next_action_date is null then
    raise exception using message = 'NEXT_ACTION_DATE_REQUIRED';
  end if;
  perform private.assert_document_items(p_items, true);

  select * into v_current
  from public.commercial_documents
  where id = p_document_id
    and type = 'Quotation'
    and is_current_revision
  for update;
  if not found then
    raise exception using message = 'CURRENT_QUOTATION_REQUIRED';
  end if;
  if v_actor_role = 'sales' and v_current.owner_id <> v_actor_id then
    raise exception using message = 'DOCUMENT_OWNERSHIP_REQUIRED';
  end if;
  if exists (
    select 1 from public.sales_orders
    where source_commercial_document_id = v_current.id
  ) then
    raise exception using message = 'QUOTATION_ALREADY_HAS_SALES_ORDER';
  end if;

  select coalesce(max(quotation_revision), 0) + 1
  into v_revision
  from public.commercial_documents
  where quotation_base_number = v_current.quotation_base_number;
  v_number := format(
    '%s_REV.%s',
    v_current.quotation_base_number,
    v_revision
  );

  update public.commercial_documents
  set is_current_revision = false,
      updated_at = now()
  where id = v_current.id;

  insert into public.commercial_documents (
    client_id,
    owner_id,
    type,
    source_flow,
    document_date,
    quotation_number,
    quotation_base_number,
    quotation_revision,
    is_current_revision,
    supersedes_document_id,
    stage,
    client_address,
    so_number,
    note
  ) values (
    v_current.client_id,
    v_current.owner_id,
    'Quotation',
    v_current.source_flow,
    p_document_date,
    v_number,
    v_current.quotation_base_number,
    v_revision,
    true,
    v_current.id,
    'Quotes Sent',
    nullif(btrim(p_client_address), ''),
    nullif(btrim(p_so_number), ''),
    nullif(btrim(p_note), '')
  )
  returning id into v_document_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    insert into public.commercial_document_items (
      commercial_document_id,
      product_name,
      description,
      qty,
      uom,
      unit_price,
      line_total,
      line_position
    ) values (
      v_document_id,
      btrim(v_item ->> 'productName'),
      nullif(btrim(v_item ->> 'description'), ''),
      (v_item ->> 'qty')::numeric,
      (v_item ->> 'uom')::public.uom_type,
      (v_item ->> 'unitPrice')::numeric,
      (v_item ->> 'qty')::numeric * (v_item ->> 'unitPrice')::numeric,
      v_position
    );
  end loop;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    commercial_document_id,
    title,
    detail
  ) values (
    'commercial_item_created',
    v_current.owner_id,
    v_actor_id,
    v_current.client_id,
    v_document_id,
    'Revisi Quotation dibuat',
    jsonb_build_object(
      'quotation_number', v_number,
      'supersedes_document_id', v_current.id
    )::text
  );

  -- Deliberately does not touch any still-open Task from the previous
  -- revision (spec Open Question 2, decided 2026-08-03): a revision's
  -- follow-up Task is separate bookkeeping, not a replacement for
  -- whatever the sales rep already has in flight on the prior revision.
  insert into public.tasks (
    client_id,
    owner_id,
    commercial_document_id,
    title,
    due_date,
    method,
    category,
    workflow_status,
    next_action,
    next_action_date
  ) values (
    v_current.client_id,
    v_current.owner_id,
    v_document_id,
    format('Follow-up: %s', v_number),
    p_next_action_date,
    'Phone',
    'Quotation',
    'Open',
    btrim(p_next_action),
    p_next_action_date
  );

  select to_jsonb(d) || jsonb_build_object(
    'items',
    (
      select jsonb_agg(to_jsonb(i) order by i.line_position)
      from public.commercial_document_items i
      where i.commercial_document_id = d.id
    )
  )
  into v_result
  from public.commercial_documents d
  where d.id = v_document_id;

  return v_result;
end;
$$;

comment on function public.revise_quotation(
  uuid, date, text, text, text, jsonb, text, date
) is
'Revises a current Quotation into a new _REV.n row. Rejects the revision (QUOTATION_ALREADY_HAS_SALES_ORDER) if any Sales Order already links to this Quotation -- price/discount changes must happen before an SO exists.';
