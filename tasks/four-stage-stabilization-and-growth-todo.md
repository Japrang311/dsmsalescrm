# Checklist: Four-Stage Stabilization and Growth

**Status:** APPROVED FOR LOCAL EXECUTION — Stage 2 guardrail wave partially complete; browser automation gate resolved locally
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md`  
**Plan:** `tasks/four-stage-stabilization-and-growth-plan.md`

## Stage 0 — Decisions and baseline

- [x] Approve four-stage order and superseding of the PWA-first order.
- [x] Approve explicit existing-Task versus new-Task choice.
- [x] Approve structured `activity_log.event_data`.
- [x] Approve Stage 4 lineage/Customer PO date fields or reduce Stage 4 scope.
- [x] Select browser testing tool; installation remains separately gated. Playwright Chromium selected and installed locally after owner blocker-resolution approval on 2026-08-05.
- [x] Capture dated reproducible baseline report.

## Stage 1 — Operational integrity

### Database

- [x] Add nullable structured audit payload without modifying old rows.
- [x] Test payload validation, grants, RLS, and append-only behavior.
- [x] Add atomic client follow-up RPC.
- [x] Add atomic commercial follow-up RPC.
- [x] Add atomic commercial stage-transition RPC.
- [x] Prove forced failures roll back all internal writes.
- [x] Prove stale/concurrent stage transitions are rejected safely.
- [x] Prove active Task fields are enforced at database boundary.

### Application

- [x] Replace client follow-up direct writes with canonical adapter.
- [x] Replace commercial follow-up direct writes with canonical adapter.
- [x] Replace pipeline independent writes with canonical transition adapter.
- [x] Separate `due_date` and `next_action_date` labels/inputs.
- [x] Load real commercial follow-up history in Pipeline drawer.
- [x] Remove or honestly disable fake archive/create/saved-view behavior.
- [x] Surface incomplete business-calendar warning.
- [x] Set root document language to Indonesian.
- [ ] Validate exact cache update and invalidation behavior.

### Checkpoint

- [x] Fresh local Supabase reset succeeds.
- [x] Full database and application tests pass.
- [x] Typecheck, lint, and build pass with warning delta documented.
- [ ] Manual reload confirms persisted state for each changed flow. Pipeline transition and Client Quick Create follow-up passed local browser reload smoke; commercial-detail follow-up dialog remains unverified in browser.
- [x] Role matrix passes for Sales/Manager/Executive/Super Admin/inactive.
- [x] Dated Stage 1 verification report is reviewed.

## Stage 2 — Engineering guardrails

- [x] Add deterministic typecheck/test/database/runtime/audit/bundle commands.
- [x] Expand CI into application, database, runtime, audit, and bundle jobs.
- [x] Generate useful non-secret failure artifacts.
- [x] Triage all 13 baseline dependency advisories.
- [x] Add owner and expiry to every approved exception. No approved dependency exception exists as of 2026-08-05; future exceptions must include owner and expiry before acceptance.
- [x] Obtain approval before installing browser test dependency. Owner resolved the blocker on 2026-08-05; `@playwright/test` and Chromium were installed locally.
- [x] Automate authentication/protected-route workflow. `e2e/browser-flows.spec.ts` verifies `/reports` redirects to `/login`, seeded Manager login reaches `/dashboard`, and browser console/page errors stay clean.
- [x] Automate Task progress and both follow-up workflows. Browser E2E covers Task create/reload/Done, client follow-up create/reload, and commercial-detail follow-up create/reload.
- [x] Automate stage transitions and Closed Lost validation. Browser E2E proves Closed Lost cannot proceed without the reason dialog and persists after reason selection.
- [x] Automate normalized Quotation/Sales Order creation smoke. Browser E2E creates a normalized Quotation and Sales Order from Client Detail and verifies routed lists.
- [x] Automate representative unauthorized-write denial. Browser/RLS E2E verifies Executive read-only Task UI and direct Executive `create_sales_order` RPC denial.
- [x] Automate Reports/export smoke. Browser E2E verifies Dashboard CSV dropdown download.
- [ ] Verify Sentry environment/release/source-map contract without exposing secrets. Environment/release config now has unit coverage; source-map upload and external ingestion remain unverified.
- [x] Prove CI passes on a clean clone and fresh local database. Latest pushed baseline GitHub Actions run `30985051161` passed on commit `dba65bb`; current local browser expansion still needs a post-push CI run.
- [ ] Review dated Stage 2 verification report. Local browser automation now covers all planned critical workflows; Sentry source-map/external ingestion and GitHub-hosted CI evidence for this uncommitted update remain open.

## Stage 3 — Data and performance

- [ ] Create anonymized representative performance fixture. Current baseline persists only anonymized metrics from seeded local data; synthetic larger-scale fixture remains open.
- [x] Capture query/payload/bundle/timing baseline. `bun run stage3:baseline` writes `docs/reports/2026-08-05-stage-3-performance-baseline.md` and ignored JSON artifact.
- [x] Build Manager holiday administration. Master Data now lists business-calendar rows and lets Manager/Super Admin delete entries.
- [x] Build CSV preview/validation/atomic import. Settings preview validates CSV locally, then writes through `import_business_calendar_holidays(jsonb)` in one DB transaction.
- [x] Test duplicate dates, invalid rows, and incomplete-year reporting. Parser tests cover invalid/missing/duplicate rows; DB tests cover duplicate rejection, Manager import, Sales denial, and existing incomplete-calendar fixtures.
- [x] Define typed pagination and query-key contracts. `src/lib/pagination-contracts.ts` defines bounded page size, opaque cursor, stable filter serialization, and shape-separated query keys with unit coverage.
- [ ] Paginate Clients with server filters and stable order.
- [ ] Paginate Tasks with server filters and stable order.
- [ ] Paginate commercial documents/Pipeline with server filters and stable order.
- [ ] Paginate Sales Orders with server filters and stable order.
- [ ] Paginate Activity with server filters and stable order.
- [ ] Prove page navigation has no duplicate/missing rows.
- [ ] Add dashboard/report aggregate RPCs and reconcile totals.
- [ ] Replace Team Settings N+1 with one set-returning RPC.
- [ ] Prove Team query count is constant as member count grows.
- [ ] Keep export complete and independent of current UI page.
- [ ] Decompose Reports without behavioral changes.
- [ ] Decompose Client Detail without behavioral changes.
- [ ] Decompose Commercial Detail without behavioral changes.
- [ ] Decompose Pipeline without behavioral changes.
- [ ] Approve and enforce measured performance budgets.
- [ ] Review dated Stage 3 before/after report.

## Stage 4 — Product intelligence

- [ ] Approve versioned metric dictionary.
- [ ] Add explicit new-record Quotation → Sales Order lineage.
- [ ] Add explicit Customer PO business milestone date.
- [ ] Confirm no inferred legacy backfill was performed.
- [ ] Verify structured stage-event coverage/effective date.
- [ ] Implement RLS-scoped win/loss aggregates.
- [ ] Implement lost-reason aggregates using existing contract.
- [ ] Implement event-based funnel aggregates.
- [ ] Implement traceable cycle-time distributions.
- [ ] Implement completed/open stage dwell metrics.
- [ ] Return coverage and exclusion counts with every affected metric.
- [ ] Build separate report chart components.
- [ ] Build data-quality/coverage panel.
- [ ] Apply existing owner/range/client filters consistently.
- [ ] Test empty and insufficient-history states.
- [ ] Extend exports without changing existing columns/order unless approved.
- [ ] Reconcile on-screen and exported totals.
- [ ] Prove each displayed cycle sample resolves to explicit IDs and dates.
- [ ] Review dated Stage 4 verification report.

## Program completion

- [ ] All four stage checkpoints are accepted in sequence.
- [ ] Released contracts and decision log are updated.
- [ ] Local verification, CI verification, remote migration, deployment, and browser production verification are reported separately.
- [ ] Exact target approval obtained before any remote Supabase action.
- [ ] Exact branch/commit approval obtained before push/merge/deploy.
- [ ] Realtime is reassessed only after Stage 4; no automatic implementation.
- [ ] Preferences Sync and PWA remain separate future specs unless explicitly authorized.
