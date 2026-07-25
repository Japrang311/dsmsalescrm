# ADR-003: Retire RFQ Workflow

## Status

Accepted

## Date

2026-07-25

## Context

RFQ used to be modeled as an active commercial-document type before Quotation.
The product direction changed: users should no longer create, search, route to,
filter by, or advance RFQ records inside the application. Quotation is now the
first active commercial document in the new-product flow.

Historical RFQ rows may still exist in the database and in old migration or
import history. Removing those rows or rewriting old migrations would be a
destructive data-history change and would make rollback/reconciliation harder.

## Decision

Retire RFQ as an application feature while preserving historical database
compatibility.

The active application must not expose:

- RFQ routes or navigation.
- RFQ quick-create or client action entries.
- RFQ global-search results.
- RFQ creation or RFQ-to-Quotation conversion paths.
- RFQ-only stages, including `Client Request for Quotes`.
- RFQ dropdown options, filter options, or status-stage configuration.

Quotation stages now start at `Quotes Sent`. The user-facing new-product source
label is `New Product`; legacy stored values such as `RFQ / New Product` may
still be mapped at the data boundary for historical compatibility.

Forward migrations retire the RFQ creation/conversion RPCs and reject new
authenticated RFQ writes. Historical RFQ rows, enum values, and old migrations
remain intact unless a later destructive cleanup is separately approved.

## Consequences

- Product documentation must describe the current active flow as
  `Client -> Quotation -> Customer PO -> Sales Order -> Revenue`.
- Old RFQ specs and implementation plans are historical records, not current
  feature instructions.
- Application queries must exclude historical RFQ documents from active business
  surfaces.
- Supabase remote application of the RFQ-retirement migrations remains separate
  from Git push and requires explicit target approval.

## References

- `specs/remove-rfq.md`
- `tasks/rfq-removal-todo.md`
- `supabase/migrations/20260725151142_retire_rfq_rpcs.sql`
- `supabase/migrations/20260725152241_block_authenticated_rfq_creation.sql`
