-- Migration: clients
--
-- Plain-language summary: this is the first real business-data table — a
-- client (customer/prospect) record, matching PRD.md §7's "Client" object
-- and the same fields src/lib/mock/data.ts's Client type already uses.
--
-- Note on scope: PRD §7 also lists Revenue PPN / Revenue Non-PPN / Total
-- revenue / Active commercial items / Follow-up history / Related
-- quotations-POs-SOs on the client profile — those are NOT columns here.
-- They're computed by looking at other tables (sales_orders, tasks,
-- commercial_items) that don't exist yet (later phases). This table only
-- holds the client's own directly-owned fields.

create type public.client_status as enum ('Prospect', 'Active Customer', 'Dormant', 'Lost', 'Repeat Order');
create type public.client_source as enum ('Referral', 'Website Inquiry', 'Business Relationship', 'Repeat');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.client_status not null default 'Prospect',
  source public.client_source not null,
  owner_id uuid not null references public.profiles (id),
  spending_ytd numeric not null default 0,
  last_fu date,
  next_fu date,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

-- Read: sales sees only clients they own; manager/executive see all.
create policy "clients_select"
on public.clients
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

-- Create: sales can only create clients owned by themselves; manager can
-- create a client owned by anyone (e.g. reassigning during onboarding).
-- Executive has no insert policy at all — read-only, per PRD §9.
create policy "clients_insert"
on public.clients
for insert
to authenticated
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

-- Update: same shape as insert. Sales can edit their own; manager can edit
-- any client (e.g. correcting status per PRD §15's client-status-governance
-- rule — the app doesn't auto-change status, but a human manager can
-- correct it).
create policy "clients_update"
on public.clients
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

-- No DELETE policy for any app role, intentionally: PRD §9 says "archive is
-- preferred over hard delete because the data is used for revenue
-- tracking." Archiving means updating `status`, not deleting the row.
-- Only service_role (admin/import tooling) can delete, and it bypasses RLS.

grant select, insert, update on public.clients to authenticated;
grant select, insert, update, delete on public.clients to service_role;
