# Sales Task Control Loop — Task 8 Completion Report

Task: implementation-plan Task 8 / project-tracker Task 53 — "Deliver the
unified progress timeline"
Date: 2026-07-27
Scope: Task timeline read contract + active Tasks-page shortcut wiring
Remote mutation: none
Depends on: Task 7 / Task 52 (done 2026-07-27)

## Outcome

`src/lib/data/activity-log.ts` now exposes `listTaskTimeline(taskId)`, the
unified Task Detail timeline contract. It reads both `follow_up_logs` and
`activity_log` for the same Task:

- `follow_up_logs` are the canonical progress entries.
- paired `activity_log.kind = 'task_progress'` rows are used only to recover the
  real actor/title from the atomic RPC, then suppressed so one RPC submission
  renders as one logical timeline entry.
- older `follow_up_logs` without paired audit rows remain visible.
- audit-only Task rows (`task_created`, `task_status_change`, and unmatched
  `task_progress`) remain visible.

`listTaskHistory()` remains as a compatibility wrapper around
`listTaskTimeline()`, so older imports do not break, but `TaskDetailDrawer.tsx`
now reads the new `["task-timeline", taskId]` query key directly.

`src/routes/_app.tasks.tsx` no longer opens `LogFollowUpDialog` from the active
"Log follow-up" shortcut. That shortcut now opens `TaskDetailDrawer`, so the
active page uses the same atomic `recordTaskProgress()` path delivered in Task
7 instead of the old multi-write dialog path. The old component file is retained
for now because this task's scope is behavior wiring, not broad deletion.

## Verification

- Added integration coverage in `src/lib/data/activity-log.test.ts` proving the
  timeline merges a historical follow-up, preserves an audit-only correction,
  and suppresses the paired `task_progress` audit row from an RPC progress
  submission.
- `bunx tsc --noEmit` -> clean.
- `bun --env-file=.env.local test src/lib/data/activity-log.test.ts
src/lib/data/task-progress-adapter.test.ts` -> 5 pass, 0 fail.
- Full local suite: `bun --env-file=.env.local test` -> 436 pass, 0 fail,
  2004 assertions.
- `bun run build` -> passed. Warnings were pre-existing style/tooling warnings:
  Node `module.register()` deprecation, `vite-tsconfig-paths` now redundant, and
  large client chunks.
- Manual browser verification on `http://localhost:8080/tasks` as the existing
  local Sales session (`Nur Iman`):
  - created a no-client QA Task;
  - clicked the Tasks-page "Log follow-up" shortcut and confirmed it opened
    `TaskDetailDrawer`, not the old `Update Follow-Up` dialog;
  - recorded progress with next action/date and note through the drawer;
  - confirmed Riwayat rendered exactly 2 entries after save: one progress entry
    plus the original task-created audit entry;
  - reloaded the page, reopened the same Task, and confirmed the same 2-entry
    timeline persisted from backend data;
  - checked browser console errors: none.
- Cleaned the exact local browser-QA fixture after verification:
  `tasks_deleted = 1`, `follow_ups_deleted = 1`, `activity_deleted = 2`.

## Not Touched

- Manager Team Exceptions, Executive exception detail, Dashboard/Reports/export
  consumer migration, and legacy `status` cutover remain Tasks 9-18.
- List-level quick Done/Snooze/Undo/archive actions still use their existing
  `updateTask()` plus audit-log pattern. This task removed the active
  follow-up/progress multi-write shortcut; broader list-action migration belongs
  to consumer/cutover tasks.
- No migration, remote Supabase command, Git push, deployment, or production
  browser check was performed.
