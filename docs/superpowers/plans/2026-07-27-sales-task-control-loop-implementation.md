# Sales Task Control Loop Implementation Plan

> **Status:** Proposed. This plan does not authorize implementation, remote
> migration, Git push, or deployment.

**Goal:** Evolve the existing Task feature into a closed execution loop where
Sales and Manager record progress, next action, and follow-up date; overdue work
is escalated after two business days; and every transition remains traceable
without creating a second Task module or a third Notes store.

**Source of truth:**

- `docs/ideas/sales-task-control-loop.md`
- `docs/ideas/sales-task-control-loop-claude-handoff.md`
- `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`

**Detailed checklist:** `tasks/sales-task-control-loop-todo.md`

## Planning Boundary

The one-pager locks the product direction, but these technical decisions still
require approval in Task 1:

1. canonical progress record and its relationship to `activity_log`;
2. deterministic mapping for existing Task records;
3. authoritative holiday source, synchronization, correction, and fallback;
4. exact escalation boundary within the Asia/Jakarta business day;
5. notification persistence versus query-time derivation.

No implementation task may start until Task 1 is approved. Later tasks describe
the intended delivery sequence, not permission to silently choose these
decisions.

## Current-State Evidence

Repository audit on 2026-07-27 found:

- `public.task_status` stores `Today`, `Overdue`, `Upcoming`, and `Done`.
- UI code also derives overdue from `due_date`, while Dashboard, Reports,
  TopBar, Pipeline, Client Detail, exports, and account-lifecycle code still
  consume the stored status.
- `tasks.client_id` and `follow_up_logs.client_id` are required.
- Task notes are appended to `activity_log`; richer follow-up records are
  appended to `follow_up_logs`.
- `LogFollowUpDialog` performs follow-up insert, Task update, optional next-Task
  creation, and Activity Log inserts as independent browser writes.
- Manager already has broad database visibility and may own Task records, but
  the UI does not separate My Tasks from Team Exceptions.
- Executive currently has company-wide detail read access to Task,
  `activity_log`, and `follow_up_logs`.
- Archive already exists as `tasks.archived` and must remain separate from
  Done/Cancelled.
- No centralized holiday calendar or business-day function exists; several UI
  paths use `Date.setDate()`.

## Proposed Architecture

These choices are implementation proposals and become locked only after Task 1:

- Keep `public.tasks` as the single Task aggregate.
- Store workflow status separately from a database-derived due state.
- Keep `follow_up_logs` as the progress-domain record and `activity_log` as the
  immutable audit trail; render both through one normalized timeline read
  interface without creating a third Notes table.
- Route one progress action through one database transaction/RPC so the note,
  next action, follow-up date, workflow status, and audit event cannot diverge.
- Store the approved holiday calendar in Supabase as the canonical runtime
  source. Provider synchronization or controlled import feeds that table;
  application components never calculate business-day aging independently.
- Introduce the new model alongside the legacy `status` column, migrate every
  consumer, reconcile existing data, and only then retire the old enum.
- Continue the repository's imperative-migration workflow. At implementation
  time, create each migration with `bunx supabase migration new <name>` and
  review the generated filename; do not invent timestamps.
- Enforce Sales, Manager, Executive, and Super Admin boundaries in RLS/database
  contracts. UI filtering is presentation only.
- Give Executive only Manager-escalation detail plus a separate aggregate-only
  interface. Any privileged aggregate function must explicitly check role,
  pin `search_path`, revoke default `PUBLIC` execution, expose no row detail,
  and receive dedicated security tests.

## Dependency Graph

```text
Task 1 technical specification approval
  -> Task 2 characterization tests
     -> Task 3 compatible schema and RLS
        -> Task 4 business calendar and due state
        -> Task 5 atomic progress and timeline contract
           -> Task 6 domain/data adapters
              -> Tasks 7-10 core role flows
                 -> Tasks 11-15 consumer migration
                    -> Task 16 existing-data cutover
                       -> Task 17 local verification
                          -> Task 18 separately approved release
```

## Delivery Phases

### Phase 0 — Technical Contract Gate

#### Task 1: Approve the technical specification

**Description:** Convert the product one-pager and current-state audit into a
reviewable technical specification. Resolve the five planning-boundary
decisions and record the exact migration, RLS, RPC, timeline, calendar, and
rollback contracts.

**Acceptance criteria:**

- [ ] The spec contains a field-level target schema, role/action matrix, RPC
      contract, due-state algorithm, calendar-source decision, and migration
      mapping.
- [ ] Unmappable existing data has an explicit compatibility/review state; no
      Client, category, next action, or workflow value is fabricated.
- [ ] Current Supabase changelog/docs have been checked for relevant migration,
      RLS, function, and Data API behavior, and the product owner explicitly
      approves the spec before Task 2 begins.

**Verification:**

- [ ] Cross-check every locked one-pager rule against the spec.
- [ ] Re-run the status/timeline/RLS consumer search and attach the inventory.

**Dependencies:** None

**Files likely touched:**

- `docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md`
- `docs/ideas/sales-task-control-loop-claude-handoff.md`

**Estimated scope:** Small

### Phase 1 — Compatibility and Database Foundation

#### Task 2: Lock legacy behavior with characterization tests

**Description:** Add tests that describe the current status consumers, Task and
follow-up ownership rules, Executive overexposure, Super Admin correction
behavior, archive semantics, and multi-write failure risk before changing the
schema.

**Acceptance criteria:**

- [ ] Tests cover all four roles for Task, follow-up, and Activity Log reads and
      writes.
- [ ] Selector tests identify every KPI or list that treats due state as stored
      workflow status.
- [ ] The inventory names every independent progress write and the failure
      scenarios that Task 5 must first reproduce with a failing atomicity test.

**Verification:**

- [ ] Focused characterization tests pass against a clean local Supabase reset.
- [ ] The Task 5 red-test cases are documented but are not left as permanent
      failures in the Task 2 test suite.

**Dependencies:** Task 1

**Files likely touched:**

- `supabase/tests/tasks.test.ts`
- `supabase/tests/follow-up-logs.test.ts`
- `src/lib/data/tasks.test.ts`
- `src/lib/data/dashboard-selectors.test.ts`

**Estimated scope:** Medium

#### Task 3: Add a backward-compatible Task schema and RLS contract

**Description:** Add the approved workflow status, category, next-action,
next-action date, cancellation metadata, and optional Client relationship while
temporarily preserving the legacy status column for dual-read migration.
Enforce owner eligibility and role boundaries at the database layer.

**Acceptance criteria:**

- [ ] Owner is required and restricted to active Sales or Manager; Client and
      commercial relations are nullable end-to-end.
- [ ] Active workflow states enforce next-action/date rules after compatibility
      migration, while Done and Cancelled follow their approved terminal rules.
- [ ] Sales own-only, Manager team plus own, Executive detail boundary, and
      Super Admin correction behavior have explicit RLS tests.

**Verification:**

- [ ] `bunx supabase db reset`
- [ ] `bun test supabase/tests/tasks.test.ts supabase/tests/super-admin-rls.test.ts`
- [ ] Review grants separately from RLS, including required UPDATE columns.

**Dependencies:** Task 2

**Files likely touched:**

- `supabase/migrations/<generated>_add_task_control_loop_foundation.sql`
- `supabase/tests/tasks.test.ts`
- `supabase/tests/super-admin-rls.test.ts`
- `supabase/seed.sql`

**Estimated scope:** Medium

#### Task 4: Centralize holiday calendar and derived due state

**Description:** Implement the approved holiday ingestion contract, business-day
calculation, and one database-derived due-state interface for Asia/Jakarta.
Saturday, Sunday, holidays, and correction behavior must be tested.

**Acceptance criteria:**

- [ ] One canonical calendar represents holidays, source provenance,
      synchronization state, and corrections.
- [ ] Upcoming, Today, Overdue, and Escalated are derived consistently, with
      escalation beginning only after the approved two-business-day boundary.
- [ ] Calendar-sync failure is visible and follows the approved fallback rather
      than silently using calendar days.

**Verification:**

- [ ] Tests cover Friday-to-Monday, consecutive holidays, cuti bersama,
      year-end, leap day, timezone boundary, and corrected holiday rows.
- [ ] Database and TypeScript consumers return the same due state for the same
      fixtures.

**Dependencies:** Task 3

**Files likely touched:**

- `supabase/migrations/<generated>_add_business_calendar.sql`
- `supabase/tests/business-calendar.test.ts`
- `src/lib/data/business-calendar.ts`
- `src/lib/data/business-calendar.test.ts`

**Estimated scope:** Medium

#### Task 5: Make progress updates atomic and expose one timeline contract

**Description:** Implement the approved transaction/RPC that writes the
progress-domain record, updates Task state, and appends the audit event
atomically. Add a normalized read contract that merges existing sources without
duplicating events.

**Acceptance criteria:**

- [ ] A progress update succeeds or rolls back as one unit, including note,
      next action, next date, workflow status, and audit attribution.
- [ ] Timeline entries are immutable, ordered deterministically, and distinguish
      progress records from audit-only transitions without duplicates.
- [ ] Active Task, Waiting External, Done, Cancelled, and correction flows obey
      the approved validation rules.

**Verification:**

- [ ] Add and run the atomicity test before implementation; verify it fails for
      the intended partial-write reason.
- [ ] Integration tests force a late-step failure and prove no partial rows or
      Task changes remain.
- [ ] RLS tests cover Sales owner, Manager own/team, Executive read-only
      exception detail, and Super Admin correction.
- [ ] Run Supabase database advisors after local implementation.

**Dependencies:** Tasks 3-4

**Files likely touched:**

- `supabase/migrations/<generated>_add_atomic_task_progress.sql`
- `supabase/tests/task-progress.test.ts`
- `src/lib/data/task-progress.ts`
- `src/lib/data/task-progress.test.ts`
- `src/lib/data/activity-feed.ts`

**Estimated scope:** Medium

### Checkpoint A — Database contract

- [ ] Tasks 1-5 acceptance criteria pass on a clean local reset.
- [ ] No browser code relies on a new column or RPC before its local tests pass.
- [ ] No remote Supabase command has run.
- [ ] Human review confirms calendar, backfill, and role decisions.

### Phase 2 — Core Owner Experience

#### Task 6: Migrate domain types and Task adapters to the new contract

**Description:** Update TypeScript domain types and data adapters to represent
workflow status, derived due state, optional Client, category, next action,
timeline, and compatibility state. Keep legacy reads isolated behind the
adapter until cutover.

**Acceptance criteria:**

- [ ] Components receive separate `workflowStatus` and `dueState` fields.
- [ ] Task and progress mutations use the atomic interface; direct multi-write
      progress code is no longer exported for UI use.
- [ ] React Query keys are exact and invalidation covers Task, timeline,
      exceptions, Dashboard, and Reports consumers.

**Verification:**

- [ ] `bun test src/lib/data/tasks.test.ts src/lib/data/task-progress.test.ts`
- [ ] `bunx tsc --noEmit`

**Dependencies:** Task 5

**Files likely touched:**

- `src/lib/domain.ts`
- `src/lib/data/tasks.ts`
- `src/lib/data/tasks.test.ts`
- `src/lib/data/task-progress.ts`

**Estimated scope:** Medium

#### Task 7: Deliver Task creation and owner lifecycle

**Description:** Let Sales and Manager create standalone or related Task
records, edit permitted fields, complete, cancel with reason, reopen according
to the approved rule, and archive independently of workflow state.

**Acceptance criteria:**

- [ ] A Task may omit Client and commercial document but always has an eligible
      owner, category, title, workflow state, and required next-action fields.
- [ ] Cancelled requires the approved reason; archive never changes workflow
      status.
- [ ] Manager can operate personal Task flows exactly as Sales can.

**Verification:**

- [ ] Component/data tests cover standalone, Client-related, Manager-owned,
      Cancelled, reopened, and archived Task cases.
- [ ] Manual local browser check verifies create/edit/archive flows for Sales
      and Manager.

**Dependencies:** Task 6

**Files likely touched:**

- `src/components/tasks/CreateTaskDialog.tsx`
- `src/components/tasks/TaskDetailDrawer.tsx`
- `src/routes/_app.tasks.tsx`
- `src/lib/data/tasks.test.ts`

**Estimated scope:** Medium

#### Task 8: Deliver the unified progress timeline

**Description:** Replace independent browser writes and the separate note
experience with one progress form and one timeline presentation backed by the
atomic contract.

**Acceptance criteria:**

- [ ] An active Task cannot save progress without next action and next date;
      Waiting External also requires its follow-up date.
- [ ] One submission produces one logical timeline entry with actor and
      timestamp, while audit-only changes remain visible without duplication.
- [ ] Historical `activity_log` notes and `follow_up_logs` remain readable.

**Verification:**

- [ ] Component tests cover validation, success, rollback error, and duplicate
      suppression.
- [ ] Manual browser check confirms the same history in Task Detail after
      refresh.

**Dependencies:** Tasks 6-7

**Files likely touched:**

- `src/components/tasks/LogFollowUpDialog.tsx`
- `src/components/tasks/TaskDetailDrawer.tsx`
- `src/lib/data/activity-feed.ts`
- `src/lib/data/activity-feed.test.ts`
- `src/lib/export-activity.ts`

**Estimated scope:** Medium

### Phase 3 — Manager and Executive Control Loop

#### Task 9: Separate Manager My Tasks from Team Exceptions

**Description:** Add role-aware Task queries and UI modes so Manager first sees
personal work, then a focused list of Sales-owned Task records that crossed the
escalation threshold. Ownership remains unchanged.

**Acceptance criteria:**

- [ ] Manager My Tasks contains only Manager-owned Task records and supports all
      owner actions.
- [ ] Team Exceptions contains only escalated Sales-owned active Task records,
      with timeline context and no automatic ownership transfer.
- [ ] Query results use the centralized due-state function and approved company
      scope.

**Verification:**

- [ ] Data-layer tests cover pre-threshold, threshold, holiday, resolved,
      Cancelled, archived, and ownership cases.
- [ ] Browser check verifies the two Manager modes are visually and behaviorally
      distinct.

**Dependencies:** Tasks 4, 6, and 8

**Files likely touched:**

- `src/lib/data/task-exceptions.ts`
- `src/lib/data/task-exceptions.test.ts`
- `src/routes/_app.tasks.tsx`
- `src/components/tasks/TaskDetailDrawer.tsx`

**Estimated scope:** Medium

#### Task 10: Enforce Executive exception detail and aggregate-only reporting

**Description:** Narrow Executive row-level detail to escalated Manager-owned
Task records while preserving company-wide Task metrics through a separate
aggregate-only database interface.

**Acceptance criteria:**

- [ ] Executive can read qualifying Manager exception details and cannot read,
      create, update, archive, or cancel other Task details.
- [ ] Executive aggregate results remain company-wide but reveal no task-level
      rows or reconstructable sensitive detail.
- [ ] Super Admin correction remains supported without owner, performance, or
      escalation membership.

**Verification:**

- [ ] Direct Supabase tests cover allowed detail, denied detail, denied writes,
      aggregate access, and forbidden function execution.
- [ ] Review function ownership, explicit role check, `search_path`, grants,
      RLS interaction, and database-advisor output.
- [ ] Browser check confirms Executive controls are read-only.

**Dependencies:** Tasks 5 and 9

**Files likely touched:**

- `supabase/migrations/<generated>_restrict_task_exception_visibility.sql`
- `supabase/tests/task-exceptions-rls.test.ts`
- `src/lib/data/task-exceptions.ts`
- `src/routes/_app.tasks.tsx`

**Estimated scope:** Medium

### Checkpoint B — Core control loop

- [ ] Sales and Manager complete the owner progress loop end-to-end.
- [ ] Manager sees only real Team Exceptions.
- [ ] Executive detail and aggregate boundaries pass direct database tests.
- [ ] Super Admin correction and immutable history do not regress.

### Phase 4 — Consumer Migration

#### Task 11: Migrate Dashboard and TopBar consumers

**Description:** Replace stored-status assumptions in operational Dashboard
selectors, follow-up widgets, performance tables, notifications, and TopBar
with workflow/due-state contracts.

**Acceptance criteria:**

- [ ] Open/Done counts use workflow status; Today/Overdue/Escalated counts use
      derived due state.
- [ ] Manager and Executive widgets respect their detail/aggregate boundaries.
- [ ] In-app exception indicators do not duplicate resolved or archived Task
      records.

**Verification:**

- [ ] Focused selector/component tests pass for all four roles.
- [ ] Browser check covers Sales, Manager, Executive, and Super Admin dashboards.

**Dependencies:** Tasks 9-10

**Files likely touched:**

- `src/lib/data/dashboard-selectors.ts`
- `src/lib/data/dashboard-selectors.test.ts`
- `src/components/dashboard/TodaysFollowUpList.tsx`
- `src/components/dashboard/ActivityComplianceCard.tsx`
- `src/components/shell/TopBar.tsx`

**Estimated scope:** Medium

#### Task 12: Migrate Reports and performance calculations

**Description:** Update Reports and team-performance calculations so workflow,
due state, ownership, and Executive aggregates remain semantically correct.

**Acceptance criteria:**

- [ ] Open, overdue, escalated, completed, and cancelled metrics use distinct
      definitions.
- [ ] Manager personal Task records are included as Sales work without being
      mixed into Team Exception ownership.
- [ ] Executive reports consume aggregate-only interfaces where row detail is
      not authorized.

**Verification:**

- [ ] Report selector and team data tests pass with mixed-role fixtures.
- [ ] Compare before/after fixtures and explain every intentional KPI change.

**Dependencies:** Tasks 9-11

**Files likely touched:**

- `src/routes/_app.reports.tsx`
- `src/lib/report-selectors.ts`
- `src/lib/report-selectors.test.ts`
- `src/lib/data/team.ts`
- `src/lib/data/team.test.ts`

**Estimated scope:** Medium

#### Task 13: Migrate exports

**Description:** Align CSV, XLSX, and PDF exports with the same authorized
snapshot and workflow/due-state definitions used on screen.

**Acceptance criteria:**

- [ ] Export columns label workflow status and due state separately.
- [ ] Executive exports contain permitted aggregates and no unauthorized Task
      detail.
- [ ] Export totals reconcile exactly with Dashboard/Reports fixtures.

**Verification:**

- [ ] Export tests cover CSV, XLSX, and PDF data preparation.
- [ ] Manual inspection confirms Indonesian labels and no legacy status leakage.

**Dependencies:** Task 12

**Files likely touched:**

- `src/lib/export-csv.ts`
- `src/lib/export-xlsx.ts`
- `src/lib/export-pdf.ts`
- `src/lib/dashboard-export-data.ts`
- `src/lib/dashboard-export-data.test.ts`

**Estimated scope:** Medium

#### Task 14: Migrate Pipeline, Client Detail, and commercial follow-up paths

**Description:** Move related Task creation, next-follow-up, and Task display
paths away from legacy stored status and required Client assumptions.

**Acceptance criteria:**

- [ ] Pipeline and commercial flows create Task records through the new adapter
      without writing legacy due status.
- [ ] Client Detail shows only Client-related Task records while standalone Task
      records remain valid elsewhere.
- [ ] Commercial follow-up uses the atomic progress/task contract where a Task
      is involved.

**Verification:**

- [ ] Focused tests cover standalone, Client-related, and commercial-related
      Task records.
- [ ] Browser check confirms no RFQ workflow is reintroduced.

**Dependencies:** Tasks 7-8

**Files likely touched:**

- `src/routes/_app.pipeline.tsx`
- `src/routes/_app.clients.$clientId.tsx`
- `src/components/pipeline/PipelineCardDrawer.tsx`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx`
- `src/components/commercial/CommercialDetailPage.tsx`

**Estimated scope:** Medium

#### Task 15: Migrate ownership transfer and account lifecycle consumers

**Description:** Update active/open Task predicates and owner-transfer checks so
the new workflow states, Manager ownership, Cancelled records, and archive
semantics do not block or misroute account lifecycle operations.

**Acceptance criteria:**

- [ ] Transfer includes only records defined as active by the approved workflow
      contract.
- [ ] Manager-owned Task records remain valid; Super Admin never becomes owner.
- [ ] Deactivation and deletion preserve timeline attribution and reject unsafe
      references.

**Verification:**

- [ ] `bun test supabase/tests/account-lifecycle.test.ts supabase/tests/business-owner-invariant.test.ts`
- [ ] Review all `.neq("status", "Done")` and equivalent predicates; none may
      remain without an explicit compatibility reason.

**Dependencies:** Tasks 3, 6, and 12

**Files likely touched:**

- `supabase/migrations/<generated>_update_task_account_lifecycle.sql`
- `supabase/tests/account-lifecycle.test.ts`
- `supabase/tests/business-owner-invariant.test.ts`
- `src/lib/data/team.ts`
- `src/lib/data/team.test.ts`

**Estimated scope:** Medium

### Checkpoint C — Consumer parity

- [ ] No active UI, selector, report, export, ownership, or test consumer treats
      Today/Upcoming/Overdue as workflow status.
- [ ] Dashboard, Reports, and exports reconcile for every role.
- [ ] Pipeline and Client Detail support the new contract without restoring RFQ.

### Phase 5 — Cutover, Verification, and Release

#### Task 16: Reconcile existing data and retire the legacy status contract

**Description:** Run the approved deterministic migration report, quarantine or
flag ambiguous records, compare all consumer totals, then remove the legacy
status write/read path only after parity is proven.

**Acceptance criteria:**

- [ ] Every existing Task is classified as deterministically migrated or
      explicitly requiring review; no business field is fabricated.
- [ ] Pre/post counts, owners, relations, archive flags, and historical timeline
      references reconcile exactly.
- [ ] Legacy status enum/column and compatibility code are retired only after
      zero active consumers remain.

**Verification:**

- [ ] Save one machine-readable reconciliation report with zero unexplained
      mismatches.
- [ ] Clean local reset plus the full relevant Supabase and data-layer suites
      pass after cutover.

**Dependencies:** Tasks 11-15

**Files likely touched:**

- `supabase/migrations/<generated>_backfill_task_control_loop.sql`
- `supabase/migrations/<generated>_retire_legacy_task_status.sql`
- `supabase/tests/task-migration.test.ts`
- `scripts/task-migration-audit.ts`
- `docs/reports/sales-task-control-loop-migration.md`

**Estimated scope:** Medium

#### Task 17: Run complete local verification and reconcile documentation

**Description:** Prove the full role matrix and user flows against a clean local
Supabase stack, then update the spec, plan, handoff, and operational runbook to
the verified as-built state.

**Acceptance criteria:**

- [ ] Clean reset, focused tests, full tests, typecheck, lint, build, and
      database advisors pass or disclose unrelated baseline failures precisely.
- [ ] Browser UAT covers Sales, Manager My Tasks, Team Exceptions, Executive
      Exceptions, Super Admin correction, holidays, rollback, and archive.
- [ ] Documentation distinguishes local verification from remote deployment.

**Verification:**

- [ ] `bunx supabase db reset`
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] Real-browser console/network/DOM checks with captured evidence

**Dependencies:** Task 16

**Files likely touched:**

- `docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md`
- `docs/superpowers/plans/2026-07-27-sales-task-control-loop-implementation.md`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`
- a scoped verification report

**Estimated scope:** Medium

#### Task 18: Release through an explicit remote gate

**Description:** Prepare, but do not execute, remote migration and deployment
until the owner approves the exact Supabase project, migration set, Git target,
and deployment action.

**Acceptance criteria:**

- [ ] Dry-run output, migration list, backup/recovery approach, rollback plan,
      and post-deploy smoke queries are reviewed.
- [ ] Remote mutation is performed only after exact-target approval.
- [ ] Git push, Supabase migration, deployment, and authenticated browser
      verification are reported as separate results.

**Verification:**

- [ ] Compare local and linked migration histories before and after the approved
      release.
- [ ] Run post-deploy role/RLS and calendar-boundary smoke checks.

**Dependencies:** Task 17 and new explicit owner approval

**Files likely touched:** None unless release documentation needs reconciliation

**Estimated scope:** Small

## Parallelization Rules

- Tasks 4 and 5 may be developed in parallel only after Task 3 fixes their
  shared schema contracts.
- Tasks 11, 12, 14, and 15 may be assigned to separate sessions after Tasks
  6-10 stabilize the public interfaces.
- Task 13 depends on Task 12 because exports must consume the finalized report
  semantics.
- Tasks 3, 5, 10, 16, and 18 are sequential database/security gates and must not
  run concurrently.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Legacy status cutover corrupts KPI or lists | High | Dual-read compatibility, consumer inventory, fixture comparison, and late enum retirement |
| Progress partially persists | High | One tested transaction/RPC with forced-failure rollback coverage |
| Executive detail leaks through direct API | High | Direct RLS tests plus aggregate-only contract with explicit function hardening |
| Holiday sync is missing or stale | High | Canonical database calendar, provenance/health state, visible fallback, boundary tests |
| Existing data receives invented business values | High | Deterministic-only mapping and explicit review state |
| Manager work is omitted from Sales metrics | Medium | Treat Manager-owned Task as personal Sales work while keeping exception ownership separate |
| Waiting External suppresses escalation | Medium | Same required next-date and centralized due-state calculation as other active states |
| Timeline duplicates old and new events | Medium | Stable source IDs, event-kind normalization, and duplicate-suppression tests |
| Super Admin becomes business owner | High | Owner eligibility constraint and four-role RLS regression suite |
| Scope expands into RFQ or external messaging | Medium | Explicit non-goals and focused consumer review |

## Definition of Done

The feature is complete only when:

- every task in `tasks/sales-task-control-loop-todo.md` is checked;
- all per-task acceptance criteria and verification steps pass;
- local runtime behavior is verified for all four roles;
- no relevant consumer of the legacy status model remains;
- schema, RLS, grants, privileged functions, and migration reconciliation are
  reviewed;
- documentation reflects verified behavior rather than intended behavior;
- remote state is reported separately and is changed only with exact approval.
