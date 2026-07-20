# Google Sheets Import: Normalized Document Mapping

Status: Accepted target mapping, 2026-07-18

This document is the source of truth for the next revision of `scripts/import-sheets.ts`. The current importer still writes one Sheet row to one legacy `sales_orders` row and must not be used for the real migration until Task 33 updates it to this normalized mapping.

Related decisions:

- `PRD.md` Section 15
- `docs/decisions/ADR-001-normalized-commercial-documents-and-numbering.md`
- `docs/superpowers/specs/2026-07-18-commercial-product-fields-and-sheet-alignment-design.md`

## Source tabs

| Live tab    | Primary purpose                                                  | Classification/series                               |
| ----------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `QUOTATION` | Historical Quotation headers, items, stages, revisions           | `QUO`                                               |
| `SO 2026`   | Regular PPN Sales Orders                                         | `SO`, `tax_type = PPN`                              |
| `NP 2026`   | Regular Non-PPN Sales Orders                                     | `NP`, `tax_type = Non-PPN`                          |
| `PROTY`     | Prototype Sales Orders                                           | `PROTY`, Paid/FOC from price presence               |
| `HARIFF`    | Historical HARIFF orders and administrative backdated SO numbers | PPN historical import; no separate automatic series |

The live tab is named `NP 2026`, not `SO NP 2026`. The live HARIFF tab title is uppercase `HARIFF`; importer aliases may accept legacy casing but must report the resolved tab.

## Import shape: group headers, preserve items

Repeated document numbers represent multiple Product line items. Import therefore:

1. Groups compatible rows into one document header.
2. Creates one item row for every source line.
3. Preserves source row order as `line_position`.
4. Reconciles the sum of imported item totals with the source totals.
5. Never treats row count as document count or numbering-counter state.

Target tables:

- `public.commercial_documents`
- `public.commercial_document_items`
- `public.sales_orders`
- `public.sales_order_items`

## `QUOTATION` mapping

### Header → `public.commercial_documents`

| Sheet column              | Database column          | Rule                                                                  |
| ------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `Quotation Number`        | `quotation_number`       | Preserve raw historical full number                                   |
| parsed base number        | `quotation_base_number`  | Strip `_REV.nn` case-insensitively for grouping                       |
| parsed revision           | `quotation_revision`     | Base = 0; `_REV.01` and `_REV.1` both parse to integer 1              |
| highest revision per base | `is_current_revision`    | Exactly one current version                                           |
| previous version          | `supersedes_document_id` | Link revisions in numeric order                                       |
| `Date`                    | `document_date`          | Preserve actual Sheet date                                            |
| `Account`                 | `owner_id`               | Match `public.profiles` case/whitespace-insensitively                 |
| `Clients`                 | `client_id`              | Match `public.clients` case/whitespace-insensitively                  |
| `Address`                 | `client_address`         | Preserve per-document address/site                                    |
| `Status`                  | `stage`                  | Preserve raw value; approved weighted labels receive forecast weights |
| `SO Number`               | `so_number`              | Optional administrative link                                          |
| `Note`                    | `note`                   | Optional text                                                         |
| constant                  | `type`                   | `Quotation`                                                           |
| constant                  | `source_flow`            | `RFQ / New Product` unless an explicit reliable source says otherwise |

Historical stage values outside the approved seven-stage map remain stored but forecast displays `Belum tersedia`; import must not silently coerce them to `Closed Lost` or weight 0.

### Item → `public.commercial_document_items`

| Sheet column   | Database column | Rule                                                                                    |
| -------------- | --------------- | --------------------------------------------------------------------------------------- |
| Product Name   | `product_name`  | Source has no separate Product column; import `NULL`, never copy Description as a guess |
| `Description`  | `description`   | Preserve historical item/project text                                                   |
| `QTY`          | `qty`           | Positive numeric                                                                        |
| `UOM`          | `uom`           | Normalize only approved `Unit`, `Pcs`, `Set`, `Lot`; otherwise review                   |
| `Harga satuan` | `unit_price`    | Parse currency to numeric                                                               |
| `Harga total`  | `line_total`    | Parse currency; verify against Qty × Unit Price                                         |

## Sales Order tabs → `public.sales_orders`

| Sheet column                           | Database column      | Rule                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No SO` / `SO NP` / `SO PROTY`         | `so_number`          | Preserve historical administrative number                                                                                                                                                                                                                               |
| `No PO Customer` / `Nomor PO Customer` | `customer_po_number` | Preserve; header-required for new app records. For an imported non-Quotation document with exactly one unique nonblank PO, forward-fill that PO to blank continuation rows; multiple distinct POs remain unchanged and require the tab-specific grouping rule or review |
| `Customer`                             | `client_id`          | Resolve by normalized exact name; do not auto-create                                                                                                                                                                                                                    |
| `Sales`                                | `owner_id`           | Resolve against sales-role profiles; for PROTY only, a blank Sales value falls back to the matched client's active owner per owner approval on 2026-07-19                                                                                                               |
| `Month` / `Bulan`                      | `date`               | Historical tabs lack day precision: use day 1 of the listed month/year and mark provenance as imported month precision                                                                                                                                                  |
| source tab                             | `type`               | `Prototype` for PROTY, otherwise `Regular`                                                                                                                                                                                                                              |
| source tab                             | `tax_type`           | PPN for `SO 2026`/`HARIFF`; Non-PPN for `NP 2026`; nullable for PROTY                                                                                                                                                                                                   |
| Total presence                         | `prototype_status`   | PROTY with blank unit price plus blank/zero total = FOC; otherwise Paid, per owner approval on 2026-07-19                                                                                                                                                               |
| source tab                             | `source`             | PROTY → Prototype Paid/FOC; other historical rows default Existing / Repeat Order                                                                                                                                                                                       |
| import constant                        | `number_mode`        | Imported/Historical; does not consume an automatic counter                                                                                                                                                                                                              |
| grouped item sum                       | `total_value`        | Paid sum; `NULL` for FOC                                                                                                                                                                                                                                                |

The application replaces Sheet Month/Week/Year presentation with one Date field. New records preserve the entered day and display `18 Jul 2026`; only historical rows without day precision use the first day of the month.

## Sales Order items → `public.sales_order_items`

| Sheet column          | Database column | Rule                                                                                                                                                                                |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product Name          | `product_name`  | Source has no separate Product column; import `NULL`                                                                                                                                |
| `Deskripsi Project`   | `description`   | Preserve historical item text                                                                                                                                                       |
| `Qty` / `QTY PO`      | `qty`           | Parse numeric quantity; for values such as `1 Unit`, split numeric and UOM                                                                                                          |
| embedded/separate UOM | `uom`           | Normalize `Unit`, `Pcs`, `Set`, `Lot`; for `SO 2026`, `NP 2026`, `PROTY`, and `HARIFF`, numeric Qty with a blank UOM defaults to `Unit`; explicit unknown values still go to review |
| `Unit Price`          | `unit_price`    | Parse paid value; `NULL` for FOC                                                                                                                                                    |
| `Total Price`         | `line_total`    | Parse paid value and verify Qty × Unit Price; `NULL` for FOC                                                                                                                        |
| physical row order    | `line_position` | Preserve order within the grouped document                                                                                                                                          |

`Total PO by Month` and `Summary PO by Month` are ignored because they are aggregate presentation columns, not document/item facts.

## Approved historical client aliases

The importer does not use fuzzy matching automatically. These nine historical
spellings are approved (six on 2026-07-18, three more during the 2026-07-19
review-decision session) after their source owner and customer PO identity
matched the existing master client. Source of truth is
`APPROVED_CLIENT_ALIASES` in `scripts/import-sheets/classify.ts`; keep this
table in sync with it.

| Historical source spelling           | Existing master client                |
| ------------------------------------ | ------------------------------------- |
| `CV. LEUWIANYAR TEKNIK`              | `CV. LEUWI ANYAR TEKNIK`              |
| `PT. ENGINEERING VISI ANTAR NUSA`    | `PT. ENGINEERING VISIT ANTAR NUSA`    |
| `PT. IDEA EDVOLUTION TECHNOLOGY`     | `PT. IDEAS EDVOLUTION TECHNOLOGGY`    |
| `PT. RIZQALLAH BOEM MAKMUR`          | `PT. Rizqallah Boer Makmur`           |
| `PT. ZAITECH ENGINEERING INDONESIA`  | `PT ZAITECH ENJINIRING INDONESIA`     |
| `PT. CIKARANG LISTRINDO`             | `PT. Cikarang listrindo Indonesia`    |
| `PT. MEKANIKA ELEKRIKA INDOCIPTA`    | `PT. MEKANIKA ELEKTRIKA INDOCIPTA`    |
| `PT. CONTROL SYSTEM ARENA PARA NUSA` | `PT. CONTROL SYSTEMS ARENA PARA NUSA` |
| `PT SURYA ANUGRAH ENJINEERING`       | `PT. SURYA ANUGRAH ENJINEERING`       |

Every other non-exact client name remains quarantined until explicitly approved.

### New client masters created during the 2026-07-19 review-decision session

These are new customers (not aliases of an existing client) — created once
in `supabase/seed.sql` because their sheet-name candidates all scored too
low (30–65) to be treated as a spelling variant of an existing master:

| Sheet name                                | Notes                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `PT. PUTRA ARGA BINANGUN`                 | 8 documents across QUOTATION/SO 2026                               |
| `CV. RDD TECHNOLOGIES`                    | 3 documents, SO 2026                                               |
| `PT. ABHIMATA CITRA ABADI`                | 4 documents, SO 2026                                               |
| `KOPERASI KARYAWAN BERSATU SEJAHTERA`     | 2 documents, NP 2026 (no `PT.` prefix — it's a koperasi, not a PT) |
| `PT. Quantum Tera Network`                | 2 documents, QUOTATION/SO 2026                                     |
| `PT. TOHAAN RENEWABLE ENERGY ENGINEERING` | 1 document, SO 2026                                                |

See `.superpowers/sdd/p11-review-decisions-report.md` for the full
decision record.

For CSV input, a bare carriage return embedded inside an otherwise unquoted
Quotation cell is removed before parsing. Standard line-feed and CRLF row
boundaries remain unchanged. This prevents one physical Sheet row from being
misread as multiple incomplete records.

## HARIFF rules

- Preserve imported numbers such as `DSM-22SO122` through `DSM-22SO146` exactly.
- When one historical HARIFF SO contains more than one customer PO, preserve every unique PO in source order on the single header, separated by ` /`; never discard one PO or split the unique SO number into duplicate headers.
- Imported HARIFF rows are historical and do not consume or seed a separate HARIFF counter.
- HARIFF new-record normal mode uses the shared SO/NP/PROTY automatic series based on classification and form Date.
- HARIFF Existing/Backdate mode accepts a manual historical number, requires a reason, checks duplicates, and logs the action.
- A historical-looking SO number never moves revenue to the number's year. Revenue period comes from the recorded/imported Date.

## Quotation revision normalization

- Preserve the raw historical `quotation_number` for audit.
- Parse `_REV.01` and `_REV.1` to revision integer 1.
- Link versions by base number and mark only the numerically highest valid revision current.
- New post-migration revisions use canonical `_REV.1`, `_REV.2`, and so on.
- Superseded versions remain queryable but are excluded from current forecast totals.

## Counter seeding after successful import

Seed `private.document_number_counters` only after document/item reconciliation passes.

Observed maxima on 2026-07-18 (informational; recalculate at real import time):

| Series/year | Observed maximum | Expected next    |
| ----------- | ---------------: | ---------------- |
| QUO/26      |              404 | `DSM-26QUO-0405` |
| SO/26       |              143 | `DSM-26SO144`    |
| NP/26       |               16 | `DSM-26NP017`    |
| PROTY/26    |                8 | `DSM-26PROTY009` |

Rules:

- Seed from maximum unique valid base number, not physical last row.
- Reserve a parseable official number even when its row is quarantined for
  review; otherwise a historical number could be issued again.
- Each series/year is independent.
- Do not fill historical gaps such as missing NP014.
- Repeated line items and Quotation revisions do not advance the base counter more than once.
- HARIFF historical `DSM-22SO...` values do not seed a special series.

## Rows requiring manual review

Never silently import these into revenue or forecast:

1. Unmatched client.
2. Unmatched sales owner.
3. Paid row with blank/invalid Qty, Unit Price, or Total.
4. Non-PROTY row with blank Total Price.
5. FOC row with a monetary value.
6. Unknown UOM that cannot be normalized without guessing.
7. Conflicting header values among rows sharing one document number.
8. Duplicate full document number assigned to incompatible headers.
9. Total Price materially different from Qty × Unit Price after documented rounding tolerance.
10. Quotation revision suffix that cannot be parsed reliably.

Review output remains a structured JSONL file for the one-time migration unless a later implementation decision explicitly creates a database review queue.

## As-built status

`scripts/import-sheets.ts`, `scripts/import-sheets/classify.ts`, fixtures, and
golden tests target normalized document headers and child items. A document is
quarantined in full when any row with the same document number requires
review; partial document imports are not allowed.

Commercial header comparison treats punctuation, casing, and repeated
whitespace in `clientAddress` as equivalent while preserving the first source
spelling. This rule does not apply to customer identity, status, notes, linked
SO, or customer PO values.

All five prepared local source tabs were processed and reconciled on
2026-07-19. See `.superpowers/sdd/p11-import-closeout-report.md`. This local
evidence does not authorize a remote migration or import.
