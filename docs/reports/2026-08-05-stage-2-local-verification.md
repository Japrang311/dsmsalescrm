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

**Latest pushed commit:** `7ae20aa` (`fix: derive commercial Next FU from tasks, wire Sentry source-map upload`)
**Latest pushed run:** `31004149430`
**Result:** Pass on GitHub-hosted clean runner with fresh local Supabase database, all 7 jobs green.

| Job                             | Result | Duration |
| ------------------------------- | ------ | -------- |
| Static checks                   | Pass   | 30s      |
| Local database gates            | Pass   | 2m34s    |
| Application and RLS tests       | Pass   | 3m41s    |
| Runtime smoke and bundle report | Pass   | 22s      |
| Dependency risk report          | Pass   | 8s       |
| Production migration parity     | Pass   | 11s      |
| Browser E2E flows               | Pass   | 3m55s    |

`Application and RLS tests` failed on the first attempt of this run
(`failed to bind host port for 0.0.0.0:54322: address already in use`) — a
transient Docker networking flake on the GitHub-hosted runner starting local
Supabase, unrelated to the pushed change. Re-running only that job passed
cleanly on the same commit.

The previous Stage 2 CI run `30978352284` failed in `Application and RLS tests`
because `src/lib/data/team.test.ts` globally mocked `@/lib/supabase`, which
could replace the application Supabase singleton before other data-layer tests
called `supabase.auth.setSession`. The follow-up commit replaced that global
module mock with an injected fake Team client.

An earlier recovery run `30981687347` also passed on commit `5e3f358`
(`fix: isolate team data tests from app supabase client`), and baseline run
`30985051161` passed on commit `dba65bb` before the browser E2E and Sentry
source-map work in this report was pushed.

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
- Source-map upload wired via `@sentry/vite-plugin` in `vite.config.ts`, gated on `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` all being present — a no-op build otherwise. Uses `sourcemap: "hidden"` (maps generated for upload but not linked from shipped JS via `sourceMappingURL`), because a dry run with throwaway fake credentials proved the plugin only deletes local `.map` files after a *successful* upload: a failed/misconfigured upload left 112 map files in the public static output. Hidden mode means an undeleted map still isn't reachable through normal devtools/browser flow.
- Verified without real secrets: two local dry-run builds with throwaway fake `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` values — no-token build emits zero `.map` files, fake-token build activates the plugin, attempts a real upload, fails cleanly on auth (`Project not found`) without breaking the build, and after the hidden-sourcemap fix emits zero `sourceMappingURL` references in shipped JS.

## Not yet verified

- Production Sentry source-map upload against a real Sentry project and external event ingestion: no Sentry project/DSN exists for this app yet. Requires the owner to create a Sentry project and supply `SENTRY_DSN`/`VITE_SENTRY_DSN` plus an upload auth token — a credential/account decision outside this pass.
