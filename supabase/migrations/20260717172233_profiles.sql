-- Migration: profiles
--
-- Plain-language summary: this creates a "profiles" table that says who each
-- logged-in person is and which of the three app roles they have (sales,
-- manager, executive). Every other table's access rules will check this
-- table to decide what a given user is allowed to see or edit.
--
-- Supabase's built-in `auth.users` table stores login credentials (email,
-- password hash) but nothing about our app's roles — that's what this table
-- adds.

create type public.app_role as enum ('sales', 'manager', 'executive');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'sales',
  name text not null,
  initials text not null,
  email text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security (RLS): once enabled, Postgres blocks ALL access to this
-- table by default. Every allowed access pattern below has to be explicitly
-- opened up with a "policy". This is what makes role enforcement real
-- (enforced by the database itself) instead of just a visual filter in the
-- app.
alter table public.profiles enable row level security;

-- Helper function: looks up the current logged-in user's role. Marked
-- "security definer" so it can read the profiles table even though the
-- calling user's own RLS policy might not allow that directly — this is the
-- standard, safe way to avoid a chicken-and-egg problem where the policy
-- that checks "is this user a manager?" would otherwise need to query the
-- very table it's protecting under the caller's own restricted access.
create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Read access: a user can always read their own profile row. Managers and
-- executives can read everyone's profile row (they need to see the team).
-- There is deliberately no INSERT/UPDATE/DELETE policy for regular users —
-- nobody can change their own role from inside the app. Role changes only
-- happen via a manual, service-role-authenticated SQL step (see the
-- Auth Bootstrap task), which bypasses RLS entirely by design.
create policy "profiles_select_own_or_privileged"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

-- Table-level grants: Supabase now requires these explicitly for every new
-- table (older projects had this on by default, new ones don't). RLS above
-- decides which ROWS a role can see; these decide whether the role can touch
-- the table's columns at all. `service_role` is our admin/backend key — it
-- bypasses RLS policies but still needs these grants to act on the table.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
grant execute on function public.current_user_role() to authenticated, service_role;
