# Task 7 Brief: Full local verification, bootstrap rehearsal, and documentation reconciliation

Source: `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md`, lines 519-577.

## Files

- Create: `supabase/snippets/bootstrap_super_admin_role.sql`
- Modify: `docs/auth-bootstrap.md`
- Modify: `PRD.md`
- Modify: `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`
- Modify: accepted design, backend spec, task trackers (`tasks/plan.md`, `tasks/todo.md`), `CLAUDE.md`, `HANDOFF.md` only to reflect verified as-built facts.

## Interfaces

- Consumes all prior tasks (1-6, all complete and independently reviewed).
- Produces a local evidence packet and accurate as-built documentation.

## Steps

### Step 1: Create and inspect the bootstrap helper

The SQL accepts one explicit UUID placeholder, verifies the Auth user exists, upserts exactly one active `super_admin` profile, and is idempotent. It contains no account creation, email, password, token, or project URL.

### Step 2: Rehearse bootstrap only with disposable local users

Run the helper twice for one disposable local Auth UUID. Assert the first run creates/promotes one row and the second changes no identity/count. Sign in through `/login` and verify Super Admin role resolution. Delete only the captured disposable QA identity after evidence is collected.

### Step 3: Run the full automated gate

Run:

```bash
bunx supabase db reset
bun run test
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all new authorization/lifecycle tests pass. Report any unrelated baseline failure by exact file/error; do not claim the gate passed if it did not.

### Step 4: Browser-verify the four-role matrix

Using disposable local identities:

1. Super Admin sees all Settings tabs, active/inactive roster, and mutation controls.
2. Manager and Executive see the roster read-only with the exact guidance; direct mutation returns 403.
3. Sales does not see Team & Role.
4. Super Admin edits a business record and the stored owner remains Sales while Activity Log actor is Super Admin.
5. Inactive user with an existing session loses database reads and is signed out with the unavailable-account message.
6. Super Admin is absent from owner, target, and performance selectors.

### Step 5: Browser/database-verify lifecycle protections

Use captured disposable IDs to prove create, role change, deactivate/reactivate, ownership transfer, and eligible delete. Prove 409 rejection for self-deactivate/delete, last-active-admin change, referenced delete, inactive/invalid transfer destination, and transactional transfer failure. Confirm Activity Log snapshots survive eligible deletion and remain immutable.

### Step 6: Clean QA data safely

Delete only captured disposable reference-free accounts and their permitted disposable business rows. Do not delete Activity Log evidence through the website or direct role sessions. Reset the local database if needed to restore deterministic seeds; do not run cleanup against a remote project.

### Step 7: Reconcile documentation

Change "target/pending" statements to "verified" only where automated and browser evidence exists. Record remaining gaps and exact failing gates. Keep Task 29 as historical/superseded and do not rewrite its completed evidence.

## Global Constraints (from plan, binding for this task)

- Work only against local project `DSM_SALES_WEB_APP_V2`; no remote link, push, Edge Function deploy, user mutation, or bootstrap without separate approval naming the exact target.
- Every database action is local-first; remote mutation, destructive deletion, credentials, Activity Log mutation, and zero-admin states remain explicitly blocked.
- Do not initialize Git. This Lovable-connected folder has no `.git`; use review checkpoints instead of commit steps.
- Do not claim a gate passed if it did not. Report exact failing file/error for any baseline failure.
