# Stage 1 Local Verification — Operational Integrity

**Date:** 2026-08-05  
**Scope:** local-only implementation and verification. No remote Supabase push, Git push, deployment, browser-test dependency installation, or production browser verification was performed.

## Implemented locally

- Added structured `activity_log.event_data` for commercial stage-change events.
- Added atomic RPCs:
  - `record_client_follow_up(...)`
  - `record_commercial_follow_up(...)`
  - `transition_commercial_stage(...)`
- Cut client follow-up, commercial follow-up, Pipeline drag/drop, and Pipeline drawer quick-update flows toward the atomic follow-up/stage contracts.
- Added real commercial-document follow-up history query for `PipelineCardDrawer`.
- Added calendar-incomplete warning on Dashboard and Tasks surfaces.
- Changed the root document language to Indonesian with `lang="id"`.
- Disabled the misleading Client row archive success path; it now states no archive was performed.

## Verification results

| Check                               | Result                        | Notes                                                                                                    |
| ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `bunx supabase db reset --local`    | Pass                          | Fresh local database reset completed on branch `main`.                                                   |
| `bun --env-file=.env.local test`    | Pass                          | 503 pass, 0 fail, 2176 expects, 67 files.                                                                |
| `bunx tsc --noEmit`                 | Pass                          | No TypeScript errors.                                                                                    |
| `bun run lint`                      | Pass with baseline warnings   | 0 errors, 12 existing warnings.                                                                          |
| `bun run build`                     | Pass                          | Existing Node `module.register()` and Vite `vite-tsconfig-paths` warnings remain.                        |
| `bunx supabase db advisors --local` | Pass                          | No issues found.                                                                                         |
| `bunx supabase db lint --local`     | Exit 0 with baseline findings | Existing temp-table analyzer findings and unused variables remain; no new Stage 1 lint finding observed. |
| Prettier check on touched files     | Pass                          | All matched files use Prettier style.                                                                    |
| Local browser reload smoke          | Partial pass                  | System Chrome via Playwright against local Vite and local Supabase; Pipeline transition and Client Quick Create follow-up persisted after reload with no console/network errors. |

## Important caveat

An earlier full-test attempt failed because it was run in parallel with `supabase db reset --local`, which restarted the database during the test run. The full suite was rerun after reset completed and passed.

## Browser reload smoke evidence

Browser verification used local Vite at `http://127.0.0.1:5173` and local Supabase at `http://127.0.0.1:54321`. Chromium bundled with Playwright was not installed, so the smoke used the system Google Chrome executable. No browser-test dependency was installed.

### Pipeline stage transition

- Logged in with the local-only seed account `leli@local.dsm.test`.
- Opened `/pipeline`.
- Moved `PT. GLOBAL SEMESTA MANDIRI` quotation card with estimated value `Rp22,4 juta` from `Quotes Sent` to `Hot Prospect`.
- Confirmed the transition dialog with a next action date of `2026-08-07`.
- Observed `transition_commercial_stage` returning HTTP 200.
- Reloaded `/pipeline`.
- Verified persisted state after reload:
  - `Quotes Sent` count changed from 25 to 24.
  - `Hot Prospect` count changed from 0 to 1.
  - The moved card remained in `Hot Prospect` with `07 Agu 2026`.
- Opened the moved card drawer and verified real persisted history:
  - `Stage Quotes Sent → Hot Prospect`.
  - `Follow-up (Phone)`.
  - linked task `Follow-up · Quotation — PT. GLOBAL SEMESTA MANDIRI · 2026-08-07`.
- Browser console warnings/errors: none observed.
- Failed Supabase/network responses: none observed.

### Client Quick Create follow-up

- Opened the global `Quick Create` menu and selected `New Follow Up`.
- Selected client `PT. GLOBAL SEMESTA MANDIRI`.
- Submitted note `Browser reload test follow-up`.
- Set next action `Browser test next action` with date `2026-08-09`.
- Observed `record_client_follow_up` returning HTTP 200.
- Reloaded the client detail page for `PT. GLOBAL SEMESTA MANDIRI`.
- Verified persisted state after reload:
  - Follow-up Timeline contains `Phone · Interested`, date `05 Agu 2026`, and note `Browser reload test follow-up`.
  - Upcoming Actions contains `Follow-up · PT. GLOBAL SEMESTA MANDIRI`, method `Phone`, date `09 Agu 2026`, state `Upcoming`.
- Browser console warnings/errors: none observed.
- Failed Supabase/network responses: none observed.

These browser actions mutated only the local Supabase database after the local reset. No production data was touched.

## Not yet verified

- Browser reload for the commercial-detail follow-up dialog.
- Full pixel/DOM/runtime proof across every changed form.
- Exact React Query cache-update behavior beyond static invalidation and full data refresh.
- Production deployment or production browser behavior.

Full browser automation remains gated by the browser testing dependency/tooling decision from Stage 0. The local smoke above used system Chrome without installing Playwright browsers.
