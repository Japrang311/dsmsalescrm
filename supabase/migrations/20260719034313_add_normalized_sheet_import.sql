-- Phase 11 Task 4: one-transaction normalized historical Sheet import.
-- This is deliberately service-role-only and is called only by the
-- local-first import script after dry-run reconciliation.

create or replace function public.admin_import_normalized_documents(
  p_documents jsonb,
  p_counter_seeds jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_document jsonb;
  v_header jsonb;
  v_item jsonb;
  v_seed jsonb;
  v_id uuid;
  v_position integer;
  v_document_count integer := 0;
  v_item_count integer := 0;
  v_seed_count integer := 0;
  v_supersedes_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(p_documents) <> 'array'
    or jsonb_typeof(p_counter_seeds) <> 'array'
  then
    raise exception using message = 'IMPORT_ARRAYS_REQUIRED';
  end if;

  create temporary table tmp_imported_quotation_ids (
    quotation_number text primary key,
    document_id uuid not null
  ) on commit drop;

  for v_document in select value from jsonb_array_elements(p_documents)
  loop
    v_header := v_document -> 'header';
    if jsonb_typeof(v_document -> 'items') <> 'array'
      or jsonb_array_length(v_document -> 'items') = 0
    then
      raise exception using message = 'IMPORT_DOCUMENT_ITEMS_REQUIRED';
    end if;

    if v_header ->> 'kind' = 'commercial' then
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
        (v_header ->> 'clientId')::uuid,
        (v_header ->> 'ownerId')::uuid,
        'Quotation',
        'RFQ / New Product',
        (v_header ->> 'documentDate')::date,
        v_header ->> 'quotationNumber',
        v_header ->> 'quotationBaseNumber',
        (v_header ->> 'quotationRevision')::integer,
        false,
        v_header ->> 'stage',
        v_header ->> 'clientAddress',
        v_header ->> 'soNumber',
        v_header ->> 'note'
      )
      returning id into v_id;

      insert into tmp_imported_quotation_ids (
        quotation_number,
        document_id
      ) values (
        v_header ->> 'quotationNumber',
        v_id
      );
    elsif v_header ->> 'kind' = 'sales_order' then
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
        total_value
      ) values (
        v_header ->> 'soNumber',
        v_header ->> 'customerPoNumber',
        (v_header ->> 'date')::date,
        (v_header ->> 'clientId')::uuid,
        (v_header ->> 'ownerId')::uuid,
        (v_header ->> 'type')::public.so_type,
        nullif(v_header ->> 'taxType', '')::public.tax_type,
        nullif(v_header ->> 'prototypeStatus', '')::public.prototype_status,
        (v_header ->> 'source')::public.revenue_source,
        'Imported',
        nullif(v_header ->> 'totalValue', '')::numeric
      )
      returning id into v_id;
    else
      raise exception using message = 'UNKNOWN_IMPORT_DOCUMENT_KIND';
    end if;

    v_document_count := v_document_count + 1;
    for v_item in select value from jsonb_array_elements(v_document -> 'items')
    loop
      v_position := (v_item ->> 'linePosition')::integer;
      if v_header ->> 'kind' = 'commercial' then
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
          v_id,
          null,
          v_item ->> 'description',
          (v_item ->> 'qty')::numeric,
          (v_item ->> 'uom')::public.uom_type,
          nullif(v_item ->> 'unitPrice', '')::numeric,
          nullif(v_item ->> 'lineTotal', '')::numeric,
          v_position
        );
      else
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
          v_id,
          null,
          v_item ->> 'description',
          (v_item ->> 'qty')::numeric,
          (v_item ->> 'uom')::public.uom_type,
          nullif(v_item ->> 'unitPrice', '')::numeric,
          nullif(v_item ->> 'lineTotal', '')::numeric,
          v_position
        );
      end if;
      v_item_count := v_item_count + 1;
    end loop;
  end loop;

  -- Apply revision state only after every imported header exists. This
  -- permits arbitrary document ordering without transiently violating the
  -- one-current-revision unique index.
  for v_document in
    select value
    from jsonb_array_elements(p_documents)
    where value -> 'header' ->> 'kind' = 'commercial'
  loop
    v_header := v_document -> 'header';
    v_supersedes_id := null;
    if nullif(v_header ->> 'supersedesQuotationNumber', '') is not null then
      select document_id into v_supersedes_id
      from tmp_imported_quotation_ids
      where quotation_number = v_header ->> 'supersedesQuotationNumber';
      if not found then
        raise exception using message = 'IMPORT_SUPERSEDES_NOT_FOUND';
      end if;
    end if;

    update public.commercial_documents
    set
      supersedes_document_id = v_supersedes_id,
      is_current_revision = (v_header ->> 'isCurrentRevision')::boolean
    where quotation_number = v_header ->> 'quotationNumber';
  end loop;

  for v_seed in select value from jsonb_array_elements(p_counter_seeds)
  loop
    insert into private.document_number_counters (
      series,
      year_code,
      last_value,
      updated_at
    ) values (
      v_seed ->> 'series',
      (v_seed ->> 'yearCode')::smallint,
      (v_seed ->> 'lastValue')::integer,
      now()
    )
    on conflict (series, year_code)
    do update set
      last_value = greatest(
        private.document_number_counters.last_value,
        excluded.last_value
      ),
      updated_at = now();
    v_seed_count := v_seed_count + 1;
  end loop;

  return jsonb_build_object(
    'documents', v_document_count,
    'items', v_item_count,
    'counter_seeds', v_seed_count
  );
end;
$$;

revoke all privileges on function public.admin_import_normalized_documents(
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.admin_import_normalized_documents(
  jsonb,
  jsonb
) to service_role;
