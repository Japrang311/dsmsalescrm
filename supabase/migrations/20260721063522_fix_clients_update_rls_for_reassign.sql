-- Fix clients_update RLS policy: replace private.is_active_business_owner()
-- with an inline subquery so WITH CHECK resolves correctly in RLS context.
-- This allows managers/super_admin to reassign owner_id on clients.

drop policy if exists "clients_update" on public.clients;

create policy "clients_update"
on public.clients
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  exists (
    select 1
    from public.profiles
    where id = owner_id
      and account_status = 'active'
      and role in ('sales', 'manager')
  )
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);
