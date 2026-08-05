# Stage 0 Baseline: Four-Stage Stabilization and Growth

**Date:** 2026-08-05 10:39 WIB  
**Branch:** `main`  
**Commit:** `7c694b9e1c4b23b64c568fc06762ad78e2fc1b14`  
**Plan:** `tasks/four-stage-stabilization-and-growth-plan.md`  
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md`  
**Status:** Baseline captured; Stage 1 remains blocked until spec decisions are approved.

## Toolchain

- Bun: `1.3.14`
- Node: `v26.4.0`
- Supabase CLI: `2.109.1`
- Supabase CLI notice: `2.111.0` is available; no upgrade was performed during this baseline.

## Verification Results

| Check             | Command                                                       | Result                                                 |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| Lint              | `bun run lint`                                                | Pass with 12 warnings                                  |
| Typecheck         | `bunx tsc --noEmit`                                           | Pass                                                   |
| Tests             | `bun --env-file=.env.local test`                              | Pass: 482 tests, 0 failures, 2118 assertions, 63 files |
| Build             | `bun run build`                                               | Pass                                                   |
| Dependency audit  | `bun audit --json`                                            | Fails by policy because advisories exist: 13 total     |
| Local DB reset    | `bunx supabase db reset --local`                              | Pass                                                   |
| Local DB advisors | `bunx supabase db advisors --local`                           | Pass: no issues found                                  |
| Local DB lint     | `bunx supabase db lint --local`                               | Exit 0 with known findings                             |
| Runtime smoke     | `bun run preview --host 127.0.0.1 --port 4173` plus `curl -I` | Pass for basic HTTP/header checks                      |

## Current Warning And Risk Baseline

Lint reports 12 warnings:

- 11 `react-refresh/only-export-components` warnings in component/context files.
- 1 `react-hooks/exhaustive-deps` warning in `src/components/tasks/TaskDetailDrawer.tsx`.

Dependency audit reports 13 advisories:

- High: 8
- Moderate: 3
- Low: 2
- Affected packages reported by `bun audit`: `@babel/core`, `brace-expansion`, `esbuild`, `js-yaml`, and `postcss`.

Local database lint reports:

- Error: `private.migrate_commercial_document_data` references temporary relation `tmp_ci_pool` in analyzer output.
- Error: `public.admin_import_normalized_documents` references temporary relation `tmp_imported_quotation_ids` in analyzer output.
- Warning: `public.reassign_client_owner` declares but never reads `v_old_owner_id`.
- Warning: `public.reassign_client_owner` declares but never reads `v_new_owner_name`.

## Build And Runtime Baseline

Build completed successfully for client, SSR, and Nitro Vercel output.

Notable client asset sizes from the build output:

- Largest client JavaScript chunk: `ComposedChart-WQZQ9ktw.js` at 417.89 kB, gzip 109.30 kB.
- Other large client chunks include `jspdf.es.min`, `index`, `xlsx`, `supabase`, and `html2canvas`.
- Static asset count after build: 111 JavaScript files and 2 CSS files under `.vercel/output/static/assets`.
- Server output count: 163 `.mjs` files under `.vercel/output/functions/__server.func`.

Route files observed under `src/routes`: 17 files, including the root, login, dashboard, clients, tasks, pipeline, quotations, sales orders, reports, activity, and settings routes.

Runtime smoke from built preview:

- `GET /login` returns `200`.
- `GET /` returns `307` with `location: /dashboard`.
- Headers observed include `content-security-policy`, `permissions-policy`, `referrer-policy`, `strict-transport-security`, `x-content-type-options`, and `x-frame-options`.

## Limitations

- This report is local evidence, not production certification.
- No real-browser workflow or authenticated UAT was executed.
- Query-count samples were not captured in Stage 0 because no approved browser/runtime instrumentation exists yet; Stage 2 and Stage 3 should add deterministic measurement.
- Dependency reachability was not triaged; Stage 2 owns advisory classification and upgrades/exceptions.
- No source code, database migration, dependency, remote Supabase project, push, merge, or deployment was changed.

## Gate Status

Stage 0 baseline capture is complete. Stage 1 must not begin until these decisions are approved:

1. Four-stage order supersedes old PWA-first order.
2. Follow-up flows use explicit existing Task selection or explicit create-new Task fields.
3. Future audit events may store structured `activity_log.event_data`.
4. Stage 4 may add `source_quotation_id` and explicit Customer PO milestone date, or cycle-time analytics remains out of scope.
5. Browser test dependency/tool is chosen before Stage 2 installs anything.
