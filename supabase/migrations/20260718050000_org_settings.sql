-- Migration: org_settings
--
-- Plain-language summary: a singleton table backing the "Master Data" tab
-- on the Settings page (company name, fiscal year, PPN rate, dormant/risk
-- day thresholds) — genuinely new, no prior real table existed for
-- org-level config at all (Task 28).
--
-- Singleton pattern: `id boolean primary key default true` plus a check
-- constraint that `id` is always true makes a second row impossible at the
-- database level — simpler than a key/value table for a small, fixed set
-- of fields that's already a flat named-column shape in the mock
-- (OrgSettings in settings-store.ts). The one default row is inserted
-- here, not in supabase/seed.sql, because seed.sql is dev/test-only
-- convenience data that won't run against a real deployed project — this
-- row is essential schema data the app assumes always exists.

create table public.org_settings (
  id boolean primary key default true,
  company_name text not null,
  fiscal_year integer not null,
  ppn_rate numeric not null,
  dormant_threshold_days integer not null,
  risk_overdue_days integer not null,
  updated_at timestamptz not null default now(),
  constraint org_settings_singleton check (id)
);

insert into public.org_settings (
  id, company_name, fiscal_year, ppn_rate, dormant_threshold_days, risk_overdue_days
) values (
  true, 'PT Duta Solusi Metalindo', 2026, 0.11, 60, 7
);

alter table public.org_settings enable row level security;

-- Every authenticated role can read — org config (PPN rate, dormant/risk
-- thresholds) is display-only for non-managers today, but nothing here
-- restricts read access by role.
create policy "org_settings_select"
on public.org_settings
for select
to authenticated
using (true);

-- Manager-only write, matching the existing "Master Data" tab's
-- manager-only UI gate (`canManage` / role check in _app.settings.tsx).
create policy "org_settings_update"
on public.org_settings
for update
to authenticated
using (public.current_user_role() = 'manager')
with check (public.current_user_role() = 'manager');

-- No insert/delete policy for any authenticated role — the singleton row
-- is created once by this migration and never removed.

grant select, update on public.org_settings to authenticated;
grant select, insert, update, delete on public.org_settings to service_role;
