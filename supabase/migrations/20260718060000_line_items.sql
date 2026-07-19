-- Migration: line items (qty / unit price) on commercial_items and sales_orders
--
-- Plain-language summary: lets one RFQ/Quotation/SO/SO-Prototype document
-- number cover multiple line items (each with its own qty and unit price),
-- instead of a single lump-sum value per row. Modeled the same way the
-- Google Sheets multi-item SO import already works: one row per line
-- item, sharing the same document number text column
-- (rfq_number/quotation_number/so_number) — no new "document" table, no
-- schema change to how those number columns behave, just two new numeric
-- columns plus an RFQ number column that didn't exist yet.
--
-- `estimated_value` (commercial_items) / `value` (sales_orders) stay as
-- the stored, authoritative numbers every existing revenue/target/pipeline
-- calculation already reads — the app always computes and writes them as
-- qty * unit_price at insert time (decided: auto-calculated, not manually
-- overridable), so nothing downstream needs to change to stay correct.
-- Both new numeric columns are nullable: existing rows (and any future
-- write path that doesn't collect qty/price, e.g. Direct Order/Customer
-- PO/Prototype Request) keep working with `estimated_value`/`value` set
-- directly, exactly as before.

alter table public.commercial_items
  add column rfq_number text,
  add column qty numeric,
  add column unit_price numeric;

alter table public.sales_orders
  add column qty numeric,
  add column unit_price numeric;
