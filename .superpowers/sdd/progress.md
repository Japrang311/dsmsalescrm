# Subagent-Driven Development Progress

## Plan 1: `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md` (Phase 12) — COMPLETE 2026-07-19

Started: 2026-07-18
Environment: no Git repository; local Supabase only; review evidence uses current files and task reports.

- Task 1: complete (no Git commits; independent review approved after Fix wave 1)
- Task 2: complete (no Git commits; independent review approved after Fix wave 1)
- Task 3: complete (no Git commits; independent review approved after Fix wave 1)
- Task 4: complete (no Git commits; independent review approved after Fix wave 1)
- Task 5: complete (no Git commits; independent review approved after Fix wave 3 — corrected RPC grants from service_role-only to authenticated with internal role gate, matching Task 4's ownership-transfer predicate exactly)
- Task 6: complete (no Git commits; independent review approved with zero findings on first review)
- Task 7: complete (no Git commits; independent review APPROVED. Implementer report was DONE_WITH_CONCERNS with a real test regression the controller caught via independent re-verification — see "Minor findings ledger" below — fixed and re-verified 193/193 before review. Phase 12 is now considered complete.)

Minor findings ledger:

- Task 6 open product decision: RESOLVED by user 2026-07-19 — Super Admin gets the Executive dashboard view. Applied directly by controller (not a subagent; mechanical additive `role === "super_admin"` OR-conditions in `src/routes/_app.dashboard.tsx`, 5 spots) and verified: eslint clean, `bunx tsc --noEmit` shows only the 2 known pre-existing errors, `bun run build` succeeds.
- Task 6 flagged follow-up (not a defect): `src/lib/data/team.test.ts` still uses an unrestored `mock.module("@/lib/supabase", ...)` and only "gets away with it" by being the alphabetically last test file needing the real client — fragile against future test-file additions.
- Task 6 must add explicit owner filters for Sales list queries where needed so owner_id indexes are planner-usable.
- Task 7 caught (fixed): implementer's own final step (restoring the persistent local dev Super Admin account) silently broke `supabase/tests/account-lifecycle.test.ts`'s hardcoded `toBe(1)` active-Super-Admin-count assertion. Report claimed 193/193 but that was measured before the restore step. Controller independently re-ran tests, caught 192/1, traced root cause, dispatched a scoped fix (baseline-relative assertion), re-verified 193/193 live before sending to review. Lesson: always independently re-run the full gate on the FINAL repo state, not trust a report's earlier-timestamped test run.
- Task 7 residual, not a blocker: a `/login` sign-in mix-up (Manager credentials resolving to a Sales session) occurred once during browser automation; implementer could not reproduce reliably or find a code-level cause; independent reviewer re-read `role-context.tsx`'s real-session path and the login route and found no plausible app-level bug — most likely a browser-automation autofill artifact. Worth a quick manual `/login` check by a human in a future session, not urgent.
- Task 7 hosted-rollout documentation must require an owner-eligibility preflight before applying `20260718191135_enforce_active_business_owner_invariant.sql`; local reset currently has zero invalid owners.
- Task 7 may harden the concurrency harness by replacing the current 150 ms timing boundary with deterministic lock synchronization; this is non-blocking because both real races are already covered and passing locally.

## Plan 2: `docs/superpowers/plans/2026-07-18-commercial-documents-numbering-implementation.md` (Phase 11) — COMPLETE 2026-07-19

Environment: no Git repository; local Supabase only; review evidence uses current files and task reports.

- Task 1: complete (no Git commits; independent review APPROVED with one Minor finding — controller fixed directly: wrapped 24 unwrapped `public.current_user_role()` calls in `supabase/migrations/20260719014036_normalize_commercial_documents.sql` as `(select public.current_user_role())` to match the Phase 12 RLS performance-pattern convention; re-verified `db reset` + schema test 75/75 + full suite 268/268 after the fix.)
- Task 2: complete (legacy conversion, FK repointing, collision quarantine, and preserved private evidence)
- Task 3: complete (atomic allocation, rollback, revisions, and HARIFF modes)
- Task 4: complete (normalized fixtures/importer, reconciliation, transactional import, and counter seeding)
- Task 5: complete (nested document/Sales Order adapters and transactional RPCs)
- Task 6: complete (RFQ, Quotation, Sales Order, Prototype Paid/FOC, and HARIFF form contracts)
- Task 7: complete (grouped views, line items, revision history, current-only forecast, and FOC money omission)
- Task 8: complete (local reset, 290/290 tests, typecheck, lint, build, browser matrix, final cleanup, and five-axis review; see `p11-task-8-report.md`)

Minor findings ledger (Phase 11):

- Fixed: normalized replacement tables had overly broad table-level `UPDATE`
  grants, normalized header policies omitted the active-owner invariant, and
  `revenue_recognized` followed the archived legacy table OID. Migration
  `20260719041351_harden_normalized_document_permissions.sql` closes all three.
- Non-blocking: `supabase db lint --local` cannot statically resolve two
  function-local temporary tables. Runtime migration/import/rollback coverage
  passes; see `p11-task-8-report.md`.
