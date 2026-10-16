-- Even privileged importer paths bump the parent version. The command locks
-- parent before touching items; its final audit/version update is transactional.
create or replace function private.recompute_sales_order_total()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(new.sales_order_id,old.sales_order_id); v_parent public.sales_orders%rowtype;
begin
  select * into v_parent from public.sales_orders where id=v_id for update;
  if not found then return coalesce(new,old); end if;
  update public.sales_orders set
    total_value=case when v_parent.prototype_status is not distinct from 'FOC' then null else (select coalesce(sum(line_total),0) from public.sales_order_items where sales_order_id=v_id) end,
    updated_at=greatest(clock_timestamp(),v_parent.updated_at+interval '1 microsecond') where id=v_id;
  return coalesce(new,old);
end $$;

create function public.correct_sales_order_item(
  p_id uuid, p_expected_updated_at timestamptz, p_request_id uuid,
  p_operation text, p_item_id uuid default null, p_item jsonb default '{}'::jsonb,
  p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_role public.app_role:=public.current_user_role();
  v_parent public.sales_orders%rowtype; v_before public.sales_order_items%rowtype; v_after public.sales_order_items%rowtype;
  v_replay private.crm_command_replays%rowtype; v_payload jsonb; v_result jsonb; v_audit uuid;
  v_foc boolean; v_changed boolean:=false; v_position int;
begin
  if v_actor is null or v_role is null or v_role not in ('sales','manager','super_admin') then raise exception 'ACTIVE_MUTATING_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_request_id is null or p_expected_updated_at is null or p_operation is null or p_operation not in ('add','update','delete') or jsonb_typeof(p_item) is distinct from 'object' then raise exception 'INVALID_COMMAND_INPUT'; end if;
  if exists(select 1 from jsonb_object_keys(p_item) k where k not in ('productName','description','qty','uom','unitPrice')) then raise exception 'PATCH_FIELD_NOT_ALLOWED'; end if;
  v_payload:=jsonb_build_object('id',p_id,'version',p_expected_updated_at,'operation',p_operation,'itemId',p_item_id,'item',p_item,'reason',p_reason);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||'item'||p_request_id::text,0));
  select * into v_parent from public.sales_orders where id=p_id and deleted_at is null for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND'; end if;
  if v_role='sales' and v_parent.owner_id<>v_actor then raise exception 'SALES_ORDER_OWNERSHIP_REQUIRED' using errcode='42501'; end if;
  if not private.is_active_business_owner(v_parent.owner_id) then raise exception 'ACTIVE_BUSINESS_OWNER_REQUIRED'; end if;
  select * into v_replay from private.crm_command_replays where actor_id=v_actor and command='item' and request_id=p_request_id;
  if found then
    if v_replay.payload<>v_payload then raise exception 'REQUEST_PAYLOAD_MISMATCH'; end if;
    return v_replay.result;
  end if;
  if v_parent.updated_at<>p_expected_updated_at then raise exception 'STALE_VERSION'; end if;
  v_foc:=v_parent.prototype_status is not distinct from 'FOC';
  if p_operation in ('update','delete') then
    select * into v_before from public.sales_order_items where id=p_item_id and sales_order_id=p_id for update;
    if not found then raise exception 'SALES_ORDER_ITEM_NOT_FOUND'; end if;
  end if;
  if p_operation<>'delete' then
    perform private.assert_document_items(jsonb_build_array(p_item),not v_foc);
    if v_foc and p_item->>'unitPrice' is not null then raise exception 'FOC_MONEY_MUST_BE_NULL'; end if;
    if (p_item->>'qty') in ('NaN','Infinity','-Infinity') or (p_item->>'unitPrice') in ('NaN','Infinity','-Infinity') then raise exception 'FINITE_MONEY_REQUIRED'; end if;
    v_after:=v_before;
    v_after.product_name:=btrim(p_item->>'productName'); v_after.description:=nullif(btrim(p_item->>'description'),'');
    v_after.qty:=(p_item->>'qty')::numeric; v_after.uom:=(p_item->>'uom')::public.uom_type;
    v_after.unit_price:=case when v_foc then null else (p_item->>'unitPrice')::numeric end;
    v_after.line_total:=v_after.qty*v_after.unit_price;
  end if;
  v_changed:=p_operation<>'update' or v_before is distinct from v_after;
  if v_changed then
    if nullif(btrim(p_reason),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
    if p_operation='add' then
      select coalesce(max(line_position),0)+1 into v_position from public.sales_order_items where sales_order_id=p_id;
      insert into public.sales_order_items(sales_order_id,product_name,description,qty,uom,unit_price,line_total,line_position)
      values(p_id,v_after.product_name,v_after.description,v_after.qty,v_after.uom,v_after.unit_price,v_after.line_total,v_position) returning * into v_after;
    elsif p_operation='update' then
      update public.sales_order_items set product_name=v_after.product_name,description=v_after.description,qty=v_after.qty,uom=v_after.uom,unit_price=v_after.unit_price,line_total=v_after.line_total where id=p_item_id returning * into v_after;
    else
      delete from public.sales_order_items where id=p_item_id;
    end if;
    update public.sales_orders set updated_at=greatest(clock_timestamp(),v_parent.updated_at+interval '1 microsecond') where id=p_id;
    insert into public.activity_log(kind,owner_id,actor_id,client_id,sales_order_id,title,detail,event_data)
    values('sales_order_item_change',v_parent.owner_id,v_actor,v_parent.client_id,p_id,'Koreksi item Sales Order',p_reason,
      jsonb_build_object('schema_version',1,'before',case when p_operation='add' then null else to_jsonb(v_before) end,'after',case when p_operation='delete' then null else to_jsonb(v_after) end,'operation',p_operation,'request_id',p_request_id,'reason',p_reason)) returning id into v_audit;
  end if;
  select * into v_parent from public.sales_orders where id=p_id;
  v_result:=jsonb_build_object('record',to_jsonb(v_parent)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by line_position,id),'[]'::jsonb) from public.sales_order_items i where sales_order_id=p_id)),'auditId',v_audit);
  insert into private.crm_command_replays(actor_id,command,request_id,payload,result) values(v_actor,'item',p_request_id,v_payload,v_result);
  return v_result;
end $$;
revoke all on function public.correct_sales_order_item(uuid,timestamptz,uuid,text,uuid,jsonb,text) from public,anon;
grant execute on function public.correct_sales_order_item(uuid,timestamptz,uuid,text,uuid,jsonb,text) to authenticated;
