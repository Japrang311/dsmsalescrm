# Sales Task Control Loop — Task 9 Report

Date: 2026-07-27

## Task

Separate Manager My Tasks from Team Exceptions.

## Implementation

- Added `src/lib/data/task-exceptions.ts`.
  - `filterManagerMyTasks()` returns only Tasks owned by the current Manager.
  - `filterManagerTeamExceptions()` returns only active, non-archived,
    Sales-owned Tasks whose centralized `dueState` is `Escalated`.
  - `listManagerTaskScopes()` composes `listTasks()` and `listOwners()` so the
    query path continues to use the existing centralized due-state adapter.
- Updated `src/routes/_app.tasks.tsx`.
  - Manager now gets a segmented mode switch: `My Tasks` and
    `Team Exceptions`.
  - `My Tasks` is scoped to the signed-in Manager profile id.
  - `Team Exceptions` is scoped to Sales-owned active Escalated Tasks, changes
    the page heading/copy, and auto-focuses the Overdue view.
  - Selection and bulk actions now operate only on the active scope.
  - Bulk `Ubah owner` is hidden in Team Exceptions so escalation does not imply
    ownership transfer.

## Tests

- Added `src/lib/data/task-exceptions.test.ts`.
- Coverage:
  - Manager-owned Tasks only in Manager My Tasks.
  - Sales-owned Escalated active Tasks only in Team Exceptions.
  - Pre-threshold, holiday-shifted threshold, resolved, Cancelled, archived,
    Manager-owned, and Executive-owned rows.

## Verification

- `bun --env-file=.env.local test src/lib/data/task-exceptions.test.ts`
  - 3 pass, 0 fail.
- `bunx tsc --noEmit`
  - clean.
- Focused suite:
  - `bun --env-file=.env.local test src/lib/data/task-exceptions.test.ts src/lib/data/tasks.test.ts src/lib/data/business-calendar.test.ts src/lib/data/activity-log.test.ts src/lib/data/task-progress-adapter.test.ts`
  - 34 pass, 0 fail.
- `bun run build`
  - passed.
  - Existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundant plugin note, and large chunk warnings.
- `bun --env-file=.env.local test`
  - 439 pass, 0 fail, 2009 expect calls, 58 files.
- Browser QA on `http://127.0.0.1:8081/tasks` as local seeded Manager
  `Leli Al`.
  - Created three exact local fixtures:
    - `QA Task9 Manager-owned today`
    - `QA Task9 Sales escalated exception`
    - `QA Task9 Sales pre-threshold hidden`
  - Verified Manager `My Tasks` showed only the Manager-owned fixture and
    badge-counted one Team Exception.
  - Verified `Team Exceptions` showed only the Sales-owned Escalated fixture,
    auto-selected Overdue, displayed owner `NI`, and hid the pre-threshold
    fixture.
  - Verified selected exception rows keep progress bulk actions but do not show
    bulk owner transfer.
  - Opened the exception Task Detail Drawer and verified owner remained
    `Nur Iman · NI` with the timeline/riwayat section available.
  - Console errors: none.
  - Removed the exact local fixtures afterward and verified remaining fixture
    count was 0.

## Remote State

- Remote Supabase was not touched.
- No deployment was run.
