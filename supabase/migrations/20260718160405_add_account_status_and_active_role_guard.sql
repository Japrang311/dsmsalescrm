create type public.account_status as enum ('active', 'inactive');

alter table public.profiles
  add column account_status public.account_status not null default 'active',
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles(id) on delete set null,
  add column status_change_reason text;

create index profiles_active_role_idx
  on public.profiles (role)
  where account_status = 'active';

create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and account_status = 'active';
$$;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

drop policy if exists "profiles_select_own_or_privileged" on public.profiles;

create policy "profiles_select_own_or_privileged"
on public.profiles
for select
to authenticated
using (
  (id = (select auth.uid()) and account_status = 'active')
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);
