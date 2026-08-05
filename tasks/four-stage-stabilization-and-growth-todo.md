# Checklist: Four-Stage Stabilization and Growth

**Status:** APPROVED FOR LOCAL EXECUTION — Stage 2 guardrail wave partially complete; browser automation remains gated
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md`  
**Plan:** `tasks/four-stage-stabilization-and-growth-plan.md`

## Stage 0 — Decisions and baseline

- [x] Approve four-stage order and superseding of the PWA-first order.
- [x] Approve explicit existing-Task versus new-Task choice.
- [x] Approve structured `activity_log.event_data`.
- [x] Approve Stage 4 lineage/Customer PO date fields or reduce Stage 4 scope.
- [ ] Select browser testing tool; installation remains separately gated.
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
- [ ] Add owner and expiry to every approved exception.
- [ ] Obtain approval before installing browser test dependency.
- [ ] Automate authentication/protected-route workflow.
- [ ] Automate Task progress and both follow-up workflows.
- [ ] Automate stage transitions and Closed Lost validation.
- [ ] Automate normalized Quotation/Sales Order creation smoke.
- [ ] Automate representative unauthorized-write denial.
- [ ] Automate Reports/export smoke.
- [ ] Verify Sentry environment/release/source-map contract without exposing secrets. Environment/release config now has unit coverage; source-map upload and external ingestion remain unverified.
- [ ] Prove CI passes on a clean clone and fresh local database.
- [ ] Review dated Stage 2 verification report. Local partial report exists; GitHub-hosted CI/browser/Sentry evidence remains open.

## Stage 3 — Data and performance

- [ ] Create anonymized representative performance fixture.
- [ ] Capture query/payload/bundle/timing baseline.
- [ ] Build Manager holiday administration.
- [ ] Build CSV preview/validation/atomic import.
- [ ] Test duplicate dates, invalid rows, and incomplete-year reporting.
- [ ] Define typed pagination and query-key contracts.
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
