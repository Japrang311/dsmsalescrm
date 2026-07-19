# Quick Create Label Fix and Verification Design

> **Historical completed design.** This document records the narrow Quick Create label/verification pass as executed. Its “no schema/form/grouping change” boundary and external-number rationale are superseded for future work by ADR-001 and `2026-07-18-commercial-product-fields-and-sheet-alignment-design.md`. Do not edit the historical verification evidence to pretend Phase 11 was already implemented.

Date: 2026-07-18

## Goal

Correct the misleading Sales Order menu label and prove that all six global Quick Create flows work against the local Supabase stack without leaving test data behind.

## Scope

In scope:

- Change the Sales Order Quick Create label from `Record Customer PO` to `Record Sales Order`.
- Keep all six existing Quick Create kinds and dialog behavior unchanged.
- Add a small automated contract test for the menu configuration.
- Submit all six Quick Create flows through the running browser app.
- Verify the created records in local Supabase, then delete every QA record and related activity-log entry.
- Run typecheck, targeted lint, the complete test suite, and production build.

Out of scope:

- Grouping list/detail rows by RFQ, quotation, or Sales Order number.
- Changing dialog fields, validation rules, database schema, RLS policies, or migrations.
- Creating a permanent browser E2E framework.
- Touching a linked or production Supabase project.
- Initializing Git or committing files.

## Implementation Design

`TopBar.tsx` will expose a typed `QUICK_CREATE_ITEMS` configuration containing the six existing kinds and their labels. The dropdown will render from this configuration while retaining the existing `setQuickCreate(kind)` behavior. For this historical pass, the Sales Order entry used the exact label `Record Sales Order`. The later accepted Phase 11 design replaces the then-current external-number assumption with PostgreSQL-owned automatic numbering.

A focused Bun test will import the configuration and assert the exact kind-label pairs. The test will be written first and observed failing while the current hardcoded menu remains in place. Production code will then be changed minimally until the test passes.

## Browser Verification Design

The browser test will use the existing app on `http://localhost:8081` and the local Supabase URL configured in `.env.local`. It will create one uniquely named QA client, then use that client for the other five flows:

1. New Client
2. New Follow Up
3. New RFQ
4. New Quotation
5. Record Sales Order
6. New Prototype Request

RFQ, quotation, and Sales Order will use unique external-style QA document numbers. Each successful submission must be supported by visible UI evidence and a matching database record. Console errors or failed application network requests are failures, not warnings to ignore.

## Cleanup and Safety

All QA names and document numbers will share a unique run marker. Before testing, database counts for the affected tables will be recorded. Cleanup will target only rows carrying that marker or the exact IDs captured during verification, in foreign-key-safe order. Related `activity_log` rows will be removed before parent records where required. After cleanup, targeted queries must return zero QA rows and baseline counts must be restored.

No schema reset, broad delete, remote project command, `supabase link`, or `supabase db push` is authorized.

## Acceptance Criteria

- Quick Create shows exactly six items, including `Record Sales Order` and no `Record Customer PO`.
- The menu contract test fails before the fix and passes after it.
- Every Quick Create dialog opens and submits successfully against local Supabase.
- Created values and document numbers match the browser inputs.
- No new console error or failed application request is observed during the flows.
- All QA records and related logs are removed; post-cleanup queries return zero matching rows.
- Typecheck result is reported honestly, including any pre-existing errors.
- Targeted lint passes, the full Bun test suite passes, and the production build succeeds.
