# Sales Task Control Loop Task 11 Report

Date: 2026-07-27

Task: Migrate Dashboard and TopBar consumers

## Result

Completed locally. Dashboard and TopBar Task indicators now use the Task
Control Loop contract:

- Workflow/open counts use active `workflowStatus` values (`Open`,
  `In Progress`, `Waiting External`) and exclude archived Tasks.
- Due buckets use derived `dueState` (`Upcoming`, `Today`, `Overdue`,
  `Escalated`) instead of the legacy stored `status` string.
- `Escalated` is counted separately and is combined with `Overdue` only for
  the Dashboard attention KPI.
- Done, Cancelled, and Archived Tasks are excluded from in-app exception and
  notification indicators even if legacy `status` is stale.
- Executive Dashboard Task KPI counts use the aggregate-only
  `public.task_control_loop_metrics()` path instead of relying on visible row
  detail.
- Executive remains read-only in the Dashboard follow-up widget.

## Files Changed

- `src/lib/data/dashboard-selectors.ts`
- `src/lib/data/dashboard-selectors.test.ts`
- `src/lib/data/tasks.ts`
- `src/lib/data/tasks.test.ts`
- `src/hooks/use-dashboard-data.ts`
- `src/routes/_app.dashboard.tsx`
- `src/components/dashboard/TodaysFollowUpList.tsx`
- `src/components/shell/TopBar.tsx`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`

## Verification

- `bun --env-file=.env.local test src/lib/data/dashboard-selectors.test.ts src/lib/data/tasks.test.ts src/components/shell/TopBar.test.ts`
  - 20 pass, 0 fail
- `bunx tsc --noEmit`
  - pass
- `bunx eslint src/lib/data/dashboard-selectors.ts src/lib/data/dashboard-selectors.test.ts src/lib/data/tasks.ts src/lib/data/tasks.test.ts src/hooks/use-dashboard-data.ts src/routes/_app.dashboard.tsx src/components/dashboard/TodaysFollowUpList.tsx src/components/shell/TopBar.tsx`
  - pass
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- Browser QA at `http://127.0.0.1:8081/dashboard`
  - Sales: Dashboard rendered, Quick Create visible, no console errors, no 401.
  - Manager: Dashboard rendered, Quick Create visible, escalated indicator
    present, no console errors, no 401.
  - Executive: Dashboard rendered, Quick Create hidden, Mark Done hidden,
    escalated indicator present, no console errors, no 401.
  - Super Admin: verified using a temporary local Supabase Auth/profile user,
    then cleaned up; Dashboard rendered with Super Admin role label, Quick
    Create visible, no console errors, no 401.

## Boundaries

- No remote Supabase mutation was performed.
- No Git push or deployment was performed.
- Reports and remaining export-specific migration are still Task 12/13 scope;
  shared Dashboard selector changes may already improve export behavior where
  exports call those selectors.
