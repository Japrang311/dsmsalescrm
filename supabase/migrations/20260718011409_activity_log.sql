-- Migration: activity_log
--
-- Plain-language summary: a real, append-only audit trail table backing
-- the Activity Log page (src/routes/_app.activity.tsx). This is a new
-- addition beyond the original Tasks 12-14 scope — the Activity Log page
-- previously only aggregated session-local mock/session-store events
-- (follow-ups, status changes, item/task/SO creation), which don't persist
-- anywhere real. This table gives those events a durable, RLS-scoped home.
--
-- Scope note: only ONE real write path exists in the app today
-- (updateClientStatus, wired below via logActivity in
-- src/lib/data/clients.ts). Every other event kind the Activity Log page
-- currently shows (follow-ups, commercial item / task / SO creation) is
-- still session-store/mock-only, because those features themselves haven't
-- been wired to real Supabase writes yet (that's out of scope for this
-- table — it happens feature-by-feature in later phases, same as
-- everything else in this migration). The page merges real rows from this
-- table with the existing session-store feed rather than replacing it.
--
-- `owner_id` is deliberately denormalized (copied from whichever related
-- entity's owner it is at insert time) rather than requiring RLS to join
-- across clients/tasks/commercial_items/sales_orders to figure out
-- scoping — same 3-role pattern as every other table (sales sees their
-- own, manager/executive see all), just resolved once at write time.

create type public.activity_kind as enum (
  'client_created',
  'client_status_change',
  'task_created',
  'task_status_change',
  'commercial_item_created',
  'commercial_item_stage_change',
  'sales_order_created',
  'sales_order_tax_change'
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  kind public.activity_kind not null,
  owner_id uuid not null references public.profiles (id),
  actor_id uuid not null references public.profiles (id),
  client_id uuid references public.clients (id),
  task_id uuid references public.tasks (id),
  commercial_item_id uuid references public.commercial_items (id),
  sales_order_id uuid references public.sales_orders (id),
  title text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "activity_log_select"
on public.activity_log
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

-- Insert-only for authenticated users: sales can log activity on their own
-- entities, manager can log on anyone's. No update/delete policy for any
-- role — an audit trail that can be edited after the fact isn't one.
create policy "activity_log_insert"
on public.activity_log
for insert
to authenticated
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

grant select, insert on public.activity_log to authenticated;
grant select, insert, update, delete on public.activity_log to service_role;
