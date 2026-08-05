# Implementation Plan: Four-Stage Stabilization and Growth

**Date:** 2026-08-05  
**Status:** APPROVED FOR LOCAL EXECUTION — remote changes, dependency installation, push, merge, and deployment remain separately gated  
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md`  
**Checklist:** `tasks/four-stage-stabilization-and-growth-todo.md`

## Planning rules

- Stages execute sequentially; tasks inside a wave may run in parallel only when they do not touch the same database or UI contract.
- Every schema change starts as an additive local migration and must be proven with a fresh local reset.
- No task in this plan authorizes remote Supabase changes, dependency installation, push, merge, or deployment.
- Existing `tasks/plan.md`, `tasks/todo.md`, and Priority 1 files are historical and remain unchanged.
- Verification commands requiring Supabase variables use `bun --env-file=.env.local test`.
- A failed acceptance check stops advancement to the next stage.

## Dependency map

```text
Stage 1 atomic contracts
  ├─> Stage 2 browser workflows
  ├─> Stage 3 aggregate/pagination contracts
  └─> Stage 4 structured stage analytics

Stage 2 release gates ─> Stage 3 release
Stage 3 server aggregates ─> Stage 4 chart-ready analytics RPCs
Stage 4 acceptance ─> optional Realtime reassessment
```

## Stage 0 — Approval and baseline freeze

### Task 0.1 — Resolve specification decisions

**Output:** approved spec revision and decision log entry.

- Confirm stage order.
- Confirm Task selection/create-new behavior.
- Confirm structured audit JSON.
- Confirm Stage 4 lineage fields.
- Select browser testing tool separately; do not install yet.

**Gate:** spec status changes from DRAFT to APPROVED.  
**Risk:** implementation before this gate could encode the wrong business semantics.

### Task 0.2 — Capture reproducible baseline

**Files:** new dated report under `docs/reports/`; no source changes.

- Record branch, commit, Bun/Node/Supabase CLI versions.
- Run lint, typecheck, tests, build, dependency audit, local Supabase reset/advisors/db lint, and runtime header smoke.
- Record test count, current warnings, audit findings, build chunks, route count, query-count samples, and known environmental limitations.

**Gate:** results are reproducible from documented commands.  
**Rollback:** documentation-only revert.

## Stage 1 — Operational integrity

### Wave 1A — Database command contracts

#### Task 1.1 — Add structured audit payload

**Status:** completed  
**Files:** one new Supabase migration; database contract tests.

- Add nullable `activity_log.event_data jsonb`.
- Add kind-specific checks for newly structured stage events without invalidating old rows.
- Update column-level grants and generated/local types as required.
- Test insert-only history, RLS visibility, malformed payload rejection, and legacy row compatibility.

**Depends on:** 0.1.  
**Rollback:** application can ignore the additive column; never delete written history.

#### Task 1.2 — Add atomic client and commercial follow-up RPCs

**Status:** completed  
**Files:** one new migration, `src/lib/data/` adapters and tests.

- Implement security-invoker RPCs with actor derived from auth.
- Support exact existing Task ID or explicit new Task fields.
- Lock referenced rows and enforce owner/role access.
- Insert/update Task, follow-up log, and activity event atomically.
- Return stable typed result.

**Depends on:** 1.1.  
**Gate:** rollback-injection tests prove zero partial state.

#### Task 1.3 — Add atomic stage-transition RPC

**Status:** completed  
**Files:** one new migration, commercial data adapter and tests.

- Centralize transition validation and Closed Lost reason enforcement.
- Record structured from/to stage event.
- Progress exact Task or create one new Task in the same transaction.
- Preserve current normalized document and RFQ-retirement contracts.

**Depends on:** 1.1.  
**Gate:** concurrent/stale transition tests cannot silently overwrite a newer stage.

### Wave 1B — UI cutover

#### Task 1.4 — Cut follow-up dialogs to atomic adapters

**Status:** completed for local static/data verification; browser verification pending.

**Files:** `AddFollowUpDialog.tsx`, `LogCommercialFollowUpDialog.tsx`, related hooks/adapters/tests.

- Present linked active Tasks and explicit progress/create choice.
- Separate due date and next-action date fields.
- Remove direct multi-write sequences.
- Update exact cache entries and invalidate related lists/details.

**Depends on:** 1.2.

#### Task 1.5 — Cut pipeline transitions to atomic adapter

**Status:** completed for local static/data verification; stale conflict display is generic error toast until browser copy is verified.

**Files:** `_app.pipeline.tsx`, pipeline mutation module/tests.

- Replace independent stage/audit/Task writes.
- Collect next-action text and date with correct labels.
- Handle stale-stage conflict visibly.

**Depends on:** 1.3.

#### Task 1.6 — Load real pipeline follow-ups

**Status:** completed for data adapter and drawer query; browser reload verification pending.

**Files:** `PipelineCardDrawer.tsx`, follow-up query module/tests.

- Query by normalized commercial document ID.
- Render persisted follow-up history after reload.
- Preserve corrections and append-only history semantics.

**Depends on:** 1.2.

#### Task 1.7 — Remove deceptive prototype behavior

**Status:** completed for identified fake client archive success and root language; broader browser inventory pending.

**Files:** affected Client/Pipeline/Saved View components and tests.

- Inventory all production-route toasts/buttons without persistence.
- Implement only already-approved behavior; otherwise disable with an honest state.
- Set document language to Indonesian.

**Depends on:** none after 0.1; may run with 1.4–1.6 if files do not overlap.

#### Task 1.8 — Surface calendar incompleteness

**Status:** completed for Dashboard and Tasks surfaces; no calendar administration route linked yet.

**Files:** Task/Dashboard warning component, selectors/tests.

- Show affected-year warning without changing due-state computation.
- Link Manager to a future calendar administration location only when that route exists; until then provide explanatory text.

**Depends on:** none after 0.1.

### Stage 1 checkpoint

- Run fresh local Supabase reset, full tests, typecheck, lint, and build.
- Manually reload every changed flow and verify persisted state.
- Review migration/RLS contracts against Sales, Manager, Executive, Super Admin, inactive-account fixtures.
- Produce dated Stage 1 verification report.

## Stage 2 — Engineering guardrails

### Wave 2A — Deterministic commands and CI

#### Task 2.1 — Add explicit verification scripts

**Status:** completed locally

**Files:** `package.json`, scripts/config, documentation.

- Add typecheck, CI test, database verification, runtime smoke, audit artifact, and bundle-report commands.
- Keep local `.env.local` handling out of committed secrets and define CI-safe equivalents.

#### Task 2.2 — Expand GitHub Actions

**Status:** completed locally; GitHub-hosted run not yet observed

**Files:** `.github/workflows/ci.yml` or focused workflow files.

- Separate application, database, runtime, dependency-risk, and bundle jobs.
- Cache safely without weakening frozen installs.
- Upload useful non-secret artifacts on failure.

**Depends on:** 2.1.

#### Task 2.3 — Classify dependency advisories

**Status:** baseline triage completed; upgrades/exceptions not yet approved

**Files:** dated security report and approved exception file if needed.

- Trace each dependency path and shipped reachability.
- Upgrade in isolated batches with tests/build after each batch.
- Add dated exceptions only for proven unreachable findings.

**Depends on:** 0.2.  
**Risk:** a bulk upgrade can destabilize Vite/Nitro/TanStack.

### Wave 2B — Browser and observability evidence

#### Task 2.4 — Install approved browser framework

**Status:** blocked pending separate dependency approval

**Files:** package manifest/lockfile, browser config, test fixtures.

- Requires a separate user approval naming the dependency.
- Build deterministic local Supabase seed/users without committing secrets.

#### Task 2.5 — Automate critical browser workflows

**Status:** pending Task 2.4

**Files:** browser tests grouped by workflow.

- Cover the minimum workflows in the spec.
- Prefer stable accessible locators and real persisted assertions after reload.
- Capture screenshots/traces only as CI artifacts.

**Depends on:** 2.4 and Stage 1 checkpoint.

#### Task 2.6 — Verify production observability contract

**Status:** environment/release config completed locally; source-map upload and external ingestion pending deployment/observability decision

**Files:** Sentry initialization/config tests and deployment documentation.

- Check environment/release/source-map configuration without exposing secrets.
- Add a gated non-sensitive verification path, verify it externally after authorized deploy, then disable/remove it.

### Stage 2 checkpoint

- CI passes on a new branch/clean clone.
- Browser suite passes against a fresh local database.
- Audit exceptions are dated and owned.
- No deployment claim is made until the actual deployment is separately authorized and checked.

## Stage 3 — Data and performance

### Wave 3A — Measurement and calendar

#### Task 3.1 — Seed performance fixture and capture baseline

- Define representative counts and role mix.
- Record query counts, payload sizes, build chunks, and route timings.
- Do not use real client data in committed fixtures.

#### Task 3.2 — Add holiday administration/import

**Files:** migration/RLS if needed, calendar data adapter, Manager UI, CSV parser tests.

- Preview and validate before write.
- Commit through one atomic server command.
- Report inserted/skipped/rejected and year coverage.

**Depends on:** Stage 2 checkpoint.

### Wave 3B — Bounded read contracts

#### Task 3.3 — Introduce shared pagination primitives

**Files:** typed pagination contract, query-key factory, tests.

- Define stable cursors/page sizes and server filter serialization.
- Prevent differently shaped cache data from sharing a query key.

#### Task 3.4 — Paginate primary list routes

- Migrate Clients, Tasks, commercial documents/Pipeline, Sales Orders, and Activity one route at a time.
- Preserve search/filter/role results and deep links.
- Add boundary tests for page changes and concurrent inserts.

**Depends on:** 3.3.  
**Delivery:** separate PR/checkpoint per route.

#### Task 3.5 — Add dashboard/report aggregate RPCs

- Establish aggregate definitions from existing tested selectors.
- Implement role/date/owner/client filters server-side.
- Reconcile exact totals against fixtures before UI cutover.

**Depends on:** 3.1.

#### Task 3.6 — Replace Team Settings N+1

- Add one set-returning team summary RPC.
- Preserve active ownership predicates and latest admin event semantics.
- Prove constant query count across team sizes.

**Depends on:** 3.1.

### Wave 3C — Decomposition and budgets

#### Task 3.7 — Decompose large route modules incrementally

- Reports, Client Detail, Commercial Detail, and Pipeline are separate subtasks.
- Extract along query/mutation/form/presentation boundaries.
- No behavioral rewrite in the same change.

#### Task 3.8 — Enforce approved performance budgets

- Compare with 3.1 baseline.
- Choose thresholds from measured representative behavior, record rationale, then enforce in CI.

### Stage 3 checkpoint

- Primary lists are bounded and globally correct under filters.
- Team query count is constant.
- Aggregate totals reconcile with old selectors.
- Export remains complete despite UI pagination.
- Performance report records before/after evidence.

## Stage 4 — Product intelligence

### Wave 4A — Analytics truth and capture

#### Task 4.1 — Approve metric dictionary

**Output:** versioned metric definitions with owner, formula, grain, filters, source fields, effective date, and exclusions.

#### Task 4.2 — Add explicit commercial lineage and PO milestone

**Files:** additive migration, normalized RPC updates, creation UI, tests.

- Add nullable `source_quotation_id` for new Sales Orders.
- Add explicit Customer PO milestone date according to approved model.
- Do not infer/backfill legacy links.

**Depends on:** 4.1 and explicit approval from spec decision 4.

#### Task 4.3 — Verify structured stage-event coverage

- Audit Stage 1 events and effective date.
- Correct future writers if any bypass remains; do not rewrite old logs.

### Wave 4B — Aggregate analytics

#### Task 4.4 — Implement RLS-scoped analytics RPCs

- Win/loss, lost reasons, funnel, cycle-time distributions, dwell time, and coverage/exclusion counts.
- Add database tests for roles, periods, empty data, legacy data, and invalid lineage.

**Depends on:** 4.1–4.3 and Stage 3 aggregate patterns.

#### Task 4.5 — Build report components and data-quality panel

- Separate chart components from route module.
- Apply existing report filters and explicit empty/insufficient-data states.
- Display effective date and coverage beside affected metrics.

**Depends on:** 4.4.

#### Task 4.6 — Extend exports without breaking consumers

- Prefer new sheets/sections.
- Compare screen and exported totals.
- Ask before changing existing column order or schema.

**Depends on:** 4.5.

### Stage 4 checkpoint

- Every displayed sample is traceable to explicit IDs/timestamps.
- Win/loss reconciles with terminal Quotations.
- Cycle/dwell never converts missing history to zero.
- Coverage and exclusions are visible on screen and in export.
- Full CI and real-browser workflows pass.

## Post-program decision

After Stage 4 acceptance, reassess Realtime using measured user need and the now-stable query/mutation contracts. Preferences Sync and PWA require separate specs. They are not automatically approved by completing this plan.
