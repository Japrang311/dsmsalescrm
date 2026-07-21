-- Fix two issues blocking client reassignment (and potentially other operations):
-- 1. activity_log GRANT missing commercial_document_id column (added in a later migration)
-- 2. activity_log_insert policy uses private.is_active_business_owner() with broken search_path

-- Add the missing column to the authenticated INSERT grant on activity_log
revoke insert on table public.activity_log from authenticated;
grant insert (
  kind,
  owner_id,
  actor_id,
  client_id,
  task_id,
  commercial_item_id,
  commercial_document_id,
  sales_order_id,
  title,
  detail
) on table public.activity_log to authenticated;

-- Fix activity_log_insert policy: replace private.is_active_business_owner()
-- with an inline subquery
drop policy if exists "activity_log_insert" on public.activity_log;

create policy "activity_log_insert"
on public.activity_log
for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (
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
