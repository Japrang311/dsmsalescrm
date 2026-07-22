-- RFQ is intake/specification request data, not a numbered commercial document.
-- Quotation/SO/Prototype document numbers remain guided separately.

do $$
declare
  v_constraint_name text;
begin
  select con.conname
  into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'commercial_documents'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type = ''RFQ''%'
    and pg_get_constraintdef(con.oid) ilike '%rfq_number is not null%'
  limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table public.commercial_documents drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

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
    nullif(btrim(p_rfq_number), ''),
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
    jsonb_build_object('type', 'RFQ intake')::text
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
