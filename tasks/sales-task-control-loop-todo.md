# Task List: Sales Task Control Loop

Plan:
`docs/superpowers/plans/2026-07-27-sales-task-control-loop-implementation.md`

Product direction: `docs/ideas/sales-task-control-loop.md`

> **Status:** Proposed. Checking a task means its acceptance criteria and
> verification in the implementation plan have passed. This checklist does not
> authorize remote Supabase changes or deployment.

## Phase 0 — Technical Contract Gate

- [x] Task 1: Approve the technical specification — approved by Product
      Owner 2026-07-27; see
      `docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md`

### Checkpoint A0

- [x] Product owner has approved schema, timeline, calendar, escalation,
      backfill, RLS, and notification decisions — all seven Planning
      Boundary decisions resolved 2026-07-27 (see spec §9)
- [x] No implementation started before approval — confirmed true as of
      approval; Task 2/implementation-plan Task 2 requires new separate
      authorization before starting

## Phase 1 — Compatibility and Database Foundation

- [x] Task 2: Lock legacy behavior with characterization tests — done
      2026-07-27; see
      `.superpowers/sdd/sales-task-control-loop-task-2-report.md`. Also
      found and fixed a pre-existing `.env.local` misconfiguration
      (`VITE_SUPABASE_URL` pointed at a remote Supabase project instead of
      local) that had been silently breaking every `src/lib/data/*.test.ts`
      test; full suite now passes (367/367).
- [x] Task 3: Add a backward-compatible Task schema and RLS contract —
      done 2026-07-27; see
      `.superpowers/sdd/sales-task-control-loop-task-3-report.md`. The
      next-action-required CHECK constraint (spec §2.4) was deliberately
      deferred to Task 5 — Product Owner confirmed adding it now would
      break the still-live `createTask()` flow until Task 6 ships.
- [x] Task 4: Centralize holiday calendar and derived due state — done
      2026-07-27; see
      `.superpowers/sdd/sales-task-control-loop-task-4-report.md`. Real
      holiday data is intentionally not seeded yet (spec §5.4: manual
      admin entry, no Settings UI yet) — `calendar_incomplete` correctly
      reads true until that happens.
- [x] Task 5: Make progress updates atomic and expose one timeline
      contract — done 2026-07-27; see
      `.superpowers/sdd/sales-task-control-loop-task-5-report.md`. The
      next-action constraint deferred from Task 3 is now live, gated by
      a new `first_progress_at` column so it never blocks the still-live
      legacy createTask() flow.

### Checkpoint A — Database contract

- [x] Clean local database reset succeeds — verified repeatedly across
      Tasks 2-5, most recently after Task 5's migrations
- [x] Focused schema, RLS, calendar, atomicity, and timeline tests pass —
      429 pass, 0 fail across the full local suite (56 files)
- [x] No remote Supabase command has run — confirmed throughout

## Phase 2 — Core Owner Experience

- [x] Task 6: Migrate domain types and Task adapters — done 2026-07-27;
      see `.superpowers/sdd/sales-task-control-loop-task-6-report.md`.
      `clientId` stays required for now (widening it broke tsc outside
      Task 6's scope) — Task 7 owns making Client truly optional. Found
      and fixed a real bun:test bug: two files sharing the basename
      `task-progress.test.ts` corrupted each other's state under full-suite
      runs; renamed one to `task-progress-adapter.test.ts`.
- [x] Task 7: Deliver Task creation and owner lifecycle — done
      2026-07-27; see
      `.superpowers/sdd/sales-task-control-loop-task-7-report.md`. Manual
      browser verification (Sales + Manager, both real seeded accounts)
      found and fixed 3 real bugs unit tests missed: an empty-string
      client_id crashing activity_log inserts, a missing `task_progress`
      kind hiding all new history entries, and stale local form state
      after a save.
- [ ] Task 8: Deliver the unified progress timeline

### Checkpoint B1

- [x] Sales completes the create-progress-next-action loop — verified in
      browser 2026-07-27 (create without Client, In Progress → Cancelled
      with reason → reopened with fresh next action → Done)
- [x] Manager completes the same loop on Manager-owned Task — verified in
      browser 2026-07-27 (create, progress to Waiting External with next
      action/date)
- [x] Cancelled and Archived remain distinct — verified in browser
      2026-07-27 (archiving a Done Task did not change workflowStatus)

## Phase 3 — Manager and Executive Control Loop

- [ ] Task 9: Separate Manager My Tasks from Team Exceptions
- [ ] Task 10: Enforce Executive exception detail and aggregate-only reporting

### Checkpoint B — Core control loop

- [ ] Manager sees only qualifying Sales exceptions
- [ ] Executive sees only qualifying Manager exception details
- [ ] Executive company aggregates remain available without row-detail leakage
- [ ] Super Admin correction remains supported without ownership

## Phase 4 — Consumer Migration

- [ ] Task 11: Migrate Dashboard and TopBar consumers
- [ ] Task 12: Migrate Reports and performance calculations
- [ ] Task 13: Migrate exports
- [ ] Task 14: Migrate Pipeline, Client Detail, and commercial follow-up paths
- [ ] Task 15: Migrate ownership transfer and account lifecycle consumers

### Checkpoint C — Consumer parity

- [ ] No active consumer treats Today/Upcoming/Overdue as workflow status
- [ ] Dashboard, Reports, and exports reconcile for every role
- [ ] Pipeline and Client Detail work without restoring RFQ

## Phase 5 — Cutover, Verification, and Release

- [ ] Task 16: Reconcile existing data and retire the legacy status contract
- [ ] Task 17: Run complete local verification and reconcile documentation
- [ ] Task 18: Release through an explicit remote gate

### Checkpoint D — Complete

- [ ] Existing Task migration has zero unexplained mismatches
- [ ] Full tests, typecheck, lint, build, advisors, and browser UAT pass
- [ ] Documentation reflects verified as-built behavior
- [ ] Git, Supabase remote, deployment, and browser verification are reported
      separately

