# Google Sheets import fixtures

Status: normalized fixture pack implemented and locally verified, 2026-07-19.

These files contain fake-but-structurally-real exports derived from the DSM Sheet headers. They contain no real client, sales, PO, or revenue data.

The accepted target mapping is now `scripts/import-sheets-mapping.md`. It supersedes the original expectations that Qty, Unit Price, No PO, and Description were dropped and that each Sheet row became one `sales_orders` row.

## Target fixture behavior

Updated golden fixtures must prove:

- Repeated SO/Quotation numbers create one header with multiple ordered items.
- `Nomor PO Customer` persists on the Sales Order header.
- Description, Qty, UOM, Unit Price, and Total persist on each item.
- Historical Product Name is `NULL` when the Sheet has only Description.
- Paid `total_value` equals the sum of item totals.
- Prototype FOC retains Product-compatible item rows but money remains `NULL`.
- HARIFF historical numbers are preserved without consuming an automatic counter.
- QUO/SO/NP/PROTY maxima seed independent yearly counters.
- Quotation `_REV.01` and `_REV.1` parse to the same revision integer while preserving their raw number.
- Ambiguous client, sales, UOM, header conflicts, and price mismatches go to review instead of being guessed.

## Verified fixture inventory

- `quotation.csv`: base/revision, multi-item, all revision links, and conflicting-header review.
- `so-2026.csv`: PPN multi-item/max seed plus unmatched, conflict, blank-total, and mismatch review.
- `np-2026.csv`: Non-PPN gap/max seed, embedded UOM, and unknown-UOM review.
- `proty.csv`: Prototype Paid/FOC max seed and invalid FOC-money review.
- `hariff.csv`: exact historical HARIFF number excluded from counter seeding.

The golden suite verifies 20 source rows reconcile to 8 accepted headers,
10 accepted items, and 10 structured review rows. A transactional local import
then verifies normalized persistence and independent counter maxima.

## Safety

- Tests never read the live Sheet or require Google credentials.
- The real importer remains manual and local-first.
- No real import is allowed until the revised golden tests and count/value reconciliation pass.
