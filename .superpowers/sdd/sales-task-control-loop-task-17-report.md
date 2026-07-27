# Sales Task Control Loop Task 17 Report

Date: 2026-07-27

Task: Run complete local verification and reconcile documentation

## Result

Completed locally. Task 17 is ready for the explicit remote release gate
(Task 18).

- Fixed one stale Phase 11 test fixture that still inserted into the retired
  `public.tasks.status` column after Task 16 removed it. The fixture now uses
  `workflow_status = 'Open'`, matching the post-cutover contract.
- Added local advisor hardening migration
  `20260727141303_harden_task_calendar_function_search_path.sql` for the
  Task Control Loop calendar functions.
- Stabilized `bun run lint` by targeting source/config paths instead of
  scanning the repository root and generated build artifacts.
- Recorded complete browser evidence under
  `.superpowers/sdd/browser-evidence-task-17-final/`.

## Files Changed

- `eslint.config.js`
- `package.json`
- `supabase/migrations/20260727141303_harden_task_calendar_function_search_path.sql`
- `supabase/tests/commercial-normalization.test.ts`
- Formatting-only ESLint fixes in:
  - `src/lib/data/activity-log.test.ts`
  - `src/lib/data/activity-log.ts`
  - `supabase/tests/business-calendar-fixtures.ts`
  - `supabase/tests/business-calendar.test.ts`
  - `supabase/tests/task-progress.test.ts`
- `.superpowers/sdd/sales-task-control-loop-task-17-report.md`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`

## Verification

- `bunx supabase db reset --local`
  - pass; all migrations applied through `20260727160010`.
- `bun --env-file=.env.local scripts/task-migration-audit.ts`
  - pass; report verdict `PASS`.
- `bun --env-file=.env.local test`
  - pass; 458 pass, 0 fail across 61 files.
- `bunx tsc --noEmit`
  - pass.
- `bun run lint`
  - pass; 0 errors, 12 existing warnings.
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- `supabase db lint --local`
  - command exited 0; still reports existing baseline findings in
    `private.migrate_commercial_document_data`,
    `public.admin_import_normalized_documents`, and
    `public.reassign_client_owner`.
- `supabase db advisors --local`
  - pass; `No issues found`.

## Browser Evidence

Local dev server used: `http://127.0.0.1:8081`.

Evidence folder:
`.superpowers/sdd/browser-evidence-task-17-final/`.

Summary file:
`.superpowers/sdd/browser-evidence-task-17-final/browser-uat-summary.json`.

- Sales: created `Task17 Browser Sales Retry 1785162449127`, recorded
  progress with next action/date, archived it, then restored it.
- Manager: Team Exceptions showed the Sales-owned escalated holiday fixture
  before the local holiday correction.
- Holiday correction: after inserting local holiday `2026-07-23`, the same
  Sales-owned fixture no longer appeared in Manager Team Exceptions.
- Executive: rendered `Executive Exceptions`; `Buat Task` was not visible.
- Super Admin: signed in through `/login` with the local-only Super Admin
  bootstrap account and recorded a correction on the Sales-created Task.
- Browser UAT summary recorded no console errors/warnings and no failed
  network requests.

Rollback coverage is automated rather than browser-driven: the full suite
includes forced-failure transaction tests for `record_task_progress()` and
account lifecycle rollback behavior.

## Boundary

- No remote Supabase mutation was performed.
- No deployment was performed.
- No Git commit or push was performed.
- Browser UAT created local-only Task/holiday/Super Admin fixtures. They remain
  in the local Supabase stack and can be removed by another
  `bunx supabase db reset --local`.
