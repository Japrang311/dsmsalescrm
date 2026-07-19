-- Auth bootstrap: assign the 'manager' role to the first Sales Manager
-- account. Run this manually in the Supabase Dashboard SQL Editor, once,
-- after creating the user via Authentication -> Users -> Add user.
-- See docs/auth-bootstrap.md for the full procedure.
--
-- Idempotent: safe to re-run (e.g. to fix a typo in name/initials) without
-- creating a duplicate row.

-- Fill these in before running:
-- 1. The UUID from the Users table (Authentication -> Users -> click the row)
-- 2. Display name and initials for this manager
do $$
declare
  target_uuid uuid := '00000000-0000-0000-0000-000000000000'; -- <-- replace
  target_name text := 'Manager Name';                          -- <-- replace
  target_initials text := 'MN';                                -- <-- replace
begin
  insert into public.profiles (id, role, name, initials, email)
  select target_uuid, 'manager', target_name, target_initials, u.email
  from auth.users u
  where u.id = target_uuid
  on conflict (id) do update
    set role = 'manager',
        name = excluded.name,
        initials = excluded.initials;
end $$;
