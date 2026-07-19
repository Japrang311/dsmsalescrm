-- Migration: targets
--
-- Plain-language summary: replaces the previously hardcoded monthly sales
-- targets (MONTHLY_TARGETS_PER_SALES in mock data) with a real table. Each
-- row is one sales rep's target for one month of one year. The "company"
-- monthly/YTD target shown on Manager/Executive dashboards is computed as
-- the sum of every sales rep's target for that month — not stored as its
-- own row, so there's one source of truth.

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  sales_id uuid not null references public.profiles (id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  target bigint not null default 0 check (target >= 0),
  created_at timestamptz not null default now(),
  unique (sales_id, year, month)
);

alter table public.targets enable row level security;

-- Read: sales sees only their own rows; manager/executive see every row
-- (needed to sum up the company-wide target).
create policy "targets_select_own_or_privileged"
on public.targets
for select
to authenticated
using (
  sales_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

-- Write: only managers set targets (per PRD §14/§15 and spec Task 18 —
-- "editable by managers"). Executives are read-only company-wide, same as
-- every other table.
create policy "targets_insert_manager"
on public.targets
for insert
to authenticated
with check (public.current_user_role() = 'manager');

create policy "targets_update_manager"
on public.targets
for update
to authenticated
using (public.current_user_role() = 'manager')
with check (public.current_user_role() = 'manager');

-- No DELETE policy — a target is corrected via update (upsert), not removed.

grant select, insert, update on public.targets to authenticated;
grant select, insert, update, delete on public.targets to service_role;
