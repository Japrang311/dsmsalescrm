-- Migration: tasks
--
-- Plain-language summary: this is the "follow-up / task" table (PRD.md §7),
-- mirroring src/lib/mock/data.ts's Task type. Every task belongs to a
-- client, and optionally to a commercial item (RFQ/quotation/etc) — but
-- commercial_items doesn't exist yet (Phase 4), so commercial_item_id is
-- just a plain nullable uuid column for now, with no foreign-key
-- constraint. Task 10 (Phase 4) will add that constraint once the target
-- table exists — until then this column has no referential integrity, so
-- don't rely on it meaning anything real yet.

create type public.task_status as enum ('Today', 'Overdue', 'Upcoming', 'Done');
create type public.task_method as enum ('Phone', 'Email', 'Visit', 'WhatsApp', 'Meeting');
create type public.task_priority as enum ('High', 'Normal', 'Low');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  owner_id uuid not null references public.profiles (id),
  commercial_item_id uuid,
  title text not null,
  due_date date not null,
  method public.task_method not null,
  status public.task_status not null default 'Upcoming',
  priority public.task_priority not null default 'Normal',
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

-- Same three-role pattern as clients: sales own-only, manager all,
-- executive read-only.
create policy "tasks_select"
on public.tasks
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

create policy "tasks_update"
on public.tasks
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

-- No DELETE policy, same reasoning as clients (PRD §9: archive/complete
-- over hard delete — a task is "done" via status, not removed).

grant select, insert, update on public.tasks to authenticated;
grant select, insert, update, delete on public.tasks to service_role;
