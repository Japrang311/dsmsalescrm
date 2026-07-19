-- Keep ownership validation reusable without exposing it as a public Data API
-- RPC. Sales and Manager are operational owners; Executive, Super Admin, and
-- every inactive profile are invalid ownership/target destinations.
create schema if not exists private;

revoke all privileges on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_active_business_owner(candidate_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = candidate_id
      and account_status = 'active'
      and role in ('sales', 'manager')
  );
$$;

revoke all privileges on function private.is_active_business_owner(uuid)
from public, anon;
grant execute on function private.is_active_business_owner(uuid)
to authenticated, service_role;

-- Privileged website writers may create or correct business rows only while
-- their preserved owner remains an active Sales or Manager profile.
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;

create policy "clients_insert"
on public.clients
for insert
to authenticated
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

create policy "clients_update"
on public.clients
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;

create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

create policy "tasks_update"
on public.tasks
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

drop policy if exists "commercial_items_insert" on public.commercial_items;
drop policy if exists "commercial_items_update" on public.commercial_items;

create policy "commercial_items_insert"
on public.commercial_items
for insert
to authenticated
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

create policy "commercial_items_update"
on public.commercial_items
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

drop policy if exists "sales_orders_insert" on public.sales_orders;
drop policy if exists "sales_orders_update" on public.sales_orders;

create policy "sales_orders_insert"
on public.sales_orders
for insert
to authenticated
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

create policy "sales_orders_update"
on public.sales_orders
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

drop policy if exists "follow_up_logs_insert" on public.follow_up_logs;

create policy "follow_up_logs_insert"
on public.follow_up_logs
for insert
to authenticated
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

-- Target destinations use the same active Sales-or-Manager invariant.
drop policy if exists "targets_insert_manager" on public.targets;
drop policy if exists "targets_update_manager" on public.targets;

create policy "targets_insert_manager"
on public.targets
for insert
to authenticated
with check (
  (select public.current_user_role()) in ('manager', 'super_admin')
  and (select private.is_active_business_owner(sales_id))
);

create policy "targets_update_manager"
on public.targets
for update
to authenticated
using ((select public.current_user_role()) in ('manager', 'super_admin'))
with check (
  (select public.current_user_role()) in ('manager', 'super_admin')
  and (select private.is_active_business_owner(sales_id))
);

-- Website-authored audit rows must name the authenticated caller as actor.
-- The owner still represents the operational Sales/Manager owner separately.
drop policy if exists "activity_log_insert" on public.activity_log;

create policy "activity_log_insert"
on public.activity_log
for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

-- Browser callers may provide business event fields only. Database defaults
-- own immutable identity/time; service_role keeps its pre-existing full grant.
revoke insert on table public.activity_log from authenticated;
grant insert (
  kind,
  owner_id,
  actor_id,
  client_id,
  task_id,
  commercial_item_id,
  sales_order_id,
  title,
  detail
) on table public.activity_log to authenticated;

-- RLS owner filters and profile foreign-key checks need ordinary btree indexes
-- as these relations grow.
create index if not exists clients_owner_id_idx
on public.clients using btree (owner_id);

create index if not exists tasks_owner_id_idx
on public.tasks using btree (owner_id);

create index if not exists commercial_items_owner_id_idx
on public.commercial_items using btree (owner_id);

create index if not exists sales_orders_owner_id_idx
on public.sales_orders using btree (owner_id);

create index if not exists follow_up_logs_owner_id_idx
on public.follow_up_logs using btree (owner_id);

create index if not exists activity_log_owner_id_idx
on public.activity_log using btree (owner_id);
