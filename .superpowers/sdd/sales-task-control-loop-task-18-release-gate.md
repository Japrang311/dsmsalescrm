# Sales Task Control Loop Task 18 Release Gate

Date: 2026-07-27

Task: Release through an explicit remote gate

## Gate Status

NO-GO for execution until the owner gives exact-target approval.

This file prepares the remote gate only. It does not authorize or record any
remote Supabase mutation, Git push, deployment, or production browser test.

## Exact Target Discovered

- Linked Supabase project ref: `qhtfixgbcpcitokeryxb`
- Linked Supabase project name: `DSM Sales Web App V2`
- Git remote: `origin` -> `https://github.com/Japrang311/dsmsalescrm.git`
- Current branch: `main`

## Read-Only Checks Run

- `supabase --version`
  - `2.109.1`
- `supabase db push --help`
  - confirms `--linked` and `--dry-run` flags exist.
- `supabase migration list --linked`
  - read-only remote comparison succeeded.
- `supabase migration list --local`
  - read-only local comparison succeeded.
- `supabase db push --linked --dry-run`
  - did not produce a migration plan after about 90 seconds and was stopped
    with Ctrl-C (`exit 130`). Treat this dry-run as unavailable in this
    session, not as a successful release proof.

## Pending Supabase Migrations

Remote already has local migrations through `20260727150000` except for one
local-only advisor-hardening migration inserted at timestamp `20260727141303`.

Pending on linked remote:

- `20260727141303_harden_task_calendar_function_search_path.sql`
- `20260727160000_backfill_task_control_loop.sql`
- `20260727160010_retire_legacy_task_status.sql`

Release risk:

- The linked remote already has `20260727150000_restrict_task_exception_visibility.sql`,
  but does not have `20260727141303_harden_task_calendar_function_search_path.sql`.
  That means one pending migration has a timestamp older than the current
  remote head. Do not run `supabase db push --linked` until the owner reviews
  this ordering risk and the CLI dry-run can be captured or an explicit
  alternative migration application strategy is approved.

## Git State

Release execution is not ready because the working tree is dirty and the
release changes are not committed.

- `git log origin/main..HEAD` returned no local commits ahead of `origin/main`.
- `git diff --stat` shows Task 16-17 source, test, migration, report, and
  evidence changes still pending locally.

Before any Git push, create a reviewed commit containing the intended release
set and verify that unrelated working-tree changes are either included
deliberately or kept out deliberately.

## Backup And Recovery Approach

Before approving Supabase remote mutation:

- Confirm Supabase project backups/PITR coverage for `qhtfixgbcpcitokeryxb`.
- Take or confirm a fresh backup immediately before migration execution.
- Because `20260727160010_retire_legacy_task_status.sql` drops
  `public.tasks.status` and `public.task_status`, preserve a pre-release
  snapshot of at least:
  - `public.tasks`
  - `public.follow_up_logs`
  - `public.activity_log`
  - `public.profiles`
  - `public.business_calendar_holidays`
  - `supabase_migrations.schema_migrations`
- Keep the Task 16 reconciliation report available:
  `docs/reports/sales-task-control-loop-migration.json`.

Recovery path:

- Preferred: restore Supabase backup/PITR to a safe recovery point before the
  migration.
- If restoring forward instead of full rollback, re-add only the retired
  compatibility surface from a reviewed forward-fix migration; do not manually
  patch production schema outside migration history.

## Post-Deploy Smoke Checks

Run after an explicitly approved remote migration/deployment:

- `supabase migration list --linked`
  - verify remote has the exact applied migration set.
- SQL smoke checks:
  - `select to_regclass('public.tasks') as tasks_table;`
  - `select to_regclass('public.task_status') as retired_task_status_enum;`
  - `select count(*) from public.tasks;`
  - `select * from public.compute_task_due_state(current_date, 'Open'::public.task_workflow_status) limit 1;`
  - `select * from public.task_control_loop_metrics() limit 1;`
- Authenticated browser smoke checks:
  - Sales: `/tasks` create/progress path still works.
  - Manager: My Tasks and Team Exceptions still separate ownership correctly.
  - Executive: `/tasks` remains read-only and titled `Executive Exceptions`.
  - Super Admin: correction path still records progress without ownership
    reassignment.
  - Calendar boundary: holiday correction changes Team Exceptions membership.

## Approval Required Before Execution

Use an exact approval sentence like:

`Saya approve Task 18 execution: push Git ke origin/main, apply Supabase migrations to qhtfixgbcpcitokeryxb (DSM Sales Web App V2), deploy the app, then run post-deploy smoke checks.`

Without that level of exact target/action approval, Task 18 must remain a
prepared NO-GO gate.
