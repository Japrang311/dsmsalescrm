# Sales Task Control Loop Task 12 Report

Date: 2026-07-27

Task: Migrate Reports and performance calculations

## Result

Completed locally.

- Added `reportSalesPerformance()` in `src/lib/report-selectors.ts`.
- Reports Sales Performance now uses `workflowStatus` for active/done/cancelled
  and derived `dueState` for overdue/escalated.
- Manager-owned personal Tasks remain counted as sales work by owner, without
  reclassifying Team Exceptions as ownership transfers.
- Executive Reports no longer display per-member Task counts from restricted
  row detail; those cells show `Aggregate only`.
- Reports now include a Task Control summary card using the aggregate metrics
  path for non-Sales roles.
- Hardened display-only `current-user-id` React Query calls to return a stable
  `null` fallback during transient Auth fetch races, while keeping the
  dashboard hook's public `currentUserId` contract as `string | undefined`.

## Files Changed

- `src/lib/report-selectors.ts`
- `src/lib/report-selectors.test.ts`
- `src/routes/_app.reports.tsx`
- `src/hooks/use-dashboard-data.ts`
- `src/components/shell/TopBar.tsx`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`

## Verification

- `bun --env-file=.env.local test src/lib/report-selectors.test.ts src/lib/data/dashboard-selectors.test.ts src/lib/data/tasks.test.ts`
  - 24 pass, 0 fail
- `bunx tsc --noEmit`
  - pass
- `bunx eslint src/lib/report-selectors.ts src/lib/report-selectors.test.ts src/routes/_app.reports.tsx src/hooks/use-dashboard-data.ts src/lib/data/dashboard-selectors.ts`
  - pass
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- Browser QA at `http://127.0.0.1:8081/reports`
  - Sales: rendered, Task Control visible, no console errors, no 401.
  - Manager: rendered, Task Control visible, no console errors, no 401.
  - Executive: rendered, Task Control visible, `Aggregate only` visible, no
    console errors, no 401.
  - Super Admin: verified using a temporary local Supabase Auth/profile user,
    then cleaned up; rendered with Super Admin role label and no console
    errors/401 after session stabilization.

## Boundary

- No remote Supabase mutation was performed.
- No Git push or deployment was performed.
- Task 13 still owns export-specific column labels and authorized export
  snapshots; Task 12 only changes the shared Reports screen and selector
  calculations.
