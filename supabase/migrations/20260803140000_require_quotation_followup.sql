-- Migration: require_quotation_followup
--
-- Spec: docs/superpowers/specs/2026-08-03-quotation-mandatory-followup-design.md
-- (APPROVED 2026-08-03). Adds 2 mandatory params to create_quotation and
-- revise_quotation -- p_next_action / p_next_action_date -- and makes each
-- RPC insert one linked Task (workflow_status='Open', method='Phone',
-- category='Quotation') in the same atomic transaction as the Quotation
-- itself. This is what feeds tasks.next_action_date going forward, which
-- clients.next_fu (and the Dashboard's Activity Compliance card) already
-- derive from since 20260803120000_sync_client_next_fu_from_tasks.sql.
--
-- Both functions get a new parameter list, so `create or replace` alone
-- would just add a second overload instead of replacing the old one --
-- explicit `drop function` first ensures old 6/7-arg callers (including
-- the direct-RPC tests) fail loudly instead of silently hitting the old
-- signature with no follow-up required.

drop function if exists public.create_quotation(
  uuid, date, text, text, text, text, jsonb
);

drop function if exists public.revise_quotation(
  uuid, date, text, text, text, jsonb
);

create or replace function public.create_quotation(
  p_client_id uuid,
  p_document_date date,
  p_client_address text,
  p_stage text,
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
  if nullif(btrim(p_next_action), '') is null then
    raise exception using message = 'NEXT_ACTION_REQUIRED';
  end if;
  if p_next_action_date is null then
    raise exception using message = 'NEXT_ACTION_DATE_REQUIRED';
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
    p_client_id,
    v_owner_id,
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

revoke all privileges on function public.create_quotation(
  uuid, date, text, text, text, text, jsonb, text, date
) from public, anon;
grant execute on function public.create_quotation(
  uuid, date, text, text, text, text, jsonb, text, date
) to authenticated, service_role;

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

revoke all privileges on function public.revise_quotation(
  uuid, date, text, text, text, jsonb, text, date
) from public, anon;
grant execute on function public.revise_quotation(
  uuid, date, text, text, text, jsonb, text, date
) to authenticated, service_role;
