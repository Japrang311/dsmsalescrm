# Sales Task Control Loop Task 16 Report

Date: 2026-07-27

Task: Reconcile existing data and retire the legacy status contract

## Result

Completed locally.

- Added migration `20260727160000_backfill_task_control_loop.sql`.
- Added migration `20260727160010_retire_legacy_task_status.sql`.
- Saved machine-readable audit output at
  `docs/reports/sales-task-control-loop-migration.json`.
- Saved human-readable companion report at
  `docs/reports/sales-task-control-loop-migration.md`.
- Removed the retired Task `status` field from `src/lib/domain.ts` and
  `src/lib/data/tasks.ts`.
- Removed direct legacy status writes from active Tasks UI actions.
- Removed unused `src/components/tasks/LogFollowUpDialog.tsx`, which still
  carried the superseded multi-write follow-up/status path.
- Added `scripts/task-migration-audit.ts`.
- Added `supabase/tests/task-migration.test.ts`.

## Verification

- `supabase db reset --local`
  - pass; all migrations applied through `20260727160010`.
- `bun --env-file=.env.local scripts/task-migration-audit.ts`
  - pass; report verdict `PASS`.
- Focused cutover suite:
  `bun --env-file=.env.local test supabase/tests/task-migration.test.ts supabase/tests/task-progress.test.ts src/lib/data/tasks.test.ts src/lib/data/task-relations.test.ts src/lib/data/dashboard-selectors.test.ts src/lib/report-selectors.test.ts src/lib/dashboard-export-data.test.ts supabase/tests/tasks.test.ts supabase/tests/account-lifecycle.test.ts supabase/tests/business-owner-invariant.test.ts supabase/tests/super-admin-rls.test.ts`
  - 108 pass, 0 fail.
- `bun --env-file=.env.local test src/lib/data/task-exceptions.test.ts`
  - 4 pass, 0 fail.
- `bunx tsc --noEmit`
  - pass.
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- `supabase db lint --local`
  - command exited 0; reported existing findings in
    `private.migrate_commercial_document_data`,
    `public.admin_import_normalized_documents`, and
    `public.reassign_client_owner`, not the Task 16 migrations.

## Current Boundary

- No remote Supabase mutation was performed.
- No deployment was performed.
- Task 17 still owns full local verification: full tests, typecheck, lint/build
  where feasible, DB advisors, documentation reconciliation, and browser UAT.
