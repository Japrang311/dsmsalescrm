-- Reassert the Data API boundary for every exposed public table. The
-- revenue_recognized view remains security_invoker and inherits the
-- sales_orders row policies below.
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.commercial_items enable row level security;
alter table public.sales_orders enable row level security;
alter table public.follow_up_logs enable row level security;
alter table public.targets enable row level security;
alter table public.org_settings enable row level security;
alter table public.activity_log enable row level security;

-- Owner-bearing business tables: active Sales remains owner-only, active
-- Manager keeps company-wide read/write, active Executive remains read-only,
-- and active Super Admin gains supported company-wide read/write access.
drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;

create policy "clients_select"
on public.clients
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "clients_insert"
on public.clients
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
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
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;

create policy "tasks_select"
on public.tasks
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
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
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

drop policy if exists "commercial_items_select" on public.commercial_items;
drop policy if exists "commercial_items_insert" on public.commercial_items;
drop policy if exists "commercial_items_update" on public.commercial_items;

create policy "commercial_items_select"
on public.commercial_items
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "commercial_items_insert"
on public.commercial_items
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
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
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

drop policy if exists "sales_orders_select" on public.sales_orders;
drop policy if exists "sales_orders_insert" on public.sales_orders;
drop policy if exists "sales_orders_update" on public.sales_orders;

create policy "sales_orders_select"
on public.sales_orders
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "sales_orders_insert"
on public.sales_orders
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
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
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

-- Follow-up history remains append-only: only SELECT and INSERT policies.
drop policy if exists "follow_up_logs_select" on public.follow_up_logs;
drop policy if exists "follow_up_logs_insert" on public.follow_up_logs;

create policy "follow_up_logs_select"
on public.follow_up_logs
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "follow_up_logs_insert"
on public.follow_up_logs
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

-- Targets remain Sales-own read, Manager/Super-Admin write, and
-- Executive company-wide read-only.
drop policy if exists "targets_select_own_or_privileged" on public.targets;
drop policy if exists "targets_insert_manager" on public.targets;
drop policy if exists "targets_update_manager" on public.targets;

create policy "targets_select_own_or_privileged"
on public.targets
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and sales_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "targets_insert_manager"
on public.targets
for insert
to authenticated
with check ((select public.current_user_role()) in ('manager', 'super_admin'));

create policy "targets_update_manager"
on public.targets
for update
to authenticated
using ((select public.current_user_role()) in ('manager', 'super_admin'))
with check ((select public.current_user_role()) in ('manager', 'super_admin'));

-- All four active roles need company configuration for application reads.
-- Only Manager and Super Admin may update the singleton.
drop policy if exists "org_settings_select" on public.org_settings;
drop policy if exists "org_settings_update" on public.org_settings;

create policy "org_settings_select"
on public.org_settings
for select
to authenticated
using (
  (select public.current_user_role()) in ('sales', 'manager', 'executive', 'super_admin')
);

create policy "org_settings_update"
on public.org_settings
for update
to authenticated
using ((select public.current_user_role()) in ('manager', 'super_admin'))
with check ((select public.current_user_role()) in ('manager', 'super_admin'));

-- Activity Log remains immutable for website roles. Super Admin receives
-- company-wide SELECT and supported INSERT only; no UPDATE/DELETE policy is
-- created.
drop policy if exists "activity_log_select" on public.activity_log;
drop policy if exists "activity_log_insert" on public.activity_log;

create policy "activity_log_select"
on public.activity_log
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "activity_log_insert"
on public.activity_log
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

-- Explicit Data API privileges complement RLS. Anon receives no public
-- relation privileges, and authenticated gets only each domain's supported
-- operations. In particular, no authenticated DELETE grant exists.
revoke all privileges on table
  public.profiles,
  public.clients,
  public.tasks,
  public.commercial_items,
  public.sales_orders,
  public.follow_up_logs,
  public.targets,
  public.org_settings,
  public.activity_log,
  public.revenue_recognized
from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert on table
  public.clients,
  public.tasks,
  public.commercial_items,
  public.sales_orders
to authenticated;

-- Business corrections deliberately exclude owner_id. Ownership may only be
-- changed by the protected transfer action introduced in the lifecycle task.
grant update (
  name,
  status,
  source,
  spending_ytd,
  last_fu,
  next_fu
) on table public.clients to authenticated;

grant update (
  client_id,
  commercial_item_id,
  title,
  due_date,
  method,
  status,
  priority,
  archived
) on table public.tasks to authenticated;

grant update (
  client_id,
  type,
  source_flow,
  stage,
  description,
  project_name,
  estimated_value,
  updated_at,
  rfq_number,
  quotation_number,
  customer_po_number,
  so_number,
  tax_type,
  prototype_status,
  next_action_date,
  qty,
  unit_price
) on table public.commercial_items to authenticated;

grant update (
  so_number,
  client_id,
  type,
  tax_type,
  prototype_status,
  source,
  value,
  date,
  qty,
  unit_price
) on table public.sales_orders to authenticated;

grant select, insert, update on table public.targets to authenticated;
grant select, insert on table
  public.follow_up_logs,
  public.activity_log
to authenticated;
grant select, update on table public.org_settings to authenticated;
grant select on table public.revenue_recognized to authenticated;
