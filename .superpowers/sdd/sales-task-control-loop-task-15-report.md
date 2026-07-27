# Sales Task Control Loop Task 15 Report

Date: 2026-07-27

Task: Migrate ownership transfer and account lifecycle consumers

## Result

Completed locally.

- Added migration `20260727130930_update_task_account_lifecycle.sql`.
- Added `private.is_active_transfer_task(workflow_status, archived)` as the
  account-lifecycle Task transfer predicate.
- Replaced ownership transfer's Task scope with non-archived active workflow
  statuses: `Open`, `In Progress`, and `Waiting External`.
- Preserved historical attribution for `Done`, `Cancelled`, archived Tasks,
  Sales Orders/revenue, targets, follow-up history, and Activity Log.
- Updated Team roster owned-active Task counts to use `workflow_status` +
  `archived`, matching the database transfer scope.
- Updated account-lifecycle tests with a Cancelled Task fixture and fresh
  reference counts.

## Files Changed

- `supabase/migrations/20260727130930_update_task_account_lifecycle.sql`
- `supabase/tests/account-lifecycle.test.ts`
- `src/lib/data/team.ts`
- `src/lib/data/team.test.ts`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`

## Verification

- `bunx supabase db reset`
  - pass; migration applied between business calendar and atomic progress
    migrations.
- `bun --env-file=.env.local test supabase/tests/account-lifecycle.test.ts supabase/tests/business-owner-invariant.test.ts`
  - 16 pass, 0 fail
- `bun --env-file=.env.local test supabase/tests/account-lifecycle.test.ts supabase/tests/business-owner-invariant.test.ts src/lib/data/team.test.ts`
  - 24 pass, 0 fail
- `bun --env-file=.env.local test src/lib/data/team.test.ts src/lib/data/tasks.test.ts src/lib/data/task-relations.test.ts`
  - 21 pass, 0 fail
- `bunx tsc --noEmit`
  - pass
- `bunx eslint src/lib/data/team.ts src/lib/data/team.test.ts supabase/tests/account-lifecycle.test.ts`
  - pass
- `bunx supabase migration list --local`
  - pass; local migration list includes `20260727130930`.
- `bunx supabase db lint --local`
  - command exited 0; reported existing lint findings in
    `private.migrate_commercial_document_data`,
    `public.admin_import_normalized_documents`, and
    `public.reassign_client_owner`, not the Task 15 migration.
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- Static predicate review:
  - No active `src/` or current test consumer still uses Task
    `.neq("status", "Done")` or treats `Today`/`Upcoming`/`Overdue` as workflow.
  - Remaining `status <> 'Done'` matches are in superseded historical
    migrations; Task 15 overrides the active lifecycle function.

## Boundary

- No remote Supabase mutation was performed.
- No Git push or deployment was performed.
