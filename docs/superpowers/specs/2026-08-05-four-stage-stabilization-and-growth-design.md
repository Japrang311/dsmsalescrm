# Four-Stage Stabilization and Growth Program

**Date:** 2026-08-05  
**Status:** APPROVED  
**Scope:** Approved for local implementation through the staged plan; this document does not authorize remote Supabase changes, dependency upgrades, push, or deployment.  
**Supersedes:** Execution order in `tasks/priority-1-plan.md`; that file remains historical evidence and must not be overwritten.

## 1. Executive decision

The product must improve in this order:

1. **Operational integrity** — make every follow-up, Task progress, and commercial-stage change truthful and atomic.
2. **Engineering guardrails** — make regressions, security drift, and broken database contracts fail before release.
3. **Data and performance** — move unbounded reads and N+1 summaries to paginated or server-aggregate contracts.
4. **Product intelligence** — add win/loss, cycle-time, and dwell-time analytics only from explicit, auditable source data.

Realtime, Preferences Sync, and PWA are not part of the four mandatory stages. Realtime may be reconsidered after Stage 4 acceptance; Preferences Sync and PWA remain optional backlog items. Adding faster synchronization before write contracts are reliable would distribute inconsistent state faster.

## 2. Evidence baseline

The current repository baseline used by this specification is:

- 482 tests pass, 0 fail, across 63 files.
- Typecheck and production build pass.
- Lint passes with 12 warnings.
- Local Supabase advisors are clean, while database lint still reports two temporary-table analysis errors and two unused-variable warnings.
- Dependency audit reports 13 advisories: 8 high, 3 moderate, and 2 low. Reachability has not yet been classified.
- GitHub CI currently runs only install, lint, and build.
- Local runtime smoke verified `/login` returns 200, `/` redirects with 307, and configured security headers are present.

These observations are a planning baseline, not a production certification.

## 3. Product and architecture invariants

The following invariants apply to every stage:

- Active commercial flow remains **Client → Quotation → Customer PO → Sales Order → Revenue**. RFQ remains retired; no new RFQ screen, write path, or required field may return.
- PostgreSQL and RLS are the final authorization boundary. UI visibility is not authorization.
- Super Admin manages account lifecycle and ownership but is not automatically a business-data owner.
- Audit and follow-up history are append-only. Existing rows are never rewritten to create a cleaner narrative.
- No fuzzy matching, silent task merge, or automatic task closure. When an existing Task is progressed, its exact ID must be selected.
- A user action that represents one business event must commit completely or fail completely.
- Active Task states require both `next_action` and `next_action_date` at the database boundary.
- `due_date` is the Task commitment date. `next_action_date` is the date of the next promised action. They may be equal, but they are not interchangeable.
- Legacy records lacking new analytics fields remain visible and are reported as excluded/unknown, never backfilled by inference.
- Existing exports remain backward compatible unless the user explicitly approves a format change.

## 4. Stage 1 — Operational integrity

### 4.1 Objective

Create one trustworthy Sales Task Control Loop so client follow-up, commercial follow-up, Task progress, pipeline transition, follow-up history, and activity audit cannot diverge.

### 4.2 Canonical command contracts

Each UI action must call one server command. The recommended boundary is one security-invoker RPC per business action rather than a universal RPC:

1. `record_task_progress(...)` remains the only way to progress an existing Task.
2. `record_client_follow_up(...)` records a client-level follow-up and either:
   - progresses an explicitly selected Task ID; or
   - creates one new active Follow-Up Task with `due_date`, `next_action`, and `next_action_date` supplied explicitly.
3. `record_commercial_follow_up(...)` applies the same rule and requires the exact `commercial_document_id`.
4. `transition_commercial_stage(...)` locks the commercial document, validates the transition and Closed Lost requirements, updates the stage, appends a structured stage event, and progresses an explicitly selected Task or creates a new Task in the same transaction.

All four commands must derive actor identity from `auth.uid()`, respect current RLS ownership rules, set a pinned `search_path`, reject inaccessible entity IDs, and return IDs for every row created or changed.

### 4.3 Structured audit data

Add nullable `event_data jsonb` to `activity_log`, protected by kind-specific database checks for newly written events. A commercial stage-change event must contain:

```json
{
  "schema_version": 1,
  "from_stage": "Negotiation",
  "to_stage": "Hot Prospect",
  "effective_at": "2026-08-05T09:30:00+07:00"
}
```

Old `detail` text remains untouched and readable. Analytics must not parse human-readable `detail` strings.

### 4.4 UI behavior

- Follow-up dialogs show linked active Tasks. Users explicitly choose **Progress existing Task** or **Create new Task**.
- Creating an active Task requires separate fields for Task due date, next action text, and next action date.
- Pipeline stage-change UI collects next action text as well as its date; it must not label `due_date` as next action.
- `PipelineCardDrawer` loads real `follow_up_logs` for the selected commercial document.
- Any optimistic UI must be based on the single RPC result and then invalidate the exact React Query keys for reconciliation.
- Placeholder actions such as fake archive, fake commercial-item creation, and fake saved views must be implemented truthfully or disabled with an explicit “belum tersedia” state. Success toast without persistence is forbidden.
- The Task and Dashboard surfaces show a warning when `calendarIncomplete` is true. The warning states that weekend calculation works but national/company holidays for the relevant year are incomplete.
- Root document language changes to `lang="id"` unless a later localization system selects language dynamically.

### 4.5 Database and test acceptance

- Every canonical RPC has migration tests covering owner, manager, executive, Super Admin, inactive user, inaccessible entity, invalid active Task fields, Closed Lost reason, and transaction rollback.
- A forced failure after the first internal write proves no partial follow-up, Task, document-stage, or activity row remains.
- Direct application exports that perform multi-write progress are removed or made private.
- No new active Task can be created by these flows without `next_action` and `next_action_date`.
- The drawer shows persisted follow-ups after reload.
- Fake success states are absent from production routes.
- Existing Task history and legacy follow-up rows remain unchanged.

### 4.6 Out of scope

Realtime subscriptions, analytics charts, broad route refactors, and holiday administration are not implemented in Stage 1. Only the incomplete-calendar warning is included here.

## 5. Stage 2 — Engineering guardrails

### 5.1 Objective

Turn current local evidence into repeatable release gates without requiring production credentials in pull-request CI.

### 5.2 CI contract

CI must use a frozen Bun version and lockfile, then run independent jobs:

- **Application:** lint, TypeScript `tsc --noEmit`, unit/integration tests, and production build.
- **Database:** start local Supabase, reset from migrations, run database-backed tests, advisors, and database lint. Known analyzer false positives require a documented rule and expiry; they may not be silently ignored.
- **Runtime smoke:** start the built preview, verify `/login`, protected-route redirect, and required security headers.
- **Dependency risk:** produce a machine-readable audit artifact and enforce the approved risk policy.
- **Bundle budget:** record route/chunk sizes and fail on an approved threshold or material regression.

### 5.3 Dependency triage

Every current advisory receives package, dependency path, production reachability, exploit condition, remediation, owner, and target date. A high severity finding may be temporarily allowed only when it is proven unreachable in the shipped runtime, has an expiry date, and is reviewed in the PR. Blind upgrades are forbidden because the current Vite/Nitro/TanStack graph may contain compatibility constraints.

### 5.4 Browser workflows

Add real-browser coverage for at least:

- authentication and protected-route redirect;
- create/open/progress a Task;
- client follow-up and commercial follow-up persistence;
- valid and invalid pipeline stage transitions;
- create Quotation and Sales Order through current normalized RPCs;
- Closed Lost reason enforcement;
- role-based denial for one representative unauthorized write;
- Reports and export smoke.

Browser tooling or a new dependency requires explicit approval before installation. Static DOM tests do not satisfy this acceptance criterion.

### 5.5 Observability and release acceptance

- Production Sentry configuration is verified without printing DSNs or tokens.
- A deliberately captured non-sensitive test error is visible in the correct environment/project, then the test path is removed or gated.
- Source maps and release identifiers are checked according to the deployment provider contract.
- CI must pass on a clean clone.
- Security headers must be tested against the built application, not only configuration text.
- No unresolved reachable Critical/High dependency risk may pass the release gate without a dated, approved exception.

## 6. Stage 3 — Data and performance

### 6.1 Objective

Bound database work and payload size while preserving RLS, filters, exports, and current business totals.

### 6.2 Business calendar administration

- Manager gets a read/write administration surface for `business_calendar_holidays`; other roles retain the minimum permissions required by policy.
- Support validated CSV import with preview, duplicate-date detection, year coverage summary, and an explicit commit step.
- A unique date constraint remains the database duplicate boundary.
- Imports are atomic and return inserted/skipped/rejected counts.
- Task views expose which year coverage is incomplete.

### 6.3 Paginated list contracts

Clients, Tasks, commercial documents, Sales Orders, and Activity lists receive server pagination with stable ordering and total counts. The default contract uses cursor pagination where stable composite cursors are available; offset pagination is acceptable only with a documented stable order and bounded page size.

Filters, search, ownership, archived state, and date range must execute on the server. RLS remains active. Client-side filtering of an already truncated page must not be presented as a global result.

### 6.4 Aggregate contracts

- Dashboard and Reports use role-aware aggregate RPCs instead of downloading all source rows for totals.
- Team Settings replaces four queries per member with one set-returning summary RPC covering owned active counts and latest administrative event.
- Aggregate RPCs must have explicit return types, pinned `search_path`, RLS-equivalent authorization, and query-plan/index evidence.
- Exports use a separate bounded/export contract and must not reuse a one-page UI query.

### 6.5 Structural decomposition

Split large route/component files by stable responsibility, not arbitrary line count. Initial targets are Reports, Client Detail, Commercial Detail, and Pipeline. Extract query hooks, mutation controllers, form/dialog modules, and pure presentation sections while preserving route behavior and query keys.

### 6.6 Performance acceptance

- Capture a pre-change baseline using a seeded representative dataset.
- No primary list initially fetches unbounded `select("*")` rows.
- Team page query count remains constant as team size grows.
- Dashboard totals equal the pre-change selectors for the same fixture and role.
- Pagination preserves deterministic order with no duplicate or missing row while moving between pages.
- Bundle and runtime measurements show no material regression; the approved budget is recorded in the Stage 3 implementation PR.

## 7. Stage 4 — Product intelligence

### 7.1 Objective

Expose decision-grade funnel and timing metrics without inventing historical lineage.

### 7.2 Truth contract before charts

The existing proposal to join Quotation and Sales Order by `so_number` is not sufficient proof of Quotation → Customer PO → Sales Order lineage. Stage 4 begins by approving and implementing an analytics truth contract:

- Win = Quotation in `Closed Won`; loss = Quotation in `Closed Lost`; denominator excludes non-terminal stages.
- Lost-reason breakdown reuses the existing Closed Lost reason contract.
- New Sales Orders store an explicit nullable `source_quotation_id` when created from a Quotation.
- Customer PO milestone stores an explicit business date, separate from free-text PO number and separate from document creation time.
- New stage changes use structured `activity_log.event_data` from Stage 1.
- Metrics expose `analytics_effective_from`, included rows, excluded rows, and exclusion reason.
- Legacy records are never linked solely by client name, SO number, amount, or date proximity.

If the user declines the new lineage fields, only win/loss counts and lost-reason analytics are authorized; Quote → PO → SO cycle time must remain unavailable.

### 7.3 Metrics

- Win/loss count, value, and rate by owner, period, client, and product where source fields support it.
- Quotation → Customer PO, Customer PO → Sales Order, and end-to-end median/p50/p75/p90 duration for explicitly linked records.
- Stage-entry funnel based on events, not current-stage snapshots.
- Stage dwell time from consecutive structured stage events; open dwell is reported separately from completed dwell.
- Data-quality panel showing missing lineage, missing milestone dates, excluded legacy rows, and coverage percentage.

### 7.4 Delivery shape

- Server aggregate RPCs return chart-ready, RLS-scoped data; Reports does not download the full commercial history.
- Pure selectors remain only for formatting or small client-side transforms and receive unit tests.
- Chart components are separate from `_app.reports.tsx`.
- Existing report filters apply consistently.
- CSV/XLSX/PDF additions use new sheets/sections where possible. Any breaking column/order change requires explicit user approval.

### 7.5 Acceptance

- Win/loss totals reconcile exactly with current terminal Quotation records for the same filter.
- Every cycle-time sample can be traced to explicit IDs and milestone dates.
- No excluded legacy row is treated as zero duration.
- Stage dwell reports the effective logging date and coverage.
- Role-scoped aggregate results match row-level RLS fixtures.
- Charts, empty states, data-quality warnings, and exports are tested.

## 8. Program gates and rollback

Each stage is independently releasable and must pass its own acceptance criteria before the next stage begins. Database migrations must be additive first, with application cutover proven before any old write path is removed. Rollback means returning the application to the previous compatible contract; it never deletes audit/history rows created by a released stage.

Remote actions require a separate approval naming the exact Supabase project, branch/commit, and deployment target.

## 9. Required decisions before implementation

1. APPROVED 2026-08-05: the four-stage order supersedes the old PWA-first priority order.
2. APPROVED 2026-08-05: follow-up flows require an explicit choice between progressing an existing Task and creating a new Task.
3. APPROVED 2026-08-05: future audit events may write structured `activity_log.event_data`.
4. APPROVED 2026-08-05: Stage 4 may add `source_quotation_id` and Customer PO milestone date fields for new records.
5. PENDING: choose and approve a real-browser test dependency/tool before Stage 2 installs anything.

## 10. Definition of done

The program is complete only when all four stage checkpoints pass, repository documentation reflects the released contracts, local and CI verification evidence is recorded, production deployment is separately approved and verified, and no claim of browser/production success relies only on static inspection.
