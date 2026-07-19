# ADR-001: Normalize Commercial Documents and Generate Numbers Atomically

## Status

Accepted

## Date

2026-07-18

## Context

The current schema stores one `commercial_items` or `sales_orders` row per line item and repeats the document number and other header fields. That was sufficient for the first multi-item form, but it cannot safely enforce one unique document number per document, model Quotation revisions, or prevent header duplication.

New confirmed requirements are:

- Product Name and optional Description on every RFQ, Quotation, and Sales Order item.
- Separate Qty and UOM, with paid totals calculated from Qty × Unit Price.
- One user form and one save, despite internal header/item normalization.
- System-generated yearly QUO/SO/NP/PROTY sequences seeded after historical Sheet import.
- Canonical Quotation revisions using `_REV.n`, with only the latest revision included in forecast.
- HARIFF normal automatic numbering or audited manual backdate numbering.
- Revenue derived from paid line-item totals and the form Date, not from the administrative SO number.

Concurrent users make client-side “read max then add one” numbering unsafe. Repeating one header per line item also makes unique-number constraints incompatible with legitimate multi-item documents.

## Decision

Normalize commercial records into document headers and line items:

- `public.commercial_documents`
- `public.commercial_document_items`
- `public.sales_orders`
- `public.sales_order_items`
- `private.document_number_counters`

The UI remains one form. A PostgreSQL transaction creates the header, all items, calculated totals, number allocation/validation, and audit entry together.

Numbering rules:

- Quotation: `DSM-YYQUO-nnnn`
- PPN SO: `DSM-YYSOnnn`
- Non-PPN SO: `DSM-YYNPnnn`
- Prototype SO: `DSM-YYPROTYnnn`
- Each series has an independent counter per Date year.
- Historical import seeds from the maximum unique valid number, never row count.
- Quotation revisions append canonical `_REV.n` without consuming a new base number.

HARIFF backdate is a manual administrative exception with required reason, duplicate validation, and audit log. It does not consume a counter or move revenue to the year embedded in the number.

## Alternatives Considered

### Keep one row per item and repeat header fields

- Pros: smallest code/schema change.
- Cons: cannot enforce one number per document, repeats No PO/No SO/date/client data, complicates revisions, and risks duplicate allocation under concurrency.
- Rejected because the confirmed numbering and revision requirements make the model unsafe.

### Store line items as JSON on one row

- Pros: one header row and simple document uniqueness.
- Cons: weak relational validation, harder reporting/filtering, awkward item-level import reconciliation, and poor fit for PostgreSQL analytics.
- Rejected because Product/UOM/price data are first-class reportable facts.

### Generate numbers in the browser

- Pros: easy UI implementation.
- Cons: two users can receive the same number; rollback and retry behavior is unreliable; the browser cannot be the source of truth.
- Rejected. PostgreSQL allocates numbers atomically inside the create transaction.

### Continue a special automatic `DSM-22SO` HARIFF series

- Pros: matches historical-looking numbers.
- Cons: mixes old and current years and hides whether a number is new or management backdate.
- Rejected. New HARIFF orders use normal current-year series; only genuine historical/backdate references are entered manually.

## Consequences

- Existing rows and foreign keys require a reviewed data migration and reconciliation.
- Import fixtures and scripts must target header/item tables and preserve Qty/UOM/Product fields.
- Current list/detail pages must move from row-level rendering to document groups.
- Counter and revision concurrency tests become mandatory.
- The old PRD prohibition on system-generated Quotation/SO numbers is superseded.
- Legacy tables remain read-only and non-exposed until UAT approves later removal.

## References

- `PRD.md` Sections 5, 7, and 15
- `docs/superpowers/specs/2026-07-18-commercial-product-fields-and-sheet-alignment-design.md`
- `scripts/import-sheets-mapping.md`
- `tasks/plan.md` Phase 11
