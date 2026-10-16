-- Private replay results are never exposed through the Data API. No automatic
-- purge: retain at least 30 days; any later purge must retain created_at >= now-30d.
create table if not exists private.crm_command_replays (
  actor_id uuid not null, command text not null, request_id uuid not null,
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,command,request_id)
);
alter table private.crm_command_replays enable row level security;
revoke all on private.crm_command_replays from public,anon,authenticated,service_role;

do $$ declare v_old text; begin
  select pg_get_expr(conbin,conrelid) into v_old from pg_constraint
  where conname='activity_log_event_data_valid' and conrelid='public.activity_log'::regclass;
  alter table public.activity_log drop constraint activity_log_event_data_valid;
  execute format('alter table public.activity_log add constraint activity_log_event_data_valid check ((%s) or (kind in (''sales_order_header_change'',''sales_order_item_change'') and jsonb_typeof(event_data)=''object'' and event_data->>''schema_version''=''1'' and event_data ?& array[''before'',''after'',''request_id'',''reason'']))',v_old);
end $$;

create function private.crm_so_write_boundary() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user = 'authenticated' then
    if tg_table_name='sales_order_items' then raise exception 'SALES_ORDER_COMMAND_REQUIRED'; end if;
    if tg_table_name='activity_log' then
      if new.kind in ('sales_order_header_change','sales_order_item_change') then raise exception 'SERVER_AUDIT_REQUIRED'; end if;
    end if;
    if tg_table_name='sales_orders' then
      if to_jsonb(new)-array['deleted_at','deleted_by'] is distinct from to_jsonb(old)-array['deleted_at','deleted_by'] then raise exception 'SALES_ORDER_COMMAND_REQUIRED'; end if;
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger crm_so_write_boundary before update on public.sales_orders for each row execute function private.crm_so_write_boundary();
create trigger crm_so_item_write_boundary before insert or update or delete on public.sales_order_items for each row execute function private.crm_so_write_boundary();
create trigger crm_so_audit_write_boundary before insert on public.activity_log for each row execute function private.crm_so_write_boundary();
revoke all on function private.crm_so_write_boundary() from public,anon,authenticated;

create function private.crm_so_lineage() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.commercial_documents%rowtype; v_role public.app_role := public.current_user_role();
begin
  if tg_table_name='commercial_documents' then
    if new.client_id is distinct from old.client_id and exists(select 1 from public.sales_orders where source_commercial_document_id=old.id) then raise exception 'LINKED_CLIENT_IMMUTABLE'; end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    if old.source_commercial_document_id is not null and (new.client_id is distinct from old.client_id or new.source_commercial_document_id is distinct from old.source_commercial_document_id) then raise exception 'LINKED_CLIENT_IMMUTABLE'; end if;
    -- Do not reject unrelated changes to legacy or soft-deleted linked rows.
    if new.client_id is not distinct from old.client_id and new.source_commercial_document_id is not distinct from old.source_commercial_document_id then return new; end if;
  end if;
  if new.source_commercial_document_id is null then return new; end if;
  select * into q from public.commercial_documents where id=new.source_commercial_document_id for update;
  if not found or q.type<>'Quotation' or q.stage<>'Closed Won' or not q.is_current_revision or q.deleted_at is not null then raise exception 'CURRENT_CLOSED_WON_QUOTATION_REQUIRED'; end if;
  if q.client_id<>new.client_id then raise exception 'QUOTATION_CLIENT_MISMATCH'; end if;
  if v_role='sales' and q.owner_id<>auth.uid() then raise exception 'QUOTATION_OWNERSHIP_REQUIRED'; end if;
  return new;
end $$;
create trigger crm_so_lineage before insert or update on public.sales_orders for each row execute function private.crm_so_lineage();
create trigger crm_quotation_linked_client before update of client_id on public.commercial_documents for each row execute function private.crm_so_lineage();
revoke all on function private.crm_so_lineage() from public,anon,authenticated;

create function public.correct_sales_order_header(
  p_id uuid, p_expected_updated_at timestamptz, p_request_id uuid, p_patch jsonb, p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_role public.app_role:=public.current_user_role();
  v_before public.sales_orders%rowtype; v_after public.sales_orders%rowtype;
  v_payload jsonb:=jsonb_build_object('id',p_id,'version',p_expected_updated_at,'patch',p_patch,'reason',p_reason);
  v_replay private.crm_command_replays%rowtype; v_result jsonb; v_audit uuid; v_material boolean;
begin
  if v_actor is null or v_role is null or v_role not in ('sales','manager','super_admin') then raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_request_id is null or p_expected_updated_at is null or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'INVALID_COMMAND_INPUT'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('so_number','date','client_id','customer_po_number','customer_po_date','tax_type','owner_id')) then raise exception 'PATCH_FIELD_NOT_ALLOWED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||'header'||p_request_id::text,0));
  select * into v_replay from private.crm_command_replays where actor_id=v_actor and command='header' and request_id=p_request_id;
  if found then
    if v_replay.payload<>v_payload then raise exception 'REQUEST_PAYLOAD_MISMATCH'; end if;
    if not exists(select 1 from public.sales_orders where id=p_id and deleted_at is null and (v_role<>'sales' or owner_id=v_actor)) then raise exception 'SALES_ORDER_OWNERSHIP_REQUIRED'; end if;
    return v_replay.result;
  end if;
  select * into v_before from public.sales_orders where id=p_id and deleted_at is null for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND'; end if;
  if v_role='sales' and v_before.owner_id<>v_actor then raise exception 'SALES_ORDER_OWNERSHIP_REQUIRED' using errcode='42501'; end if;
  if not private.is_active_business_owner(v_before.owner_id) then raise exception 'ACTIVE_BUSINESS_OWNER_REQUIRED'; end if;
  if v_before.updated_at<>p_expected_updated_at then raise exception 'STALE_VERSION'; end if;
  v_after:=jsonb_populate_record(v_before,p_patch);
  if v_after.owner_id<>v_before.owner_id then raise exception 'USE_OWNER_TRANSFER_COMMAND'; end if;
  if v_after.client_id is null or v_after.date is null or nullif(btrim(v_after.so_number),'') is null or nullif(btrim(v_after.customer_po_number),'') is null then raise exception 'REQUIRED_HEADER_FIELD'; end if;
  if v_after.prototype_status is distinct from 'FOC' and v_after.tax_type is null then raise exception 'TAX_TYPE_REQUIRED'; end if;
  if v_role='sales' and v_after.client_id<>v_before.client_id and not exists(select 1 from public.clients where id=v_after.client_id and owner_id=v_actor) then raise exception 'CLIENT_OWNERSHIP_REQUIRED'; end if;
  v_material:=v_after.client_id<>v_before.client_id or v_after.date<>v_before.date or v_after.so_number<>v_before.so_number or v_after.tax_type is distinct from v_before.tax_type;
  if v_after is distinct from v_before then
    if v_material and nullif(btrim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
    update public.sales_orders set client_id=v_after.client_id,so_number=btrim(v_after.so_number),date=v_after.date,
      customer_po_number=btrim(v_after.customer_po_number),customer_po_date=v_after.customer_po_date,tax_type=v_after.tax_type,
      updated_at=greatest(clock_timestamp(),v_before.updated_at+interval '1 microsecond')
      where id=p_id returning * into v_after;
    insert into public.activity_log(kind,owner_id,actor_id,client_id,sales_order_id,title,detail,event_data)
    values('sales_order_header_change',v_before.owner_id,v_actor,v_after.client_id,p_id,'Koreksi header Sales Order',p_reason,
      jsonb_build_object('schema_version',1,'before',to_jsonb(v_before),'after',to_jsonb(v_after),'request_id',p_request_id,'reason',p_reason)) returning id into v_audit;
  end if;
  v_result:=jsonb_build_object('record',to_jsonb(v_after)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by line_position,id),'[]'::jsonb) from public.sales_order_items i where sales_order_id=p_id)),'auditId',v_audit);
  insert into private.crm_command_replays(actor_id,command,request_id,payload,result) values(v_actor,'header',p_request_id,v_payload,v_result);
  return v_result;
end $$;
revoke all on function public.correct_sales_order_header(uuid,timestamptz,uuid,jsonb,text) from public,anon;
grant execute on function public.correct_sales_order_header(uuid,timestamptz,uuid,jsonb,text) to authenticated;
