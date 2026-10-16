-- Task 09a: nullable quotation closing expectation plus one audited,
-- optimistic-concurrency command. Existing rows are deliberately not backfilled.

alter table public.commercial_documents
  add column expected_close_date date;

alter table public.commercial_documents
  add constraint commercial_documents_expected_close_quotation_only
  check (type = 'Quotation' or expected_close_date is null);

create index commercial_documents_expected_close_open_idx
  on public.commercial_documents (expected_close_date, owner_id, id)
  where type = 'Quotation'
    and is_current_revision
    and deleted_at is null
    and stage not in ('Closed Won', 'Closed Lost')
    and expected_close_date is not null;

create table public.commercial_expected_close_events (
  id uuid primary key default gen_random_uuid(),
  commercial_document_id uuid not null
    references public.commercial_documents (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  actor_id uuid not null references public.profiles (id),
  old_expected_close_date date,
  new_expected_close_date date,
  document_updated_at timestamptz not null,
  request_id uuid not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  check (old_expected_close_date is distinct from new_expected_close_date),
  unique (actor_id, request_id)
);

alter table public.commercial_expected_close_events enable row level security;

create policy "commercial_expected_close_events_select"
on public.commercial_expected_close_events
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

revoke all on table public.commercial_expected_close_events
  from public, anon, authenticated;
grant select on table public.commercial_expected_close_events to authenticated;
grant select, insert, update, delete
  on table public.commercial_expected_close_events to service_role;

create function private.crm_expected_close_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'Quotation'
     and new.stage = 'Commit'
     and new.expected_close_date is null
     and (
       tg_op = 'INSERT'
       or old.stage is distinct from new.stage
       or old.expected_close_date is distinct from new.expected_close_date
     )
  then
    raise exception 'EXPECTED_CLOSE_REQUIRED_FOR_COMMIT'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.expected_close_date is distinct from new.expected_close_date
     and current_user = 'authenticated'
  then
    raise exception 'EXPECTED_CLOSE_COMMAND_REQUIRED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger crm_expected_close_boundary
before insert or update of stage, expected_close_date
on public.commercial_documents
for each row execute function private.crm_expected_close_boundary();

revoke all on function private.crm_expected_close_boundary()
  from public, anon, authenticated;

create function private.copy_expected_close_to_quotation_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'Quotation'
     and new.supersedes_document_id is not null
     and new.expected_close_date is null
  then
    select d.expected_close_date
    into new.expected_close_date
    from public.commercial_documents d
    where d.id = new.supersedes_document_id
      and d.type = 'Quotation';
  end if;
  return new;
end;
$$;

create trigger copy_expected_close_to_quotation_revision
before insert on public.commercial_documents
for each row execute function private.copy_expected_close_to_quotation_revision();

revoke all on function private.copy_expected_close_to_quotation_revision()
  from public, anon, authenticated;

-- Replace the existing 9-argument RPC rather than creating an overload.
-- The trailing default keeps all existing named callers backward-compatible.
drop function public.create_quotation(
  uuid, date, text, text, text, text, jsonb, text, date
);

create function public.create_quotation(
  p_client_id uuid,
  p_document_date date,
  p_client_address text,
  p_stage text,
  p_so_number text,
  p_note text,
  p_items jsonb,
  p_next_action text,
  p_next_action_date date,
  p_expected_close_date date default null
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
  if v_actor_role is null
     or v_actor_id is null
     or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED'
      using errcode = '42501';
  end if;
  if p_document_date is null then
    raise exception 'DOCUMENT_DATE_REQUIRED'
      using errcode = '23514';
  end if;
  if nullif(btrim(p_stage), '') is null then
    raise exception 'DOCUMENT_STAGE_REQUIRED'
      using errcode = '23514';
  end if;
  if p_stage = 'Commit' and p_expected_close_date is null then
    raise exception 'EXPECTED_CLOSE_REQUIRED_FOR_COMMIT'
      using errcode = '23514';
  end if;
  if nullif(btrim(p_next_action), '') is null then
    raise exception 'NEXT_ACTION_REQUIRED'
      using errcode = '23514';
  end if;
  if p_next_action_date is null then
    raise exception 'NEXT_ACTION_DATE_REQUIRED'
      using errcode = '23514';
  end if;

  select owner_id into v_owner_id
  from public.clients
  where id = p_client_id;
  if not found then
    raise exception 'CLIENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if v_actor_role = 'sales' and v_owner_id <> v_actor_id then
    raise exception 'CLIENT_OWNERSHIP_REQUIRED'
      using errcode = '42501';
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
    expected_close_date,
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
    p_expected_close_date,
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

revoke all on function public.create_quotation(
  uuid, date, text, text, text, text, jsonb, text, date, date
) from public, anon;
grant execute on function public.create_quotation(
  uuid, date, text, text, text, text, jsonb, text, date, date
) to authenticated, service_role;

-- Revision confirmation belongs to the same transaction that creates the new
-- revision. Existing callers omit both trailing parameters and retain the
-- trigger-backed inheritance behavior. New callers set the confirmation flag,
-- which also makes an explicit NULL mean "clear" rather than "inherit".
drop function public.revise_quotation(
  uuid, date, text, text, text, jsonb, text, date
);

create function public.revise_quotation(
  p_document_id uuid,
  p_document_date date,
  p_client_address text,
  p_so_number text,
  p_note text,
  p_items jsonb,
  p_next_action text,
  p_next_action_date date,
  p_expected_close_date date default null,
  p_expected_close_confirmed boolean default false
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
  if v_actor_role is null
     or v_actor_id is null
     or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED'
      using errcode = '42501';
  end if;
  if p_document_date is null then
    raise exception 'DOCUMENT_DATE_REQUIRED'
      using errcode = '23514';
  end if;
  if nullif(btrim(p_next_action), '') is null then
    raise exception 'NEXT_ACTION_REQUIRED'
      using errcode = '23514';
  end if;
  if p_next_action_date is null then
    raise exception 'NEXT_ACTION_DATE_REQUIRED'
      using errcode = '23514';
  end if;
  perform private.assert_document_items(p_items, true);

  select * into v_current
  from public.commercial_documents
  where id = p_document_id
    and type = 'Quotation'
    and is_current_revision
  for update;
  if not found then
    raise exception 'CURRENT_QUOTATION_REQUIRED'
      using errcode = 'P0002';
  end if;
  if v_actor_role = 'sales' and v_current.owner_id <> v_actor_id then
    raise exception 'DOCUMENT_OWNERSHIP_REQUIRED'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.sales_orders
    where source_commercial_document_id = v_current.id
  ) then
    raise exception 'QUOTATION_ALREADY_HAS_SALES_ORDER'
      using errcode = '23514';
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
    expected_close_date,
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
    case
      when p_expected_close_confirmed then p_expected_close_date
      else null
    end,
    nullif(btrim(p_client_address), ''),
    nullif(btrim(p_so_number), ''),
    nullif(btrim(p_note), '')
  )
  returning id into v_document_id;

  -- The inheritance trigger treats NULL as "inherit". An explicit confirmed
  -- NULL instead means "clear", so normalize it inside this same transaction.
  if p_expected_close_confirmed and p_expected_close_date is null then
    update public.commercial_documents
    set expected_close_date = null
    where id = v_document_id;
  end if;

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

revoke all on function public.revise_quotation(
  uuid, date, text, text, text, jsonb, text, date, date, boolean
) from public, anon;
grant execute on function public.revise_quotation(
  uuid, date, text, text, text, jsonb, text, date, date, boolean
) to authenticated, service_role;

create function public.set_quotation_expected_close_date(
  p_document_id uuid,
  p_expected_updated_at timestamptz,
  p_request_id uuid,
  p_expected_close_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := public.current_user_role();
  v_before public.commercial_documents%rowtype;
  v_after public.commercial_documents%rowtype;
  v_payload jsonb := jsonb_build_object(
    'id', p_document_id,
    'version', p_expected_updated_at,
    'expectedCloseDate', p_expected_close_date,
    'reason', nullif(btrim(p_reason), '')
  );
  v_replay private.crm_command_replays%rowtype;
  v_result jsonb;
  v_event_id uuid;
begin
  if v_actor is null
     or v_role is null
     or v_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED'
      using errcode = '42501';
  end if;
  if p_document_id is null
     or p_expected_updated_at is null
     or p_request_id is null
  then
    raise exception 'INVALID_COMMAND_INPUT'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor::text || 'expected-close' || p_request_id::text, 0)
  );
  select * into v_replay
  from private.crm_command_replays
  where actor_id = v_actor
    and command = 'quotation_expected_close'
    and request_id = p_request_id;
  if found then
    if v_replay.payload <> v_payload then
      raise exception 'REQUEST_PAYLOAD_MISMATCH'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.commercial_documents d
      where d.id = p_document_id
        and d.type = 'Quotation'
        and d.is_current_revision
        and d.deleted_at is null
        and (v_role <> 'sales' or d.owner_id = v_actor)
    ) then
      raise exception 'QUOTATION_OWNERSHIP_REQUIRED'
        using errcode = '42501';
    end if;
    return v_replay.result;
  end if;

  select * into v_before
  from public.commercial_documents d
  where d.id = p_document_id
    and d.type = 'Quotation'
    and d.is_current_revision
    and d.deleted_at is null
  for update;
  if not found then
    raise exception 'CURRENT_QUOTATION_REQUIRED'
      using errcode = 'P0002';
  end if;
  if v_role = 'sales' and v_before.owner_id <> v_actor then
    raise exception 'QUOTATION_OWNERSHIP_REQUIRED'
      using errcode = '42501';
  end if;
  if v_before.updated_at <> p_expected_updated_at then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001';
  end if;
  if v_before.stage = 'Commit' and p_expected_close_date is null then
    raise exception 'EXPECTED_CLOSE_REQUIRED_FOR_COMMIT'
      using errcode = '23514';
  end if;

  v_after := v_before;
  if v_before.expected_close_date is distinct from p_expected_close_date then
    update public.commercial_documents
    set expected_close_date = p_expected_close_date,
        updated_at = greatest(
          clock_timestamp(),
          v_before.updated_at + interval '1 microsecond'
        )
    where id = p_document_id
    returning * into v_after;

    insert into public.commercial_expected_close_events (
      commercial_document_id,
      owner_id,
      actor_id,
      old_expected_close_date,
      new_expected_close_date,
      document_updated_at,
      request_id,
      reason
    ) values (
      p_document_id,
      v_before.owner_id,
      v_actor,
      v_before.expected_close_date,
      v_after.expected_close_date,
      v_after.updated_at,
      p_request_id,
      nullif(btrim(p_reason), '')
    ) returning id into v_event_id;
  end if;

  v_result := jsonb_build_object(
    'record',
    to_jsonb(v_after) || jsonb_build_object(
      'items', (
        select coalesce(
          jsonb_agg(to_jsonb(i) order by i.line_position, i.id),
          '[]'::jsonb
        )
        from public.commercial_document_items i
        where i.commercial_document_id = p_document_id
      )
    ),
    'eventId', v_event_id
  );
  insert into private.crm_command_replays (
    actor_id, command, request_id, payload, result
  ) values (
    v_actor, 'quotation_expected_close', p_request_id, v_payload, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.set_quotation_expected_close_date(
  uuid, timestamptz, uuid, date, text
) from public, anon;
grant execute on function public.set_quotation_expected_close_date(
  uuid, timestamptz, uuid, date, text
) to authenticated;

comment on function public.set_quotation_expected_close_date(
  uuid, timestamptz, uuid, date, text
) is
'Versioned and retry-safe command for changing a current Quotation expected close date. Writes one immutable old/new event and enforces sales ownership.';
