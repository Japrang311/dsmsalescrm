alter table public.commercial_documents
  add column if not exists source_rfq_document_id uuid
    references public.commercial_documents(id),
  add column if not exists quotation_expired_date date;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.commercial_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%Quotation%'
      and lower(pg_get_constraintdef(oid)) like '%quotation_number is not null%'
  loop
    execute format(
      'alter table public.commercial_documents drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.commercial_documents
  drop constraint if exists commercial_documents_quotation_identity_valid;

alter table public.commercial_documents
  add constraint commercial_documents_quotation_identity_valid
  check (
    type <> 'Quotation'
    or quotation_number is null
    or quotation_base_number is not null
  );

create unique index if not exists commercial_documents_one_quotation_per_rfq
  on public.commercial_documents(source_rfq_document_id)
  where type = 'Quotation' and source_rfq_document_id is not null;

grant update (
  document_date,
  quotation_number,
  quotation_base_number,
  quotation_expired_date,
  client_address,
  note,
  stage,
  updated_at
) on public.commercial_documents to authenticated;

create or replace function public.create_quotation_from_rfq(
  p_rfq_document_id uuid
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
  v_rfq public.commercial_documents%rowtype;
  v_document_id uuid;
  v_created boolean := false;
  v_result jsonb;
begin
  v_actor_role := public.current_user_role();
  if v_actor_id is null
    or v_actor_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using message = 'ACTIVE_MUTATING_ROLE_REQUIRED';
  end if;

  select *
  into v_rfq
  from public.commercial_documents
  where id = p_rfq_document_id
    and deleted_at is null
  for update;

  if not found then
    raise exception using message = 'RFQ_NOT_FOUND';
  end if;
  if v_rfq.type <> 'RFQ' then
    raise exception using message = 'RFQ_DOCUMENT_REQUIRED';
  end if;
  if v_actor_role = 'sales' and v_rfq.owner_id <> v_actor_id then
    raise exception using message = 'RFQ_OWNERSHIP_REQUIRED';
  end if;

  select id
  into v_document_id
  from public.commercial_documents
  where type = 'Quotation'
    and source_rfq_document_id = v_rfq.id
    and deleted_at is null;

  if v_document_id is null then
    insert into public.commercial_documents (
      client_id,
      owner_id,
      type,
      source_flow,
      document_date,
      quotation_revision,
      is_current_revision,
      source_rfq_document_id,
      stage,
      client_address,
      note
    ) values (
      v_rfq.client_id,
      v_rfq.owner_id,
      'Quotation',
      v_rfq.source_flow,
      current_date,
      0,
      true,
      v_rfq.id,
      'Quotes Sent',
      v_rfq.client_address,
      v_rfq.note
    )
    returning id into v_document_id;

    insert into public.commercial_document_items (
      commercial_document_id,
      product_name,
      description,
      qty,
      uom,
      unit_price,
      line_total,
      line_position
    )
    select
      v_document_id,
      product_name,
      description,
      qty,
      uom,
      unit_price,
      line_total,
      line_position
    from public.commercial_document_items
    where commercial_document_id = v_rfq.id
    order by line_position;

    v_created := true;
  end if;

  if v_rfq.stage <> 'Quotes Sent' then
    update public.commercial_documents
    set stage = 'Quotes Sent',
        updated_at = now()
    where id = v_rfq.id;
  end if;

  if v_created then
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
      v_rfq.owner_id,
      v_actor_id,
      v_rfq.client_id,
      v_document_id,
      'Quotation dibuat dari RFQ',
      jsonb_build_object(
        'source_rfq_document_id', v_rfq.id,
        'rfq_number', v_rfq.rfq_number,
        'stage_change', 'RFQ -> Quotes Sent'
      )::text
    );
  end if;

  if v_rfq.stage <> 'Quotes Sent' then
    insert into public.activity_log (
      kind,
      owner_id,
      actor_id,
      client_id,
      commercial_document_id,
      title,
      detail
    ) values (
      'commercial_item_stage_change',
      v_rfq.owner_id,
      v_actor_id,
      v_rfq.client_id,
      v_rfq.id,
      'RFQ dipindahkan ke Quotes Sent',
      'stage: ' || v_rfq.stage || ' -> Quotes Sent'
    );
  end if;

  select to_jsonb(d) || jsonb_build_object(
    'items',
    (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.line_position), '[]'::jsonb)
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

revoke all privileges on function public.create_quotation_from_rfq(uuid)
from public, anon;
grant execute on function public.create_quotation_from_rfq(uuid)
to authenticated, service_role;
