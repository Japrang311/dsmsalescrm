# Implementation Plan: Supabase Backend & Data Layer

Spec: `specs/backend-data-layer.md`

## Overview

Replace the mock data layer (`src/lib/mock/`) with a real Supabase backend, one business domain at a time (Clients → Tasks → Commercial Items → Sales Orders/Revenue → Targets), so the app is always working end-to-end even mid-migration. Everything happens against a **local** Supabase stack (via Docker, already installed) until an explicit checkpoint where you provide a real Supabase project to link to. Nothing touches a real/production project before that checkpoint.

**Plain-language note on the shape of this plan:** each "vertical slice" (e.g. Clients) does three things in order: (1) create the database table + access rules, (2) write the code that talks to that table, (3) point the existing screens at that code instead of the fake data. We verify it works before moving to the next domain.

## Architecture Decisions

- **Local-first, remote-later**: all schema/RLS work happens against `supabase start`'s local Docker stack. Linking a real project is a separate, explicitly-confirmed checkpoint (Phase 6) — this avoids any risk of touching production by accident.
- **Vertical slices by domain, not horizontal layers**: each domain (Clients, Tasks, Commercial Items, Sales Orders, Targets) gets its schema + data layer + UI wiring done together, so the app never sits in a half-broken state for long.
- **RLS is the real security boundary, not app code** — every table's access rules live in SQL migrations, enforced by Postgres itself, so a bug in a React component can't leak another sales rep's data.
- **Types stay shared during migration**: `src/lib/data/*` returns the same TypeScript shapes `src/lib/mock/*` did, so UI components need minimal changes when we swap the import.

## Task List

### Phase 0: Local Environment Setup

- [x] Task 1: `supabase init` + Supabase JS client scaffold
- [x] Task 2: Local stack smoke test

### Checkpoint 0: Local Supabase running

- [x] `bunx supabase start` succeeds, Studio reachable at local URL
- [x] App still builds and runs unchanged (`bun run dev`) — nothing broken yet
- [x] You've seen the local Studio dashboard at least once, so it's not a mystery later

### Phase 1: Identity Foundation (profiles, roles, team)

- [x] Task 3: `profiles` + role migration
- [x] Task 4: Local RLS smoke test for `profiles`

### Checkpoint 1: Roles exist and are enforced locally

- [x] `bun test` passes for the profiles RLS test
- [x] You understand, in plain terms, what a "role" row looks like in the DB (I'll walk through it)

### Phase 2: Clients Vertical Slice

- [x] Task 5: `clients` table migration + RLS
- [x] Task 6: `src/lib/data/clients.ts`
- [x] Task 7: Wire Client List + Client Detail to real data

### Checkpoint 2: Clients feature fully live on local Supabase

- [x] Client List and Client Detail pages render from local Postgres, not `src/lib/mock/data.ts`
- [x] Manual check: switching role (sales/manager/executive) in the UI shows the right scoped clients
- [x] `bun test` passes (clients RLS test)

### Phase 3: Tasks / Follow-Ups Vertical Slice

- [x] Task 8: `tasks` table migration + RLS
- [x] Task 9: `src/lib/data/tasks.ts` + wire My Tasks / dashboard widgets

### Checkpoint 3: Tasks feature fully live

- [x] Task list and dashboard "open/overdue" widgets read from Postgres
- [x] `bun test` passes (tasks RLS test)

### Phase 4: Commercial Items Vertical Slice

- [x] Task 10: `commercial_items` table migration + RLS
- [x] Task 11: `src/lib/data/commercial-items.ts` + wire Commercial Pipeline routes

### Checkpoint 4: Commercial Pipeline fully live

- [x] RFQ / Quotation / Prototype pipeline views read from Postgres
- [x] `bun test` passes (commercial_items RLS test)

### Phase 5: Sales Orders & Revenue Vertical Slice

- [x] Task 12: `sales_orders` table migration + RLS + revenue-inclusion view
- [x] Task 13: `src/lib/data/sales-orders.ts` + wire Revenue/Dashboard reports
- [x] Task 14: Revenue classification unit tests
- [x] Task 14b: Real `activity_log` table _(added scope, not in original plan)_

### Checkpoint 5: Revenue numbers are real and correct

- [x] Dashboard revenue/PPN/Non-PPN/target numbers come from Postgres
- [x] `bun test` passes: Prototype FOC rows are provably excluded from revenue totals
- [x] Manual check: seed one Prototype FOC row and one Prototype Paid row locally, confirm only the Paid one shows up in revenue

### Phase 6: Real Project Checkpoint _(human-gated — I do not do this without you)_

- [x] Task 15: You create/select the Supabase project
- [x] Task 16: Link and push

### Checkpoint 6: Real project confirmed working, still empty of real data

- [x] `supabase db push` succeeds against the real project
- [x] Studio on the real project shows the same tables/policies as local
- [x] No real client data has been entered yet — this is infrastructure-only

### Phase 7: Auth Bootstrap (manual, one-time)

- [x] Task 17: Document + verify the manual Manager signup procedure
- [x] Task 17a: Real login screen _(added — not in original plan, discovered as a gap while starting Task 17)_
- [x] Task 18: Targets table + wire remaining dashboards

### Checkpoint 7: You can log in as the first real Manager account

- [x] You (the project owner) have a working Supabase Auth login against the real project
- [x] That account is correctly scoped as `manager` in the app (sees team-wide data)
- [x] Targets table exists and dashboard target numbers are no longer hardcoded

### Phase 8: Google Sheets Import

> Historical status: Tasks 19–21 completed the legacy one-row-per-Sheet-row importer. ADR-001 supersedes that target schema. The legacy code/tests remain evidence, but the real import is blocked until Phase 11 Task 33 updates them for normalized headers/items and counter seeding.

- [x] Task 19: Get real spreadsheet column mapping from you
- [x] Task 20: Build sanitized test fixtures from that mapping (pending your confirmation the columns match the real sheet)
- [x] Task 21: Import script + historical classification logic + golden-file tests

### Checkpoint 8: Import script proven correct on fixtures

- [x] `bun test` passes for import classification (PPN/Non-PPN, Paid/FOC, ambiguous-flagging)
- [x] No test or CI step touches the live spreadsheet or needs credentials
- [x] Running a real import remains a separate manual command you run only when ready — not automated by this plan

### Phase 9: Cleanup

- [x] Task 22: Remove remaining `src/lib/mock/*` production usage; move deterministic fixtures to `tests/fixtures/` (completed 2026-07-19; shared domain types/rules/time moved to canonical non-mock modules, Activity and all Dashboard exports use backend snapshots, and `src/lib/mock/` is deleted)
      — **scope discovery (2026-07-18):** an audit found 32 files still importing from `src/lib/mock/*`. ~15 are types/UI-constants/the pinned "today" clock, fine as-is. 6 are trivial leftover-reads with a real equivalent already available. The remaining 13 depend on six genuinely unmigrated features (status audit UI, commercial-item stage changes, task overrides/creation/archiving, follow-up logging, Sales Order tax correction, and Settings' Team/Org/Preferences tabs) that Tasks 1–21 never built real backend for. That work is broken out into **Phase 10** below rather than folded into this "final sweep" task. Task 22 itself now covers only the safe swaps + fixture relocation once Phase 10 lands (or is explicitly descoped).

### Checkpoint 9: Complete

- [x] All Success Criteria in `specs/backend-data-layer.md` are met locally
- [x] No production code imports from `src/lib/mock/*` or `tests/fixtures/`
- [x] Full `bun test` suite passes (296/296); `bun run build` succeeds
- [x] Ready for review end-to-end; Sales, Manager, and Executive browser UAT completed 2026-07-19

### Phase 10: Remaining Write-Path Migration _(added — not in original plan, discovered while auditing Task 22)_

Historical discovery: six features originally ran on the in-memory mock
stores because Tasks 1–21 covered listing/reading but not every write path.
Tasks 23–30 migrated or explicitly decided each path; Task 22 later deleted
the compatibility layer. See `tasks/todo.md` for the detailed evidence.

- [x] Task 23: Client status audit trail → read from real `activity_log` (no schema change — `client_status_change` events already exist; also fixed a silently-discarded status-change note bug found along the way)
- [x] Task 24: Commercial item create + stage-change write paths → real Supabase + `activity_log` (also cleared the last dead status-audit functions deferred from Task 23, and wired the real commercial-item events into the Activity Log feed)
- [x] Task 25: Task create + status-change + archiving write paths → real Supabase + `activity_log` (added `tasks.archived` column via migration; also wired real task events into the Activity Log feed and removed the now-meaningless "session override" UI from the task detail drawer)
- [x] Task 26: Sales Order tax-classification correction (PRD §15) → real Supabase + `activity_log` (also wired real tax-change events into the Activity Log feed)
- [x] Task 27: Follow-up logging → new `follow_up_logs` table, matching the mock's shape (decided: separate table, not columns on `tasks`; also wired the Client Detail page's Follow-up Timeline and the Activity Log feed to the real data — kept the `FOLLOW_UP_LOGS` historical seed narrative as-is, see todo.md scope note)
- [x] Task 28: Settings — Org settings (company name, fiscal year, PPN rate, thresholds) → new small singleton table (removed the now-confusing "Reset semua ke default" button once org went real, see todo.md scope note)
- [x] Task 29: Settings — Team roster CRUD → real Supabase Edge Function (historical Manager-triggered implementation). **Superseded target:** ADR-002 moves all Team & Role mutations to Super Admin, replaces normal deletion with deactivate/reactivate, and adds ownership-transfer/last-admin protections in Phase 12. Not deployed to the real project.
- [x] Task 30: Settings — Preferences → confirmed with you 2026-07-18: keep local/per-device permanently; Task 22 later extracted it to `src/lib/preferences-store.ts` and removed all mock business-state dependencies

### Checkpoint 10: Mock store fully replaced (or explicitly, permanently kept for a documented reason)

- [x] Every former session/settings-store business path is backed by Supabase; per-device preferences remain local by decision but now live in `src/lib/preferences-store.ts`
- [x] Dead target/session compatibility slices were deleted with `src/lib/mock/`
- [x] Task 22 acceptance criteria are fully met: canonical shared types/rules/time are non-mock, Activity uses only persisted rows, and CSV/XLSX/PDF exports consume the same backend snapshot as the Dashboard

### Phase 11: Commercial Documents, Sheet Alignment, and Atomic Numbering _(accepted 2026-07-18)_

Source of truth: `docs/decisions/ADR-001-normalized-commercial-documents-and-numbering.md`, `docs/superpowers/specs/2026-07-18-commercial-product-fields-and-sheet-alignment-design.md`, and the task-level plan `docs/superpowers/plans/2026-07-18-commercial-documents-numbering-implementation.md`.

- [x] Task 31: Synchronize PRD, specs, ADR, import mapping, agent handoff, and task trackers
- [x] Task 32: Create normalized local schema (`commercial_documents`, `commercial_document_items`, Sales Order headers/items) and migrate legacy FK relationships without deleting evidence
- [x] Task 33: Update sanitized fixtures and Sheet importer for Quotation + normalized SO headers/items; reconcile counts/totals; seed yearly counters from imported maxima
- [x] Task 34: Implement atomic QUO/SO/NP/PROTY allocation, Quotation `_REV.n`, current-revision forecast, and HARIFF automatic/backdate modes
- [x] Task 35: Update RFQ/Quotation/SO forms and grouped list/detail UI for Product, optional Description, Qty, UOM, Date, No PO, calculated totals, and weighted stages
- [x] Task 36: Run local migration, concurrency/RLS/revenue tests, real-browser UAT, exact QA cleanup, and documentation-as-built reconciliation (locally verified 2026-07-19; see `.superpowers/sdd/p11-task-8-report.md` and the full-tab closeout in `.superpowers/sdd/p11-import-closeout-report.md`)

### Checkpoint 11: Normalized commercial workflow verified locally

- [x] One form creates one header and all line items atomically
- [x] QUO/SO/NP/PROTY next numbers follow reconciled imported maxima and remain unique under concurrent submissions
- [x] Only the latest Quotation revision enters forecast
- [x] Revenue equals paid item totals for the form Date; administrative SO-number changes do not change revenue
- [x] Prototype FOC money stays `NULL`; HARIFF backdate is audited and consumes no counter
- [x] Task/follow-up/activity history points to document headers and legacy evidence remains read-only/non-exposed
- [x] Lists/details are grouped and browser-verified against local Supabase
- [x] No remote migration has been run without a separate target-project approval
- [x] All five prepared source tabs were processed locally; 549 accepted headers / 1,005 items reconcile exactly, while 127 ambiguous rows remain quarantined in 55 pending manual-review entries

### Phase 12: Super Admin, Team & Role, and Account Lifecycle _(accepted 2026-07-18; execute before Phase 11 schema)_

Source of truth: `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`, `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md`, and `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md`.

- [x] Task 37: Synchronize PRD, backend/auth specs, ADR, agent handoff, and task trackers
- [x] Task 38: Add explicit `super_admin`, active/inactive profile state, fail-closed role resolution, and four-role RLS foundation locally
- [x] Task 39: Extend append-only Activity Log and protected team-management server actions for role/status/transfer/delete lifecycle
- [x] Task 40: Update session/auth behavior, Team & Role Settings UX, role types, owner/target exclusions, and Manager/Executive read-only views
- [x] Task 41: Run full local RLS/server/UI/browser verification, bootstrap rehearsal, QA cleanup, and as-built documentation reconciliation (2026-07-19; see `.superpowers/sdd/task-7-report.md`)

### Checkpoint 12: Super Admin lifecycle verified locally

- [x] Only active Super Admin can mutate Team & Role; direct Manager calls return 403
- [x] Inactive users are denied by RLS with an old token (verified: a pre-deactivation JWT reused after deactivation returns zero rows on `clients` and on the user's own `profiles` row); browser-driven sign-out/unavailable-message path was not independently re-driven this session — see report for what evidence exists
- [x] Last-active and current-Super-Admin protections are enforced server-side (self-deactivate/self-delete/self-role-change all return 409; `LAST_ACTIVE_SUPER_ADMIN` guard confirmed present via code inspection — see report for why it is unreachable via a single-actor request and only guards a race-condition edge case)
- [x] Ownership transfer is atomic and targets only active Sales/Sales Manager
- [x] Permanent deletion succeeds only for a reference-free account; deactivation preserves all history
- [x] Super Admin can perform supported company-wide business edits without becoming the owner
- [x] Activity Log records every admin action and remains immutable for every role
- [x] No remote mutation has run without a separate approval naming the exact target

## Risks and Mitigations

| Risk                                                               | Impact | Mitigation                                                                                                                              |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| RLS policy misconfigured, one role sees another's data             | High   | Every table's RLS gets an explicit `bun:test` before any UI wires into it (never skip the "local RLS smoke test" tasks)                 |
| Real Google Sheet columns don't match assumed mock shape           | Medium | Task 19 gets the real mapping from you _before_ fixtures/import logic are built — no guessing                                           |
| Solo/non-programmer unfamiliarity with SQL/migrations slows review | Medium | Every migration task includes a plain-language explanation of what the SQL does before I write it, not just after                       |
| Accidentally touching a real Supabase project during local dev     | High   | No `supabase link` or remote push exists in any task before Phase 6, which is explicitly human-gated                                    |
| Revenue calculation bug silently misclassifies FOC as revenue      | High   | Task 14's unit tests are a Success Criterion, not optional — checkpoint 5 requires a manual seeded-data check on top of automated tests |
| Migration mid-flight leaves the app half-broken for a while        | Medium | Vertical slicing — each domain's UI is only switched over after its own data layer is verified working locally                          |
| Concurrent creates allocate duplicate official numbers             | High   | PostgreSQL transaction + locked per-series/year counter; concurrency tests are mandatory before UI enablement                           |
| Normalization loses task/activity/history relationships            | High   | UUID mapping table, pre/post FK reconciliation, preserved private legacy tables, and UAT before any deletion                            |
| Quotation revisions double-count forecast                          | High   | One-current-revision constraint plus tests proving superseded versions are excluded                                                     |
| Inactive token retains database access                             | High   | `current_user_role()` and every exposed-table policy require an active profile; test with a pre-deactivation token                      |
| Team loses all Super Admin access                                  | High   | Server-side last-active/current-account protections plus bootstrap rehearsal with disposable local users                                |

## Open Questions / Gates

- The live Sheet headers and observed 2026 maxima have been inspected, but Task 33 must recalculate maxima at actual import time because the Sheet can change.
- Local implementation is authorized by this plan; any linked/remote migration remains a separate explicit approval with the exact Supabase target confirmed first.
- Phase 12's role/status/RLS foundation should land before Phase 11 creates new commercial tables, so those tables receive four-role policies from their first local migration.
