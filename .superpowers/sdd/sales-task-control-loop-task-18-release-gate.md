# Sales Task Control Loop Task 18 Release Gate

Date: 2026-07-27

Task: Release through an explicit remote gate

## Gate Status

EXECUTED after exact-target owner approval.

Approval received on 2026-07-27:

`Saya approve Task 18 execution: push Git ke origin/main, apply Supabase migrations to qhtfixgbcpcitokeryxb (DSM Sales Web App V2), deploy the app, then run post-deploy smoke checks.`

This file now records the release execution results and the verification
boundary.

## Execution Results

- Git:
  - Committed release set as `b33efe3`
    (`feat: complete sales task control loop release gate`).
  - Pushed `main` to `origin/main`:
    `30fdb12..b33efe3  main -> main`.
- Supabase remote:
  - Target: `qhtfixgbcpcitokeryxb` / `DSM Sales Web App V2`.
  - Synced pending migrations:
    - `20260727141303_harden_task_calendar_function_search_path.sql`
    - `20260727160000_backfill_task_control_loop.sql`
    - `20260727160010_retire_legacy_task_status.sql`
  - Post-apply `supabase migration list --linked` confirmed all three have
    matching local and remote versions.
- Deployment:
  - Vercel production deployment: `dpl_ATtYyZxxZEp4cLR1jHVwSs1rZaE5`.
  - Production alias: `https://dsmsalescrm.vercel.app`.
  - Deployment URL:
    `https://dsmsalescrm-eo807jrdz-hiulaukgalak.vercel.app`.
  - `vercel inspect` reported `Ready`.
- Post-deploy smoke:
  - SQL/RLS smoke checks passed via linked Supabase SQL role simulation.
  - HTTP SSR smoke checks passed for `/`, `/login`, and `/tasks`.
  - Authenticated browser smoke was not run because no production password or
    reusable production session was available; no production Auth users were
    created or mutated for test access.
  - `supabase db advisors --linked` did not complete in this session and was
    stopped with Ctrl-C, so remote advisors are not claimed as verified.

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

## Supabase Migration Outcome

Before execution, remote already had local migrations through `20260727150000`
except for one local-only advisor-hardening migration inserted at timestamp
`20260727141303`.

These migrations were pending before execution and confirmed synced after
execution:

- `20260727141303_harden_task_calendar_function_search_path.sql`
- `20260727160000_backfill_task_control_loop.sql`
- `20260727160010_retire_legacy_task_status.sql`

Ordering note:

- The linked remote already has `20260727150000_restrict_task_exception_visibility.sql`,
  but initially did not have
  `20260727141303_harden_task_calendar_function_search_path.sql`. The CLI
  required `--include-all` handling for this timestamp ordering case.

## Git State

Release commit and push completed.

- Release commit: `b33efe3`.
- Push target: `origin/main`.
- Push result: `30fdb12..b33efe3  main -> main`.

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

Executed after the approved remote migration/deployment:

- `supabase migration list --linked`
  - verified remote has the exact applied migration set for the three pending
    migrations.
- SQL smoke checks:
  - `public.tasks` exists.
  - `public.task_status` is retired (`to_regtype(...)` returned null).
  - Production task count: `24`.
  - `public.compute_task_due_state(current_date, 'Open'::public.task_workflow_status)`
    returned `Today` with `calendar_incomplete = true`.
  - `public.task_control_loop_metrics` exists and executive aggregate metrics
    returned production totals.
  - RLS simulation:
    - Sales user saw 10 owned tasks.
    - Manager user saw 24 tasks.
    - Executive user saw 0 direct task rows but aggregate metrics returned 24
      total tasks.
    - Super Admin user saw 24 tasks.
- HTTP smoke checks:
  - `https://dsmsalescrm.vercel.app` returned `307` to `/dashboard`.
  - `/login` rendered the production login app shell.
  - `/tasks` rendered the production SSR app shell with Task page title and
    deployed Task assets.
- Not verified:
  - Authenticated production browser smoke checks, because no production
    password/session was available.
  - Remote Supabase advisors, because `supabase db advisors --linked` hung
    after login-role initialization and was stopped.
