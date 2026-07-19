# Phase 11 Task 8 Report: Local Verification and Review

Date: 2026-07-19  
Environment: local Supabase only; no remote link, push, migration, or data
mutation was performed. Git is currently present, but the worktree contains
extensive pre-existing changes, so no commit was created.

## Verdict

[Pasti] Phase 11 is locally verified complete. The normalized commercial
workflow, importer, atomic numbering, revision behavior, forms, grouped views,
RLS boundaries, and revenue/FOC rules all passed automated and browser
verification.

Remote rollout is not approved or attempted. It remains a separate change that
requires the user to identify the exact Supabase target and approve the reviewed
commands.

The later full-tab import closeout, including corrected whole-document
quarantine and final source-to-database totals, is recorded in
`.superpowers/sdd/p11-import-closeout-report.md`.

## As-built migrations

- `20260719014036_normalize_commercial_documents.sql`
- `20260719024024_migrate_commercial_document_data.sql`
- `20260719033236_add_atomic_document_numbering.sql`
- `20260719034313_add_normalized_sheet_import.sql`
- `20260719041351_harden_normalized_document_permissions.sql`

The final hardening migration removes table-wide browser `UPDATE` grants,
restores the active-business-owner update predicate, and recreates
`revenue_recognized` against the normalized Sales Order header instead of the
archived legacy-table OID.

## Automated evidence

- `supabase db reset`: PASS through all migrations and seed.
- `bun run test`: **290 pass, 0 fail, 1109 assertions across 38 files**.
- Focused normalized schema contract: **75 pass, 0 fail**.
- `bunx tsc --noEmit`: PASS.
- `bun run lint`: PASS with 0 errors and 12 existing warnings.
- `bun run build`: PASS for client, SSR, and Nitro output.
- `supabase db advisors --local`: PASS, no issues found.

The full suite covers schema, data conversion, FK history, FOC `NULL` money,
revenue view behavior, four-role RLS, active-owner enforcement, 20-way
concurrent number allocation, rollback, revisions, HARIFF modes, importer
reconciliation, adapters, forms, grouping, and forecast weights.

## Browser UAT evidence

Verified against `http://127.0.0.1:8080` with local Supabase:

- grouped Quotation list/detail, item table, totals, forecast, and revision
  history;
- created `DSM-26QUO-0001`, then `DSM-26QUO-0001_REV.1`; only the current
  revision exposed `Buat Revisi`;
- created PPN SO `DSM-26SO001`, Non-PPN SO `DSM-26NP001`, Prototype FOC
  `DSM-26PROTY001`, and Prototype Paid `DSM-26PROTY002`;
- created HARIFF backdate `SO-HARIFF-UAT-20260719-01`, preserving the manual
  number and reason without consuming an automatic counter;
- created HARIFF automatic SO `DSM-26SO002`;
- created RFQ `RFQ-UAT-PH11-20260719` and a Prototype Request;
- confirmed server success toasts and inspected representative persisted
  header/item detail pages.

The plan's `18 Jul 2026` was a fixed example. Browser UAT correctly used the
actual session date, `19 Jul 2026`.

## Cleanup proof

After UAT and the full test run, a final `supabase db reset` restored the exact
seed baseline:

- captured Phase 11 QA commercial rows: 0;
- captured Phase 11 QA Sales Orders: 0;
- captured Phase 11 QA prototype items: 0;
- `private.document_number_counters`: 0 rows;
- archived legacy commercial rows: 12;
- normalized commercial headers/items: 12 / 12;
- archived legacy Sales Order rows: 20;
- normalized Sales Order headers/items: 20 / 20.

The reset is stronger than row-by-row deletion for this disposable local
database: it reconstructs the database from migrations/seed and restores
counters rather than guessing their previous values.

## Review findings

### Fixed during review

- normalized tables accidentally retained table-wide `UPDATE` grants;
- normalized update policies omitted the active-owner invariant;
- `revenue_recognized` still followed the archived legacy table OID;
- schema tests asserted the obsolete table-wide grant instead of exact
  column-level permissions;
- automatic SO creation sent blank strings where RPC input required `NULL`;
- Prototype FOC retained a hidden zero price after switching modes;
- current-actor lookup could resolve `undefined` before auth was ready;
- legacy imported `NULL` prices rendered dishonestly as `Rp0`;
- route detail components used anonymous hook-bearing callbacks that violated
  the lint hook rule;
- unsupported legacy-only detail edits remained exposed after normalization.

### Residual, non-blocking

- `supabase db lint --local` reports two static-analysis errors for temporary
  tables created and consumed inside PL/pgSQL functions:
  `tmp_ci_pool` and `tmp_imported_quotation_ids`. Both functions execute in the
  passing migration/import/rollback tests. This is recorded as a
  `plpgsql_check` temporary-relation limitation, not reported as clean lint.
- ESLint retains 12 warnings outside the Phase 11 correctness boundary.
- Vite emits dependency/plugin deprecation notices during a successful build.

## Five-axis review

- Correctness: approved locally; no open Critical or Important finding.
- Security: approved locally; exact column grants, RLS, active-owner checks,
  private counters, and non-browser import boundary are tested.
- Regression risk: approved locally; full suite passes after final code state.
- Performance: no blocking issue found; allocation is atomic and list reads use
  grouped headers/items. No production-scale benchmark was performed.
- Maintainability: approved locally; normalized adapters and shared form/group
  helpers replace repeated-row business logic. The two static DB-lint findings
  remain documented technical debt.
