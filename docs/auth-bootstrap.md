# Auth Bootstrap: Creating the First Super Admin

Status: `supabase/snippets/bootstrap_super_admin_role.sql` exists and is verified against the local Supabase stack (Phase 12 Task 7: idempotency rehearsal, unknown-UUID hard failure, and `/login` role resolution all confirmed locally on 2026-07-19). It has not been run against any remote project — remote use still requires separate approval naming the exact target.

The first `super_admin` is established manually because no privileged website account exists yet. This is the only role elevation performed outside the website during normal setup. It must target the exact approved Supabase project and an explicitly identified Auth user UUID.

The older `supabase/snippets/bootstrap_manager_role.sql` records the previous first-Manager bootstrap and is superseded by ADR-002. Do not use it to establish the final production authority model.

## Preconditions

- The exact local or remote Supabase target is named and verified before any command runs.
- The schema migration containing `super_admin` and active account state has already been applied to that target.
- Public signup remains disabled.
- The project owner has a strong, unique credential ready; no credential is stored in this repository or pasted into SQL.

## Step 1 — Create the Auth user manually

In the approved Supabase project's Authentication → Users screen, create the project owner's account and mark the email confirmed only after verifying the address. Do not use a default password and do not create the account through a public signup screen.

For local-only verification, create an equivalent disposable local Auth user. Local evidence does not authorize a remote change.

## Step 2 — Copy and verify the Auth UUID

Copy the new user's UUID from Authentication → Users. Confirm the UUID and email belong to the intended project owner before continuing. The bootstrap accepts the UUID as its only identity selector; it must not infer an account by row order or display name.

## Step 3 — Run the idempotent Super Admin promotion

Use the helper `supabase/snippets/bootstrap_super_admin_role.sql`. Replace its explicit UUID placeholder, run it in the SQL editor for the approved target, and verify the affected row count.

The helper:

- Refuses an unknown Auth UUID (raises an exception; verified locally by running it against a nonexistent UUID and observing the DB reject with no row written).
- Creates or updates exactly one matching `public.profiles` row (verified: first run against a disposable local Auth UUID produced exactly one row with `role = 'super_admin'`, `account_status = 'active'`).
- Is safe to rerun for the same UUID (verified: a second run against the same UUID left `id`/`created_at` unchanged and did not add a row).
- Never creates an Auth user and contains no email, password, service-role key, access token, or refresh token (verified by inspection — the snippet only reads `auth.users.email` for the row it verifies, and writes only to `public.profiles`).

## Step 4 — Verify database state

Run a bounded query for the exact UUID:

```sql
select id, role, account_status, name, initials, email
from public.profiles
where id = '<AUTH_USER_UUID>'::uuid;
```

Expected result: exactly one row with `role = 'super_admin'` and `account_status = 'active'`.

Also verify that at least one active Super Admin exists before ending the bootstrap session. Never test last-admin protection by deactivating the only real administrator; use disposable local accounts.

## Step 5 — Verify website behavior

Sign in through the existing `/login` screen and confirm:

- Settings → `Tim & Role` shows editable controls.
- Super Admin can view company-wide business data.
- Super Admin is absent from client-owner, target-owner, and Sales performance selections.
- A Manager can view Team & Role but receives no mutation controls and a direct server mutation returns 403.
- Activity Log records later administrative actions and remains impossible to edit/delete.

If the account is inactive, the app must show the unavailable-account state, sign out the session, and RLS must deny business-data access.

## Ongoing account creation

After the first bootstrap, create and manage Sales, Sales Manager, Top Executive, and additional Super Admin accounts only through Settings → `Tim & Role` and the protected server endpoint. Only an active Super Admin can assign `super_admin`.

## Safety rules

- Do not run bootstrap against a remote project without separate approval naming that target.
- Do not place credentials or service-role keys in SQL, Vite environment variables, screenshots, docs, or logs.
- Do not demote, deactivate, or delete the last active Super Admin.
- Do not deactivate or delete the currently logged-in Super Admin.
- Prefer deactivation; permanent deletion is only for an unused account with zero business and audit references.
