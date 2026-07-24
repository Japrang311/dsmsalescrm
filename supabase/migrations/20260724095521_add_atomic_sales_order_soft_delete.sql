create or replace function public.set_sales_order_deleted(
  p_sales_order_id uuid,
  p_deleted boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role := public.current_user_role();
  v_sales_order public.sales_orders%rowtype;
  v_action text;
begin
  if v_actor_id is null
    or v_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using
      errcode = '42501',
      message = 'Anda tidak memiliki izin untuk mengubah status penghapusan Sales Order ini.';
  end if;

  select *
  into v_sales_order
  from public.sales_orders
  where id = p_sales_order_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Sales Order tidak ditemukan.';
  end if;

  if p_deleted then
    if v_sales_order.deleted_at is not null then
      raise exception using
        errcode = '23514',
        message = 'Sales Order ini sudah dihapus.';
    end if;

    update public.sales_orders
    set deleted_at = now(),
        deleted_by = v_actor_id
    where id = p_sales_order_id
      and deleted_at is null;

    v_action := 'dihapus';
  else
    if v_sales_order.deleted_at is null then
      raise exception using
        errcode = '23514',
        message = 'Sales Order ini tidak sedang dihapus.';
    end if;

    update public.sales_orders
    set deleted_at = null,
        deleted_by = null
    where id = p_sales_order_id
      and deleted_at is not null;

    v_action := 'dipulihkan';
  end if;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    sales_order_id,
    title,
    detail
  )
  values (
    case
      when p_deleted then 'sales_order_deleted'
      else 'sales_order_restored'
    end::public.activity_kind,
    v_sales_order.owner_id,
    v_actor_id,
    v_sales_order.client_id,
    v_sales_order.id,
    'Sales Order ' || v_action,
    v_sales_order.so_number
  );
end;
$$;

revoke execute
  on function public.set_sales_order_deleted(uuid, boolean)
  from public, anon;

grant execute
  on function public.set_sales_order_deleted(uuid, boolean)
  to authenticated;
