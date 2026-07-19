-- Phase 11 Task 3: atomic document numbering and one-form transactions.

alter table private.document_number_counters
  drop constraint document_number_counters_pkey;
alter table private.document_number_counters
  drop column id;
alter table private.document_number_counters
  rename column year to year_code;
alter table private.document_number_counters
  alter column year_code type smallint;
alter table private.document_number_counters
  drop constraint document_number_counters_series_year_key;
alter table private.document_number_counters
  add primary key (series, year_code);
alter table private.document_number_counters
  add constraint document_number_counters_series_check
  check (series in ('QUO', 'SO', 'NP', 'PROTY'));
alter table private.document_number_counters
  add constraint document_number_counters_year_code_check
  check (year_code between 0 and 99);
alter table private.document_number_counters
  add constraint document_number_counters_last_value_check
  check (last_value >= 0);

alter table public.sales_orders
  add constraint sales_orders_so_number_key unique (so_number);
create unique index commercial_documents_rfq_number_key
  on public.commercial_documents (rfq_number)
  where rfq_number is not null;

create or replace function private.allocate_document_number(
  p_series text,
  p_year smallint
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_next integer;
begin
  if p_series not in ('QUO', 'SO', 'NP', 'PROTY') then
    raise exception using message = 'INVALID_DOCUMENT_SERIES';
  end if;
  if p_year not between 0 and 99 then
    raise exception using message = 'INVALID_DOCUMENT_YEAR';
  end if;

  insert into private.document_number_counters (
    series,
    year_code,
    last_value,
    updated_at
  ) values (
    p_series,
    p_year,
    1,
    now()
  )
  on conflict (series, year_code)
  do update set
    last_value = private.document_number_counters.last_value + 1,
    updated_at = now()
  returning last_value into v_next;

  return case p_series
    when 'QUO' then format(
      'DSM-%sQUO-%s',
      lpad(p_year::text, 2, '0'),
      lpad(v_next::text, 4, '0')
    )
    when 'SO' then format(
      'DSM-%sSO%s',
      lpad(p_year::text, 2, '0'),
      lpad(v_next::text, 3, '0')
    )
    when 'NP' then format(
      'DSM-%sNP%s',
      lpad(p_year::text, 2, '0'),
      lpad(v_next::text, 3, '0')
    )
    when 'PROTY' then format(
      'DSM-%sPROTY%s',
      lpad(p_year::text, 2, '0'),
      lpad(v_next::text, 3, '0')
    )
  end;
end;
$$;

revoke all privileges on function private.allocate_document_number(text, smallint)
from public, anon, authenticated;
grant execute on function private.allocate_document_number(text, smallint)
to service_role;

create or replace function private.assert_document_items(
  p_items jsonb,
  p_require_price boolean
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
begin
  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception using message = 'DOCUMENT_ITEMS_REQUIRED';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(item ->> 'productName'), '') is null then
      raise exception using message = 'PRODUCT_NAME_REQUIRED';
    end if;
    if nullif(item ->> 'qty', '') is null
      or (item ->> 'qty')::numeric <= 0
    then
      raise exception using message = 'POSITIVE_QTY_REQUIRED';
    end if;
    if coalesce(item ->> 'uom', '') not in ('Unit', 'Pcs', 'Set', 'Lot') then
      raise exception using message = 'VALID_UOM_REQUIRED';
    end if;
    if p_require_price and (
      nullif(item ->> 'unitPrice', '') is null
      or (item ->> 'unitPrice')::numeric <= 0
    ) then
      raise exception using message = 'POSITIVE_UNIT_PRICE_REQUIRED';
    end if;
    if not p_require_price and nullif(item ->> 'unitPrice', '') is not null then
      raise exception using message = 'FOC_MONEY_MUST_BE_NULL';
    end if;
  end loop;
end;
$$;

revoke all privileges on function private.assert_document_items(jsonb, boolean)
from public, anon, authenticated;
grant execute on function private.assert_document_items(jsonb, boolean)
to service_role;

create or replace function public.create_rfq(
  p_client_id uuid,
  p_rfq_number text,
  p_document_date date,
  p_stage text,
  p_items jsonb
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
  v_document_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_result jsonb;
begin
  v_actor_role := public.current_user_role();
  if v_actor_id is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;
  if nullif(btrim(p_rfq_number), '') is null then
    raise exception using message = 'RFQ_NUMBER_REQUIRED';
  end if;
  if p_document_date is null then
    raise exception using message = 'DOCUMENT_DATE_REQUIRED';
  end if;
  if nullif(btrim(p_stage), '') is null then
    raise exception using message = 'DOCUMENT_STAGE_REQUIRED';
  end if;
  perform private.assert_document_items(p_items, true);

  select owner_id into v_owner_id
  from public.clients
  where id = p_client_id;
  if not found then
    raise exception using message = 'CLIENT_NOT_FOUND';
  end if;
  if v_actor_role = 'sales' and v_owner_id <> v_actor_id then
    raise exception using message = 'CLIENT_OWNERSHIP_REQUIRED';
  end if;

  insert into public.commercial_documents (
    client_id,
    owner_id,
    type,
    source_flow,
    document_date,
    rfq_number,
    stage
  ) values (
    p_client_id,
    v_owner_id,
    'RFQ',
    'RFQ / New Product',
    p_document_date,
    btrim(p_rfq_number),
    p_stage
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
    v_owner_id,
    v_actor_id,
    p_client_id,
    v_document_id,
    'RFQ dibuat',
    jsonb_build_object('rfq_number', btrim(p_rfq_number))::text
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
exception
  when unique_violation then
    raise exception using message = 'RFQ_NUMBER_ALREADY_EXISTS';
end;
$$;

revoke all privileges on function public.create_rfq(
  uuid, text, date, text, jsonb
) from public, anon;
grant execute on function public.create_rfq(
  uuid, text, date, text, jsonb
) to authenticated, service_role;

create or replace function public.create_prototype_request(
  p_client_id uuid,
  p_document_date date,
  p_items jsonb
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
  v_document_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_result jsonb;
begin
  v_actor_role := public.current_user_role();
  if v_actor_id is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;
  if p_document_date is null then
    raise exception using message = 'DOCUMENT_DATE_REQUIRED';
  end if;
  perform private.assert_document_items(p_items, true);

  select owner_id into v_owner_id
  from public.clients
  where id = p_client_id;
  if not found then
    raise exception using message = 'CLIENT_NOT_FOUND';
  end if;
  if v_actor_role = 'sales' and v_owner_id <> v_actor_id then
    raise exception using message = 'CLIENT_OWNERSHIP_REQUIRED';
  end if;

  insert into public.commercial_documents (
    client_id,
    owner_id,
    type,
    source_flow,
    document_date,
    stage
  ) values (
    p_client_id,
    v_owner_id,
    'Prototype',
    'Prototype',
    p_document_date,
    'Prototype Requested'
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
    title
  ) values (
    'commercial_item_created',
    v_owner_id,
    v_actor_id,
    p_client_id,
    v_document_id,
    'Prototype Request dibuat'
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

revoke all privileges on function public.create_prototype_request(
  uuid, date, jsonb
) from public, anon;
grant execute on function public.create_prototype_request(
  uuid, date, jsonb
) to authenticated, service_role;

create or replace function public.create_quotation(
  p_client_id uuid,
  p_document_date date,
  p_client_address text,
  p_stage text,
  p_so_number text,
  p_note text,
  p_items jsonb
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
  v_document_id uuid;
  v_number text;
  v_item jsonb;
  v_position integer := 0;
  v_result jsonb;
begin
  v_actor_role := public.current_user_role();
  if v_actor_id is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;
  if p_document_date is null then
    raise exception using message = 'DOCUMENT_DATE_REQUIRED';
  end if;
  if nullif(btrim(p_stage), '') is null then
    raise exception using message = 'DOCUMENT_STAGE_REQUIRED';
  end if;

  select owner_id into v_owner_id
  from public.clients
  where id = p_client_id;
  if not found then
    raise exception using message = 'CLIENT_NOT_FOUND';
  end if;
  if v_actor_role = 'sales' and v_owner_id <> v_actor_id then
    raise exception using message = 'CLIENT_OWNERSHIP_REQUIRED';
  end if;

  perform private.assert_document_items(p_items, true);
  v_number := private.allocate_document_number(
    'QUO',
    (extract(year from p_document_date)::integer % 100)::smallint
  );

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
    stage,
    client_address,
    so_number,
    note
  ) values (
    p_client_id,
    v_owner_id,
    'Quotation',
    'RFQ / New Product',
    p_document_date,
    v_number,
    v_number,
    0,
    true,
    p_stage,
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
    v_owner_id,
    v_actor_id,
    p_client_id,
    v_document_id,
    'Quotation dibuat',
    jsonb_build_object('quotation_number', v_number)::text
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

revoke all privileges on function public.create_quotation(
  uuid, date, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.create_quotation(
  uuid, date, text, text, text, text, jsonb
) to authenticated, service_role;

create or replace function public.revise_quotation(
  p_document_id uuid,
  p_document_date date,
  p_client_address text,
  p_so_number text,
  p_note text,
  p_items jsonb
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
  if v_actor_id is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;
  if p_document_date is null then
    raise exception using message = 'DOCUMENT_DATE_REQUIRED';
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

revoke all privileges on function public.revise_quotation(
  uuid, date, text, text, text, jsonb
) from public, anon;
grant execute on function public.revise_quotation(
  uuid, date, text, text, text, jsonb
) to authenticated, service_role;

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
  p_items jsonb
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
  v_series text;
  v_number text;
  v_is_foc boolean;
  v_total numeric := 0;
  v_item jsonb;
  v_position integer := 0;
  v_result jsonb;
begin
  v_actor_role := public.current_user_role();
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
  if p_number_mode = 'Imported' then
    raise exception using message = 'IMPORTED_MODE_NOT_ALLOWED';
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
    if nullif(btrim(p_manual_so_number), '') is null
      or nullif(btrim(p_backdate_reason), '') is null
    then
      raise exception using message = 'HARIFF_BACKDATE_FIELDS_REQUIRED';
    end if;
    if exists (
      select 1 from public.sales_orders
      where so_number = btrim(p_manual_so_number)
    ) then
      raise exception using message = 'SO_NUMBER_ALREADY_EXISTS';
    end if;
    v_number := btrim(p_manual_so_number);
  else
    if p_manual_so_number is not null or p_backdate_reason is not null then
      raise exception using message = 'AUTO_NUMBER_FIELDS_MUST_BE_NULL';
    end if;
    v_series := case
      when p_type = 'Prototype' then 'PROTY'
      when p_tax_type = 'Non-PPN' then 'NP'
      else 'SO'
    end;
    v_number := private.allocate_document_number(
      v_series,
      (extract(year from p_date)::integer % 100)::smallint
    );
  end if;

  if not v_is_foc then
    select sum(
      (value ->> 'qty')::numeric * (value ->> 'unitPrice')::numeric
    )
    into v_total
    from jsonb_array_elements(p_items);
  end if;

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
    total_value
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
    case when v_is_foc then null else v_total end
  )
  returning id into v_sales_order_id;

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
      'backdate_reason', p_backdate_reason
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

revoke all privileges on function public.create_sales_order(
  uuid,
  date,
  text,
  public.so_type,
  public.tax_type,
  public.prototype_status,
  public.revenue_source,
  public.document_number_mode,
  text,
  text,
  jsonb
) from public, anon;
grant execute on function public.create_sales_order(
  uuid,
  date,
  text,
  public.so_type,
  public.tax_type,
  public.prototype_status,
  public.revenue_source,
  public.document_number_mode,
  text,
  text,
  jsonb
) to authenticated, service_role;
