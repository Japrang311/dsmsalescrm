-- Phase 11 Task 2 deterministic reconciliation. Any mismatch raises and
-- makes the command fail; the final SELECTs are the human-readable packet.
do $$
declare
  legacy_commercial_rows bigint;
  mapped_commercial_rows bigint;
  reviewed_commercial_rows bigint;
  commercial_headers bigint;
  normalized_commercial_items bigint;
  legacy_sales_order_rows bigint;
  mapped_sales_order_rows bigint;
  reviewed_sales_order_rows bigint;
  sales_order_headers bigint;
  normalized_sales_order_items bigint;
  legacy_paid_total numeric;
  normalized_paid_total numeric;
  linked_tasks bigint;
  repointed_tasks bigint;
  linked_follow_ups bigint;
  repointed_follow_ups bigint;
  linked_activity_rows bigint;
  repointed_activity_rows bigint;
begin
  if exists (
    select 1
    from private.commercial_item_id_map m
    left join private.legacy_commercial_items_20260718 l
      on l.id = m.legacy_item_id
    left join public.commercial_documents d
      on d.id = m.commercial_document_id
    left join public.commercial_document_items i
      on i.id = m.commercial_document_item_id
     and i.commercial_document_id = d.id
    where l.id is null or d.id is null or i.id is null
  ) then
    raise exception 'COMMERCIAL_MAP_ORPHAN';
  end if;

  if exists (
    select 1
    from private.sales_order_id_map m
    left join private.legacy_sales_orders_20260718 l
      on l.id = m.legacy_sales_order_id
    left join public.sales_orders s on s.id = m.sales_order_id
    left join public.sales_order_items i
      on i.id = m.sales_order_item_id
     and i.sales_order_id = s.id
    where l.id is null or s.id is null or i.id is null
  ) then
    raise exception 'SALES_ORDER_MAP_ORPHAN';
  end if;

  if (
    select count(*) from private.legacy_commercial_items_20260718
  ) <> (
    select
      (select count(*) from private.commercial_item_id_map)
      + (select count(*) from private.commercial_document_migration_review
         where source_table = 'commercial_items')
  ) then
    raise exception 'COMMERCIAL_SOURCE_COUNT_MISMATCH';
  end if;

  if (
    select count(*) from private.legacy_sales_orders_20260718
  ) <> (
    select
      (select count(*) from private.sales_order_id_map)
      + (select count(*) from private.commercial_document_migration_review
         where source_table = 'sales_orders')
  ) then
    raise exception 'SALES_ORDER_SOURCE_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
    from private.commercial_item_id_map m
    join private.legacy_commercial_items_20260718 l
      on l.id = m.legacy_item_id
    join public.commercial_document_items i
      on i.id = m.commercial_document_item_id
    where i.product_name is not null
       or i.description is distinct from l.description
       or i.qty is distinct from l.qty
       or (
         l.prototype_status = 'FOC'
         and (i.unit_price is not null or i.line_total is not null)
       )
       or (
         l.prototype_status is distinct from 'FOC'
         and (
           i.unit_price is distinct from l.unit_price
           or i.line_total is distinct from l.estimated_value
         )
       )
  ) then
    raise exception 'COMMERCIAL_VALUE_MISMATCH';
  end if;

  if exists (
    select 1
    from private.sales_order_id_map m
    join private.legacy_sales_orders_20260718 l
      on l.id = m.legacy_sales_order_id
    join public.sales_order_items i on i.id = m.sales_order_item_id
    where i.product_name is not null
       or i.qty is distinct from l.qty
       or i.unit_price is distinct from l.unit_price
       or i.line_total is distinct from l.value
  ) then
    raise exception 'SALES_ORDER_ITEM_VALUE_MISMATCH';
  end if;

  if exists (
    select quotation_base_number
    from public.commercial_documents
    where type = 'Quotation'
    group by quotation_base_number
    having count(*) filter (where is_current_revision) <> 1
  ) then
    raise exception 'QUOTATION_CURRENT_REVISION_MISMATCH';
  end if;

  if exists (
    select 1 from public.tasks
    where commercial_item_id is not null and commercial_document_id is null
  ) or exists (
    select 1 from public.follow_up_logs
    where commercial_item_id is not null and commercial_document_id is null
  ) or exists (
    select 1 from public.activity_log
    where commercial_item_id is not null and commercial_document_id is null
  ) then
    raise exception 'COMMERCIAL_HISTORY_LINK_ORPHAN';
  end if;

  select count(*) into legacy_commercial_rows
  from private.legacy_commercial_items_20260718;
  select count(*) into mapped_commercial_rows
  from private.commercial_item_id_map;
  select count(*) into reviewed_commercial_rows
  from private.commercial_document_migration_review
  where source_table = 'commercial_items';
  select count(*) into commercial_headers
  from public.commercial_documents;
  select count(*) into normalized_commercial_items
  from public.commercial_document_items;

  select count(*) into legacy_sales_order_rows
  from private.legacy_sales_orders_20260718;
  select count(*) into mapped_sales_order_rows
  from private.sales_order_id_map;
  select count(*) into reviewed_sales_order_rows
  from private.commercial_document_migration_review
  where source_table = 'sales_orders';
  select count(*) into sales_order_headers
  from public.sales_orders;
  select count(*) into normalized_sales_order_items
  from public.sales_order_items;
  select coalesce(sum(value), 0) into legacy_paid_total
  from private.legacy_sales_orders_20260718;
  select coalesce(sum(total_value), 0) into normalized_paid_total
  from public.sales_orders;

  select count(*) into linked_tasks
  from public.tasks where commercial_item_id is not null;
  select count(*) into repointed_tasks
  from public.tasks where commercial_document_id is not null;
  select count(*) into linked_follow_ups
  from public.follow_up_logs where commercial_item_id is not null;
  select count(*) into repointed_follow_ups
  from public.follow_up_logs where commercial_document_id is not null;
  select count(*) into linked_activity_rows
  from public.activity_log where commercial_item_id is not null;
  select count(*) into repointed_activity_rows
  from public.activity_log where commercial_document_id is not null;

  raise notice
    'commercial legacy=% mapped=% reviewed=% headers=% items=%',
    legacy_commercial_rows, mapped_commercial_rows,
    reviewed_commercial_rows, commercial_headers,
    normalized_commercial_items;
  raise notice
    'sales_orders legacy=% mapped=% reviewed=% headers=% items=% paid_total=% normalized_total=%',
    legacy_sales_order_rows, mapped_sales_order_rows,
    reviewed_sales_order_rows, sales_order_headers,
    normalized_sales_order_items, legacy_paid_total, normalized_paid_total;
  raise notice
    'history tasks=%/% follow_ups=%/% activity=%/%',
    repointed_tasks, linked_tasks,
    repointed_follow_ups, linked_follow_ups,
    repointed_activity_rows, linked_activity_rows;
end;
$$;
