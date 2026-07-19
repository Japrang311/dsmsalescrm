do $$
declare
  v_count integer;
  v_total numeric;
begin
  select count(*) into v_count
  from public.commercial_documents
  where quotation_base_number = 'DSM-26QUO-0404';
  if v_count <> 2 then
    raise exception 'FIXTURE_QUOTATION_HEADER_COUNT_MISMATCH';
  end if;

  select count(*) into v_count
  from public.commercial_document_items i
  join public.commercial_documents d
    on d.id = i.commercial_document_id
  where d.quotation_base_number = 'DSM-26QUO-0404';
  if v_count <> 3 then
    raise exception 'FIXTURE_QUOTATION_ITEM_COUNT_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.commercial_documents
    where quotation_number = 'DSM-26QUO-0404_REV.01'
      and quotation_revision = 1
      and is_current_revision
      and supersedes_document_id is not null
  ) then
    raise exception 'FIXTURE_QUOTATION_REVISION_MISMATCH';
  end if;

  select count(*), max(total_value) into v_count, v_total
  from public.sales_orders
  where so_number = 'DSM-26SO143';
  if v_count <> 1 or v_total <> 42000000 then
    raise exception 'FIXTURE_SO_GROUP_OR_TOTAL_MISMATCH';
  end if;

  select count(*) into v_count
  from public.sales_order_items i
  join public.sales_orders s on s.id = i.sales_order_id
  where s.so_number = 'DSM-26SO143';
  if v_count <> 2 then
    raise exception 'FIXTURE_SO_ITEM_COUNT_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.sales_orders s
    join public.sales_order_items i on i.sales_order_id = s.id
    where s.so_number = 'DSM-26NP016'
      and s.date = date '2026-01-01'
      and i.qty = 1
      and i.uom = 'Unit'
  ) then
    raise exception 'FIXTURE_EMBEDDED_UOM_OR_DATE_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.sales_orders s
    join public.sales_order_items i on i.sales_order_id = s.id
    where s.so_number = 'DSM-26PROTY007'
      and s.prototype_status = 'FOC'
      and s.total_value is null
      and i.unit_price is null
      and i.line_total is null
  ) then
    raise exception 'FIXTURE_FOC_NULL_MONEY_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.sales_orders
    where so_number = 'DSM-22SO146'
      and date = date '2026-04-01'
      and number_mode = 'Imported'
  ) then
    raise exception 'FIXTURE_HARIFF_HISTORY_MISMATCH';
  end if;

  if exists (
    select 1
    from private.document_number_counters
    where year_code = 22
  ) then
    raise exception 'HARIFF_COUNTER_MUST_NOT_EXIST';
  end if;

  if (
    select jsonb_object_agg(series, last_value order by series)
    from private.document_number_counters
    where year_code = 26
  ) <> '{"NP": 16, "PROTY": 8, "QUO": 404, "SO": 143}'::jsonb then
    raise exception 'FIXTURE_COUNTER_SEED_MISMATCH';
  end if;
end;
$$;
