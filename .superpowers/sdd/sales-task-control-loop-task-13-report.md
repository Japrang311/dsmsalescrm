# Sales Task Control Loop Task 13 Report

Date: 2026-07-27

Task: Migrate exports

## Result

Completed locally.

- Added `dashboardExportFollowUpRecords()` as the shared follow-up export row
  contract.
- CSV, XLSX, and PDF follow-up exports now label `Workflow Status` and
  `Due State` separately instead of exporting the legacy Task `status` field.
- Executive/non-Sales export totals can use aggregate `taskMetrics`, so totals
  reconcile with Dashboard/Reports without depending on restricted Task detail.
- XLSX and PDF summary rows now include escalated Tasks in the attention count
  while preserving the overdue/escalated split in the reference text.
- Dashboard and Reports export contexts now pass the aggregate Task metrics
  already loaded by their screens.

## Files Changed

- `src/lib/dashboard-export-data.ts`
- `src/lib/dashboard-export-data.test.ts`
- `src/lib/export-csv.ts`
- `src/lib/export-xlsx.ts`
- `src/lib/export-pdf.ts`
- `src/routes/_app.dashboard.tsx`
- `src/routes/_app.reports.tsx`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`

## Verification

- `bun --env-file=.env.local test src/lib/dashboard-export-data.test.ts src/lib/report-selectors.test.ts src/lib/data/dashboard-selectors.test.ts src/lib/data/tasks.test.ts src/components/shell/TopBar.test.ts`
  - 29 pass, 0 fail
- `bunx tsc --noEmit`
  - pass
- `bunx eslint src/lib/dashboard-export-data.ts src/lib/dashboard-export-data.test.ts src/lib/export-csv.ts src/lib/export-xlsx.ts src/lib/export-pdf.ts src/routes/_app.dashboard.tsx src/routes/_app.reports.tsx`
  - pass
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- Static export inspection:
  - Follow-up CSV/XLSX/PDF export paths no longer contain `task.status` reads.
  - Follow-up export labels include separate workflow and due-state columns.

## Boundary

- No remote Supabase mutation was performed.
- No Git push or deployment was performed.
- Browser download inspection was not run in this task; verification covered
  export data preparation, static labels, typecheck, lint, and production build.
