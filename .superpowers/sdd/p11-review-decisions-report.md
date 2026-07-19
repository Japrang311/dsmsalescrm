# Phase 11 Import Review — Decisions and Structural Fixes

Date: 2026-07-19
Environment: local Supabase at `127.0.0.1:54321` only. No operation was
performed against a remote Supabase project.

## What this session did

`.superpowers/sdd/p11-import-closeout-report.md` (Task 33) left 127 source
rows quarantined across 55 pending decision entries in
`Phase-11-Import-Review.xlsx`. This session worked through all 55 entries
with the project owner, applied the resulting corrections to the five
source-tab CSVs, and re-ran the normalized importer end to end against local
Supabase.

## Decisions (55 of 55, all resolved)

| Decision | Count | Detail |
| --- | ---: | --- |
| Approve correction | 38 | 20 new-customer creations, 7 status conflicts (last row in sheet order wins), 4 note conflicts (last row wins), 2 customer-name typo fixes (cross-checked via the Address column), 1 dual-linked-SO header (both SOs recorded), 1 computed missing line total, 2 price-mismatch resolutions (Line Total treated as authoritative post-discount value), 1 owner correction (confirmed by owner: Feni Cahyaningtias) |
| Keep rejected | 16 | 1 blank customer name, 11 rows with qty/price both blank, 3 rows with qty present but price entirely blank, 1 document kept fully quarantined per the Task 33 whole-document rule (one line item had no price; partial-row import was considered and explicitly rejected to avoid recreating the regression Task 33 fixed) |
| Needs source update (reverted to no-op) | 1 | `DSM-26SO082`: three customer POs on one internal SO. Splitting into 3 new documents was proposed and rejected — no historical document numbers existed for a 3-way split, so the owner chose to keep it as one consolidated SO with all three PO numbers recorded in the header (same pattern already used for HARIFF's multi-PO merge) |

Two additional per-document header conflicts were discovered only during
dry-run verification (the review tool records one conflict field per
document, not all differing fields) and resolved using the same
already-approved rules:

- `DSM-26QUO-0058_REV1`, `-0059_REV2`, `-0060_REV1`, `-0309`, `-0342` also had
  a differing `Note` across rows (missed because their review-file conflict
  field said `Status`, not `Note`). Resolved with the same "last row in sheet
  order wins" rule the owner already approved.
- `DSM-26QUO-0059_REV2` also had a partially-blank `SO Number` (some rows
  blank, one row `DSM-26SO042`). Treated as incomplete entry, not a real
  disagreement — filled forward, following the same precedent as the
  `DSM-26SO111` missing-total fix.

## Structural bugs found and fixed (not just data decisions)

1. **`supabase/migrations/20260719200000_add_import_clients.sql`** (present
   before this session started, from earlier work) failed `db reset` with
   `INVALID_BUSINESS_OWNER` for two independent reasons:
   - Its owner UUIDs used a "corrected" RFC-4122-looking form
     (`22222222-2222-4222-8222-222222222222`) that doesn't match the actual
     placeholder profile IDs used everywhere else in this project
     (`22222222-2222-2222-2222-222222222222`).
   - Even with the IDs fixed, migrations apply **before** `seed.sql`, and
     `seed.sql` is what inserts the `profiles` rows the
     `enforce_active_business_owner` trigger checks against. A migration
     cannot insert business rows that depend on seed-only reference data.
   - Fix: moved the 68-row `INSERT INTO public.clients` statement into
     `supabase/seed.sql` (appended after the existing client seed block, so
     profiles load first) and deleted the migration file. This is the
     correct home for business seed data per the project's own
     local-first/seed-vs-migration separation.
2. **`quotation-clean.csv` silently dropped `DSM-26QUO-0238`'s entire row**
   (customer, qty, UOM, price, total, status, note all blank) — the same
   embedded-carriage-return bug documented in the closeout report for
   `DSM-26QUO-0194`/`-0208`, but this one wasn't caught by the earlier
   cleanup pass. Restored from `quotation-real.csv` (the pre-cleanup raw
   export).
3. **Client master naming error**: the new-customer migration inserted
   `PT. KOPERASI KARYAWAN BERSATU SEJAHTERA`, but a koperasi (cooperative) is
   not a PT (limited company), and the sheet's own customer name has no "PT."
   prefix. Fixed the master row's name so the importer's exact-match lookup
   (no fuzzy matching, by design) resolves it.

## Result

| Tab | Headers before → after | Review rows before → after |
| --- | --- | --- |
| QUOTATION | 377 → 397 | 98 → 31 |
| SO 2026 | 127 → 142 | 25 → 1 |
| NP 2026 | 12 → 14 | 4 → 1 |
| PROTY | 8 → 8 | 0 → 0 |
| HARIFF | 25 → 25 | 0 → 0 |
| **Total** | **549 → 586** | **127 → 33** |

Paid total rose from Rp103.459.907.623 to approximately Rp131.024.482.393.
The 33 remaining review rows correspond exactly to the 16 documents the
owner chose to keep rejected (incomplete source data) — none are
unaccounted-for.

Real import ran for all five tabs against local Supabase only. Post-import
verification: `public.commercial_documents` = 409 rows,
`public.commercial_document_items` = 732 rows, `public.sales_orders` = 209
rows, `public.sales_order_items` = 403 rows (these totals also include the
pre-existing demo/seed commercial data migrated into the normalized schema
by `20260719024024_migrate_commercial_document_data.sql`, not only this
session's sheet import).

## Checkpoint verification (end of session)

- `bun run test`: 313/313 pass.
- `bunx tsc --noEmit`: clean.
- `bun run lint`: 12 pre-existing warnings only (unchanged from baseline;
  no errors).
- `bun run build`: succeeds.

## Files touched this session

- `supabase/seed.sql` — added the 68-row sheet-import client masters (moved
  from the deleted migration below); fixed the Koperasi name.
- `supabase/migrations/20260719200000_add_import_clients.sql` — **deleted**
  (content moved into `seed.sql`).
- `tasks/todo.md` — Task 20/21's two stale manual-check checkboxes marked
  superseded by Task 33's real-data closeout.
- Working CSVs (outside the repo, in
  `~/Downloads/Work/Projects/dsm-sheet-export/corrected/`): corrected copies
  of `quotation-clean.csv`, `so-2026-data.csv` reflecting all decisions above.
  Originals in that folder were never modified.
- `~/Downloads/Work/Projects/dsm-sheet-export/outputs/.../Phase-11-Import-Review-DECIDED.xlsx`
  — a new file with the Decision/Corrected columns filled in for all 55
  entries; the original `Phase-11-Import-Review.xlsx` was not overwritten.

## Remaining gates (unchanged from Task 33)

Remote rollout remains blocked until the owner identifies the exact
Supabase target and separately approves the reviewed migration and import
commands. Nothing in this session touched anything remote.
