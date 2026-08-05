# Stage 2 Local Verification — Engineering Guardrails

**Date:** 2026-08-05  
**Scope:** local-only guardrail implementation and verification. Browser-test dependency installation was performed after owner blocker-resolution approval on 2026-08-05. No remote Supabase action, deployment, or production verification was performed.

## Implemented locally

- Added deterministic package scripts for:
  - `typecheck`
  - `test:ci`
  - `verify:app`
  - `verify:ci:app`
  - `verify:db`
  - `smoke:runtime`
  - `audit:deps`
  - `audit:deps:report`
  - `bundle:report`
  - `verify:release-local`
- Expanded GitHub Actions into separate verification jobs:
  - static checks
  - local database gates
  - application and RLS tests
  - runtime smoke and bundle report
  - dependency risk report
- Added non-secret artifact generation:
  - `artifacts/bundle-report.json`
  - `artifacts/dependency-risk-report.md`
- Added `artifacts/` to `.gitignore`.
- Added dependency-risk triage report for the 13 current advisories.
- Added Sentry monitoring config helpers for environment/release mapping without exposing DSN values in tests.
- Added Playwright browser automation:
  - `@playwright/test` dev dependency.
  - Chromium-only `playwright.config.ts`.
  - local preview web server configured against local Supabase.
  - failure screenshots and retry traces under ignored `artifacts/`.
  - browser E2E CI job with fresh local Supabase reset and Playwright Chromium install.
- Fixed the local-production-preview browser blocker:
  - CSP now allows local loopback Supabase HTTP/WebSocket origins only when `VITE_SUPABASE_URL` is loopback.
  - Vercel Speed Insights is disabled on loopback browser hosts to avoid local-preview script/MIME console noise.
  - The inline security headers were moved into a tested helper.

## Verification results

| Check                       | Result                              | Notes                                                                                                                          |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bun run typecheck`         | Pass                                | No TypeScript errors.                                                                                                          |
| `bun run lint`              | Pass with baseline warnings         | 0 errors, 12 existing warnings.                                                                                                |
| `bun run build`             | Pass                                | Existing Node `module.register()` and Vite `vite-tsconfig-paths` warnings remain.                                              |
| `bun run bundle:report`     | Pass                                | Generated local ignored artifact and printed bundle summary.                                                                   |
| `bun run smoke:runtime`     | Pass                                | Built preview returned `/login` 200, `/` 307 to `/dashboard`, and required security headers.                                   |
| `bun run verify:db`         | Pass with baseline db-lint findings | Fresh local database reset and advisors passed; db lint exited 0 with known temp-table analyzer findings and unused variables. |
| `bun run test:ci`           | Pass                                | 511 pass, 0 fail, 2186 expects, 69 files, using explicit local Supabase env values without `.env.local`.                       |
| `bun run audit:deps:report` | Pass                                | Reports 13 advisories into a non-secret artifact; does not mark exceptions as approved.                                        |
| `bun run test:e2e`          | Pass                                | 8/8 Playwright Chromium browser flows passed against local preview and local Supabase.                                         |

## Browser automation evidence

Local browser automation used Playwright Chromium against production preview at
`http://127.0.0.1:4173` and local Supabase at `http://127.0.0.1:54321`.
The local Supabase database was reset before the first verification cycle.

Covered flows:

- unauthenticated `/reports` redirects to `/login`;
- seeded Manager login reaches `/dashboard`;
- Dashboard CSV dropdown download works;
- seeded Sales user creates a Task, reloads, marks it Done, reloads again, and sees it in Completed;
- seeded Sales user records a Client follow-up and sees it after reload;
- seeded Sales user creates a normalized Quotation and sees it through the Quotations route search;
- seeded Sales user creates a normalized Sales Order and sees it through the Sales Orders route;
- seeded Sales user records a commercial-detail follow-up and sees it after reload;
- seeded Sales user moves a Pipeline Quotation to Closed Lost only after the reason dialog is satisfied, then sees the card in Closed Lost after reload;
- seeded Executive user sees the Tasks exception view as read-only with no `Buat Task` action;
- seeded Executive user is denied by the direct `create_sales_order` RPC boundary with `ACTIVE_MUTATING_ROLE_REQUIRED`;
- each automated flow fails on browser console warnings/errors or page errors.

The first browser probe found a real CSP blocker: local production preview
could not connect to local Supabase because `connect-src` omitted
`http://127.0.0.1:54321`. The shipped fix keeps production CSP narrow and adds
loopback only for loopback Supabase configuration.

## GitHub-hosted CI verification

**Latest pushed baseline commit:** `dba65bb` (`test: add browser e2e guardrail`)
**Latest pushed baseline run:** `30985051161`
**Result:** Pass on GitHub-hosted clean runner with fresh local Supabase database.

The browser-flow expansion in this report is local-only until this work is committed, pushed, and a new GitHub-hosted run passes.

| Job                             | Result | Duration |
| ------------------------------- | ------ | -------- |
| Static checks                   | Pass   | 32s      |
| Local database gates            | Pass   | 2m33s    |
| Application and RLS tests       | Pass   | 3m52s    |
| Runtime smoke and bundle report | Pass   | 25s      |
| Dependency risk report          | Pass   | 9s       |

The previous Stage 2 CI run `30978352284` failed in `Application and RLS tests`
because `src/lib/data/team.test.ts` globally mocked `@/lib/supabase`, which
could replace the application Supabase singleton before other data-layer tests
called `supabase.auth.setSession`. The follow-up commit replaced that global
module mock with an injected fake Team client.

An earlier recovery run `30981687347` also passed on commit `5e3f358`
(`fix: isolate team data tests from app supabase client`).

## Bundle snapshot

- Client JS files: 110.
- CSS files: 2.
- Server `.mjs` files: 163.
- Largest client JS asset: `ComposedChart-BnQcJeHL.js`, 417,890 bytes.
- Other large client assets include `jspdf`, `xlsx`, `supabase`, and `html2canvas`.

## Dependency risk snapshot

See `docs/reports/2026-08-05-stage-2-dependency-risk.md`.

No permanent exception was created. Dependency upgrades or dated exceptions still require an explicit decision.

## Observability snapshot

- Browser Sentry config now includes `environment` and `release` when `VITE_SENTRY_DSN` is present.
- Browser release order: `VITE_SENTRY_RELEASE`, then `VITE_VERCEL_GIT_COMMIT_SHA`.
- Server Sentry config now includes `environment` and `release` when `SENTRY_DSN` or `VITE_SENTRY_DSN` is present.
- Server environment order: `SENTRY_ENVIRONMENT`, `VERCEL_ENV`, then `NODE_ENV`.
- Server release order: `SENTRY_RELEASE`, then `VERCEL_GIT_COMMIT_SHA`.
- Unit coverage: `src/lib/monitoring-config.test.ts`.

## Not yet verified

- New GitHub-hosted CI evidence for the browser E2E job is not yet available until this work is committed and pushed.
- Production Sentry source-map upload and external event ingestion behavior are not verified.
