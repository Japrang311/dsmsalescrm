-- Migration: sales_orders
--
-- Plain-language summary: this is the revenue table (PRD.md §7 "Sales
-- Order" / "Revenue"), mirroring src/lib/mock/data.ts's SalesOrder type.
-- It also implements the single most important business rule in the whole
-- spec (PRD §7/§15): a Prototype "FOC" (free-of-charge) order is real
-- operational work, but contributes ZERO to revenue and target
-- achievement — only Regular paid orders and Prototype "Paid" orders
-- count. That rule is enforced two ways here, not just trusted to app code:
--   1. A check constraint makes it impossible to store a FOC row with a
--      value, or a non-FOC row without one.
--   2. The `revenue_recognized` view below excludes FOC rows entirely —
--      application code should read revenue totals from this view, never
--      by re-summing `sales_orders.value` itself and hoping to remember
--      the FOC exclusion every time.
--
-- `tax_type` and `prototype_status` already exist (created in the
-- commercial_items migration) and are reused as-is here.

create type public.so_type as enum ('Regular', 'Prototype');
create type public.revenue_source as enum ('RFQ / New Product', 'Existing / Repeat Order', 'Prototype Paid', 'Prototype FOC');

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null,
  client_id uuid not null references public.clients (id),
  owner_id uuid not null references public.profiles (id),
  type public.so_type not null,
  tax_type public.tax_type,
  prototype_status public.prototype_status,
  source public.revenue_source not null,
  value numeric,
  date date not null,
  created_at timestamptz not null default now(),
  -- PRD §7: "SO value: required for paid SO; must be left empty for
  -- Prototype FOC." Enforced here, not just in the UI. Uses
  -- IS [NOT] DISTINCT FROM throughout, not `=`/`<>` — a plain `=` against a
  -- NULL prototype_status (the common case: Regular orders never set this
  -- column) evaluates to NULL rather than false, and Postgres treats a NULL
  -- check result as passing, silently letting a null-value Regular row
  -- through.
  constraint sales_orders_foc_value_shape check (
    (prototype_status is not distinct from 'FOC' and value is null)
    or (prototype_status is distinct from 'FOC' and value is not null)
  )
);

alter table public.sales_orders enable row level security;

create policy "sales_orders_select"
on public.sales_orders
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

create policy "sales_orders_insert"
on public.sales_orders
for insert
to authenticated
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

create policy "sales_orders_update"
on public.sales_orders
for update
to authenticated
using (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
)
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

-- No DELETE policy — same reasoning as clients/tasks/commercial_items
-- (PRD §9: archive over hard delete). Revenue records especially must
-- never silently disappear.

grant select, insert, update on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_orders to service_role;

-- The revenue-inclusion rule, as a view: excludes Prototype FOC rows.
-- `security_invoker = true` makes the view run with the QUERYING user's
-- own RLS permissions (Postgres default is the view owner's permissions,
-- which would bypass RLS entirely since the owner is the admin role) — so
-- this view is exactly as role-scoped as the underlying table.
create view public.revenue_recognized
with (security_invoker = true) as
select *
from public.sales_orders
where prototype_status is distinct from 'FOC';

grant select on public.revenue_recognized to authenticated;
grant select on public.revenue_recognized to service_role;
