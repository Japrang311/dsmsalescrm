-- RPC to reassign a client's owner. Uses SECURITY DEFINER to bypass RLS,
-- avoiding the permission_denied errors that block direct table updates.
-- Authorization is enforced inside the function itself.

create or replace function public.reassign_client_owner(
  p_client_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_old_owner_id uuid;
  v_new_owner_name text;
begin
  -- Must be manager or super_admin
  v_caller_role := (select public.current_user_role())::text;
  if v_caller_role not in ('manager', 'super_admin') then
    raise exception 'Hanya manager yang bisa reassign klien'
      using errcode = '42501';
  end if;

  -- Client must exist
  select owner_id into v_old_owner_id
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Klien tidak ditemukan'
      using errcode = 'P0002';
  end if;

  -- New owner must be an active sales or manager profile
  select name into v_new_owner_name
  from public.profiles
  where id = p_new_owner_id
    and account_status = 'active'
    and role in ('sales', 'manager');

  if not found then
    raise exception 'Sales tujuan tidak valid'
      using errcode = 'P0002';
  end if;

  -- Perform the update (bypasses RLS because of SECURITY DEFINER)
  update public.clients
  set owner_id = p_new_owner_id
  where id = p_client_id;
end;
$$;

grant execute on function public.reassign_client_owner(uuid, uuid)
to authenticated;
