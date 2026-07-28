-- Security fix: NULL-role fail-open in role gates.
--
-- public.current_user_role() returns NULL when the caller is deactivated or
-- has no public.profiles row. RLS policies handle NULL correctly (a NULL
-- predicate denies), but PL/pgSQL does not: `NULL not in (...)` evaluates to
-- NULL, and `if NULL then` is treated as false. Every gate below therefore
-- failed open, and in the SECURITY DEFINER functions that meant the body ran
-- with owner privileges, bypassing RLS entirely.
--
-- Fix: an explicit `is null` raise before each existing role gate. This is the
-- pattern already used correctly by public.admin_count_active_commercial_items
-- (20260719000116_fix_commercial_count_predicate.sql).
--
-- The follow-on ownership checks (`if v_actor_role = 'sales' and ...`) were
-- NULL-swallowed for the same reason; the early raise makes them unreachable
-- with a NULL role, so they are left unchanged.
--
-- Bodies below are reproduced verbatim from each function's authoritative
-- latest definition -- the only edit is the inserted null guard. PL/pgSQL has
-- no way to patch a single line, so `create or replace` must restate the whole
-- body. Signatures are unchanged, so existing ACLs are preserved by
-- `create or replace` and are deliberately not re-issued (same as
-- 20260724091421_require_manual_sales_order_number.sql).

-- create_prototype_request: from 20260719033236_add_atomic_document_numbering.sql
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

-- create_quotation: from 20260719033236_add_atomic_document_numbering.sql
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

-- revise_quotation: from 20260719033236_add_atomic_document_numbering.sql
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

-- create_sales_order: from 20260724091421_require_manual_sales_order_number.sql
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

-- reassign_client_owner: from 20260721084943_add_reassign_client_owner_rpc.sql
create or replace function public.reassign_client_owner(
  p_client_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_old_owner_id uuid;
  v_new_owner_name text;
begin
  -- Must be manager or super_admin
  v_caller_role := (select public.current_user_role())::text;
  -- Explicit null check first: `null not in (...)` is null, not true, so the
  -- gate below alone lets a deactivated or profile-less caller through.
  if v_caller_role is null then
    raise exception 'Hanya manager yang bisa reassign klien'
      using errcode = '42501';
  end if;
  if v_caller_role not in ('manager', 'super_admin') then
    raise exception 'Hanya manager yang bisa reassign klien'
      using errcode = '42501';
  end if;

  -- Client must exist
  select owner_id into v_old_owner_id
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Klien tidak ditemukan'
      using errcode = 'P0002';
  end if;

  -- New owner must be an active sales or manager profile
  select name into v_new_owner_name
  from public.profiles
  where id = p_new_owner_id
    and account_status = 'active'
    and role in ('sales', 'manager');

  if not found then
    raise exception 'Sales tujuan tidak valid'
      using errcode = 'P0002';
  end if;

  -- Perform the update (bypasses RLS because of SECURITY DEFINER)
  update public.clients
  set owner_id = p_new_owner_id
  where id = p_client_id;
end;
$$;

-- task_control_loop_metrics: from 20260727150000_restrict_task_exception_visibility.sql
create or replace function public.task_control_loop_metrics()
returns table (
  total_tasks bigint,
  active_tasks bigint,
  upcoming_tasks bigint,
  today_tasks bigint,
  overdue_tasks bigint,
  escalated_tasks bigint,
  done_tasks bigint,
  cancelled_tasks bigint,
  archived_tasks bigint,
  calendar_incomplete_tasks bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
begin
  -- Explicit null check first: `null not in (...)` is null, not true, so the
  -- gate below alone lets a deactivated or profile-less caller through.
  if v_role is null then
    raise exception 'task_control_loop_metrics requires an active privileged role'
      using errcode = '42501';
  end if;
  if v_role not in ('manager', 'executive', 'super_admin') then
    raise exception 'task_control_loop_metrics is not available for role %', v_role
      using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint as total_tasks,
    count(*) filter (
      where t.workflow_status in ('Open', 'In Progress', 'Waiting External')
        and not t.archived
    )::bigint as active_tasks,
    count(*) filter (where ds.due_state = 'Upcoming' and not t.archived)::bigint as upcoming_tasks,
    count(*) filter (where ds.due_state = 'Today' and not t.archived)::bigint as today_tasks,
    count(*) filter (where ds.due_state = 'Overdue' and not t.archived)::bigint as overdue_tasks,
    count(*) filter (where ds.due_state = 'Escalated' and not t.archived)::bigint as escalated_tasks,
    count(*) filter (where t.workflow_status = 'Done')::bigint as done_tasks,
    count(*) filter (where t.workflow_status = 'Cancelled')::bigint as cancelled_tasks,
    count(*) filter (where t.archived)::bigint as archived_tasks,
    count(*) filter (where ds.calendar_incomplete)::bigint as calendar_incomplete_tasks
  from public.tasks t
  cross join lateral public.compute_task_due_state(t.due_date, t.workflow_status) ds;
end;
$$;
