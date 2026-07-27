# Sales Task Control Loop — Task 10 Report

Date: 2026-07-27

## Task

Enforce Executive exception detail and aggregate-only reporting.

## Implementation

- Added `supabase/migrations/20260727150000_restrict_task_exception_visibility.sql`.
  - New `private.is_manager_task_exception(...)` centralizes the database
    predicate for active, non-archived, Manager-owned Tasks whose derived
    due state is `Escalated`.
  - Narrowed `tasks_select` so Executive sees only qualifying Manager exception
    Task detail. Sales, Manager, and Super Admin behavior remains unchanged.
  - Narrowed `follow_up_logs_select` and `activity_log_select` so Executive
    sees timeline rows only when they belong to a qualifying Manager exception
    Task.
  - Added `public.task_control_loop_metrics()` as an aggregate-only RPC for
    Manager, Executive, and Super Admin. It returns counts only; it does not
    expose Task ids, owner ids, titles, notes, timestamps, or row detail.
    `PUBLIC` execute is revoked and `authenticated` execute is granted with
    an internal role check.
- Added `supabase/tests/task-exceptions-rls.test.ts`.
  - Covers Executive allowed detail, denied detail, denied create/update/archive
    and progress writes, aggregate access, Sales forbidden aggregate access,
    and Super Admin correction preservation.
- Updated existing RLS tests for the new Executive contract.
  - `tasks`, `follow_up_logs`, and `activity_log` tests no longer preserve the
    old Executive read-all behavior.
- Updated `src/lib/data/task-exceptions.ts` and route usage.
  - Added `filterExecutiveTaskExceptions()`.
  - `/tasks` now displays `Executive Exceptions` for Executive and explicitly
    scopes the client-side view to active Manager-owned escalated Tasks.
- Updated `src/components/shell/TopBar.tsx`.
  - Executive no longer gets global Quick Create controls.
  - TopBar data widgets and Quick Create dialogs no longer mount before
    `authReady`, preventing pre-auth 401 browser noise.

## Verification

- `bunx supabase db reset`
  - Passed with migration `20260727150000_restrict_task_exception_visibility.sql`.
- Focused tests:
  - `bun --env-file=.env.local test supabase/tests/tasks.test.ts supabase/tests/follow-up-logs.test.ts supabase/tests/activity-log.test.ts supabase/tests/task-progress.test.ts supabase/tests/task-exceptions-rls.test.ts src/lib/data/task-exceptions.test.ts src/components/shell/TopBar.test.ts`
  - 54 pass, 0 fail.
- `bunx tsc --noEmit`
  - Clean.
- Scoped ESLint:
  - `bunx eslint src/components/shell/TopBar.tsx src/routes/_app.tasks.tsx src/lib/data/task-exceptions.ts src/lib/data/task-exceptions.test.ts supabase/tests/task-exceptions-rls.test.ts supabase/tests/tasks.test.ts supabase/tests/follow-up-logs.test.ts supabase/tests/activity-log.test.ts`
  - Clean.
- `bun run build`
  - Passed. Existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundant plugin note, and large chunk warnings.
- `bunx supabase db lint --local`
  - New migration produced no reported issue. The command still reports
    pre-existing function-analysis findings in older functions:
    `private.migrate_commercial_document_data` (`tmp_ci_pool`), 
    `public.admin_import_normalized_documents` (`tmp_imported_quotation_ids`),
    and unused variables in `public.reassign_client_owner`.
- Browser QA on `http://127.0.0.1:8081/tasks` with dev role
  `localStorage["dsm.role"] = "executive"`.
  - H1: `Executive Exceptions`.
  - Quick Create button count: 0.
  - Done button count: 0.
  - `Ubah owner` button count: 0.
  - Read-only copy visible.
  - Console errors: none.
  - 401 responses: none.

## Remote State

- Remote Supabase was not mutated.
- No deployment was run.
