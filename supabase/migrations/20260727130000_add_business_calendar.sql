-- Migration: add_business_calendar
--
-- Sales Task Control Loop implementation-plan Task 4 / project-tracker
-- Task 49. Adds the one canonical business-day calendar and the
-- database-derived due-state function approved in
-- docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md §5.
--
-- This migration intentionally does NOT seed real Indonesian public
-- holidays or cuti bersama for any year -- doing so would mean guessing at
-- an authoritative government decree this session cannot verify. Per §5.4
-- (Product Owner decision: manual annual import), a Super Admin/Manager
-- enters real holiday rows later through Settings UI or a controlled seed,
-- once that UI exists (a later task). Until then, the table is correctly
-- empty and every due-state computation for the current year returns
-- calendar_incomplete = true, per the explicit-fallback rule in §5.5 --
-- this is the intended, tested behavior, not a gap.

create table public.business_calendar_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  label text not null,
  source text not null,
  synced_at timestamptz not null default now(),
  entered_by uuid references public.profiles (id)
);

alter table public.business_calendar_holidays enable row level security;

-- Reference data every role needs to compute due state -- not owner-scoped,
-- so a single broad read policy is correct here (RLS mandatory per table,
-- but "one row per owner" doesn't apply to a shared calendar).
create policy "business_calendar_holidays_select"
on public.business_calendar_holidays
for select
to authenticated
using (true);

-- Entry/correction is an admin action (spec §5.4): Manager or Super Admin
-- only, consistent with every other admin-maintained reference table in
-- this schema.
create policy "business_calendar_holidays_insert"
on public.business_calendar_holidays
for insert
to authenticated
with check (public.current_user_role() in ('manager', 'super_admin'));

create policy "business_calendar_holidays_delete"
on public.business_calendar_holidays
for delete
to authenticated
using (public.current_user_role() in ('manager', 'super_admin'));

-- No UPDATE policy: a correction is a delete + insert of a new row (same
-- append/replace pattern as follow_up_logs), keeping "who entered/verified
-- this row" (entered_by/synced_at) trustworthy without needing a separate
-- audit table for calendar edits.

grant select, insert, delete on public.business_calendar_holidays to authenticated;
grant select, insert, update, delete on public.business_calendar_holidays to service_role;

create index business_calendar_holidays_date_idx
on public.business_calendar_holidays using btree (holiday_date);

comment on table public.business_calendar_holidays is
'Canonical Asia/Jakarta business-day calendar: one row per holiday/cuti bersama date. Every due-state consumer (DB function, src/lib/data/business-calendar.ts, UI) reads this table -- no independent day-counting logic anywhere else after Task 4.';

-- ---------------------------------------------------------------------
-- Business-day primitives
-- ---------------------------------------------------------------------

create or replace function public.is_business_day(p_date date)
returns boolean
language sql
stable
as $$
  select extract(isodow from p_date) between 1 and 5
    and not exists (
      select 1 from public.business_calendar_holidays
      where holiday_date = p_date
    );
$$;

comment on function public.is_business_day(date) is
'True if p_date is Mon-Fri (ISO dow 1-5) and not a row in business_calendar_holidays.';

-- Counts business days strictly between start_date and end_date (both
-- endpoints excluded). Used for the escalation threshold in spec §5.2:
-- Escalated fires once 2 business days have fully elapsed since due_date,
-- not counting due_date itself or the current day.
create or replace function public.count_business_days_strictly_between(
  start_date date,
  end_date date
)
returns integer
language sql
stable
as $$
  select coalesce(count(*), 0)::integer
  from generate_series(start_date + 1, end_date - 1, interval '1 day') as d(day)
  where end_date > start_date + 1
    and public.is_business_day(d.day::date);
$$;

comment on function public.count_business_days_strictly_between(date, date) is
'Business days d with start_date < d < end_date. Returns 0 if end_date <= start_date + 1.';

-- True if business_calendar_holidays has zero rows for any calendar year
-- touched by [start_date, end_date] -- the explicit, visible fallback
-- signal required by spec §5.5 instead of silently treating a
-- never-imported year as holiday-free.
create or replace function public.business_calendar_incomplete(
  start_date date,
  end_date date
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from generate_series(
      date_trunc('year', least(start_date, end_date))::date,
      date_trunc('year', greatest(start_date, end_date))::date,
      interval '1 year'
    ) as y(year_start)
    where not exists (
      select 1 from public.business_calendar_holidays h
      where extract(year from h.holiday_date) = extract(year from y.year_start)
    )
  );
$$;

comment on function public.business_calendar_incomplete(date, date) is
'True if any calendar year spanned by [start_date, end_date] has zero holiday rows -- signals the annual import has not happened yet for that year.';

-- ---------------------------------------------------------------------
-- Due-state (spec §2.2, §5.2)
-- ---------------------------------------------------------------------

create or replace function public.compute_task_due_state(
  p_due_date date,
  p_workflow_status public.task_workflow_status,
  p_as_of date default null
)
returns table (due_state text, calendar_incomplete boolean)
language plpgsql
stable
as $$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date);
  v_incomplete boolean;
  v_business_days_elapsed integer;
begin
  -- Terminal Tasks have no active due state (spec §2.2).
  if p_workflow_status in ('Done', 'Cancelled') then
    return query select null::text, false;
    return;
  end if;

  v_incomplete := public.business_calendar_incomplete(p_due_date, v_as_of);

  if v_as_of < p_due_date then
    return query select 'Upcoming'::text, v_incomplete;
  elsif v_as_of = p_due_date then
    return query select 'Today'::text, v_incomplete;
  else
    v_business_days_elapsed := public.count_business_days_strictly_between(p_due_date, v_as_of);
    if v_business_days_elapsed >= 2 then
      return query select 'Escalated'::text, v_incomplete;
    else
      return query select 'Overdue'::text, v_incomplete;
    end if;
  end if;
end;
$$;

comment on function public.compute_task_due_state(date, public.task_workflow_status, date) is
'Derived due state for a Task: Upcoming/Today/Overdue/Escalated, or null for Done/Cancelled. p_as_of defaults to the current Asia/Jakarta date. calendar_incomplete=true means the escalation threshold may be wrong because business_calendar_holidays has no data for a year in range -- callers must surface this, not silently trust the due_state (spec §5.5).';

grant execute on function public.is_business_day(date) to authenticated;
grant execute on function public.count_business_days_strictly_between(date, date) to authenticated;
grant execute on function public.business_calendar_incomplete(date, date) to authenticated;
grant execute on function public.compute_task_due_state(date, public.task_workflow_status, date) to authenticated;
