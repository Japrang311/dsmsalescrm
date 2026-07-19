-- Migration: follow_up_logs
--
-- Plain-language summary: a real table backing follow-up logging
-- (`LogFollowUpDialog.tsx` and `LogCommercialFollowUpDialog.tsx`),
-- matching the mock `FollowUpRecord` shape from session-store.ts closely
-- (Task 27, per the project owner's "as per mockup" call). A separate
-- table rather than columns on `tasks`: a follow-up carries richer fields
-- (method, result, next action, potential value, notes) than fits inline,
-- and a client accumulates many follow-up records over time — same
-- history semantics as `activity_log`, just domain-specific instead of a
-- generic audit trail.

create type public.follow_up_result as enum (
  'No Response', 'Interested', 'Need Quotation', 'Quotation Sent',
  'Negotiation', 'Waiting PO', 'PO Confirmed', 'Not Interested',
  'Follow-up Later'
);

create table public.follow_up_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id),
  client_id uuid not null references public.clients (id),
  commercial_item_id uuid references public.commercial_items (id),
  owner_id uuid not null references public.profiles (id),
  fu_date date not null,
  method public.task_method not null,
  result public.follow_up_result not null,
  next_action text,
  next_fu_date date,
  customer_status public.client_status,
  potential_value numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.follow_up_logs enable row level security;

-- Same 3-role pattern as every other table: sales own-only, manager all,
-- executive read-only.
create policy "follow_up_logs_select"
on public.follow_up_logs
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

-- Insert-only for sales/manager — like activity_log, a follow-up log is an
-- append-only record, corrected by logging a new one, not editing history.
-- No update/delete policy for any role.
create policy "follow_up_logs_insert"
on public.follow_up_logs
for insert
to authenticated
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

grant select, insert on public.follow_up_logs to authenticated;
grant select, insert, update, delete on public.follow_up_logs to service_role;
