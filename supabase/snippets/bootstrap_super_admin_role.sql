-- Auth bootstrap: promote an existing Auth user to the 'super_admin' role
-- with an active account status. Run this manually in the Supabase SQL
-- Editor, once per new Super Admin, after creating the Auth user via
-- Authentication -> Users -> Add user (or, for local verification only, an
-- equivalent disposable local Auth user).
-- See docs/auth-bootstrap.md for the full procedure.
--
-- This snippet supersedes supabase/snippets/bootstrap_manager_role.sql as
-- the approved first-privileged-account bootstrap (ADR-002).
--
-- Contains no account creation, email, password, token, service-role key, or
-- project URL. It only reads auth.users to confirm the target UUID exists
-- and writes public.profiles.
--
-- Idempotent: safe to re-run for the same UUID (e.g. to fix a typo in
-- name/initials) without creating a duplicate row or changing identity.
--
-- Fails loudly (raises an exception, no row written) if the UUID does not
-- correspond to an existing auth.users row, so a mistyped UUID can never
-- silently no-op.

-- Fill these in before running:
-- 1. The UUID from the Users table (Authentication -> Users -> click the row)
-- 2. Display name and initials for this Super Admin
do $$
declare
  target_uuid uuid := '00000000-0000-0000-0000-000000000000'; -- <-- replace
  target_name text := 'Super Admin Name';                      -- <-- replace
  target_initials text := 'SA';                                -- <-- replace
  target_email text;
begin
  select u.email into target_email
  from auth.users u
  where u.id = target_uuid;

  if target_email is null then
    raise exception
      'bootstrap_super_admin_role: no auth.users row found for id %. Verify the UUID before rerunning.',
      target_uuid;
  end if;

  insert into public.profiles (id, role, account_status, name, initials, email)
  values (target_uuid, 'super_admin', 'active', target_name, target_initials, target_email)
  on conflict (id) do update
    set role = 'super_admin',
        account_status = 'active',
        name = excluded.name,
        initials = excluded.initials,
        email = excluded.email;
end $$;
