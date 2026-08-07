# Stage 4 Metric Dictionary — v1

**Status:** approved by owner 2026-08-07. All 9 metrics approved, including cycle-time (Metrics 4-6). `customer_po_date` field name and manual-entry-at-create/edit-time approved as proposed (see "Open decision" section below).
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md` §7
**Plan:** `tasks/four-stage-stabilization-and-growth-plan.md` Task 4.1

Every metric below ships with `analytics_effective_from`, `included_count`, `excluded_count`, and `exclusion_reason` in its RPC output, per spec §7.2/7.3. Nothing here backfills or infers legacy links — rows outside a metric's effective date are excluded, never treated as zero.

## 1. Win/Loss Count & Rate

- **Owner:** Sales/Manager/Executive (role-scoped, same as `sales_orders_metrics`)
- **Formula:** count of Quotations where `stage = 'Closed Won'` / `stage = 'Closed Lost'`; rate = won / (won + lost). Denominator excludes any non-terminal stage (Quotes Sent, Negotiation, Hot Prospect, Commit).
- **Grain:** by owner, period (date range on `commercial_documents.date`), client, and product (where line items resolve to a single product; mixed-product documents excluded from the product cut only).
- **Filters:** existing owner/date-range/client filters (Reports filter bar).
- **Source fields:** `commercial_documents.stage`, `.owner_id`, `.date`, `.client_id`; `commercial_document_items.product_name`.
- **Effective date:** all history — no lineage dependency, uses only current terminal stage.
- **Exclusions:** deleted documents, superseded Quotation revisions (`is_current_revision = false`), RFQ-era rows (none exist post-retirement).

## 2. Win/Loss Value

- **Formula:** sum of Quotation grand total for Closed Won / Closed Lost, same denominator as above.
- Same grain/filters/source/effective-date/exclusions as Metric 1.

## 3. Lost-Reason Breakdown

- **Formula:** count and value grouped by `lost_reason` (and `lost_reason_detail` when `lost_reason = 'Lainnya'`) for `stage = 'Closed Lost'`.
- **Source fields:** `commercial_documents.lost_reason`, `.lost_reason_detail` (existing contract, migration `20260725054536`).
- **Effective date:** all history — reuses the existing reason contract, no new fields.
- **Exclusions:** same as Metric 1; plus Closed Lost rows with `lost_reason` null are impossible post-`transition_commercial_stage` (reason required at write time), so no exclusion bucket expected here in practice.

## 4. Quote → Customer PO Cycle Time

- **Formula:** `customer_po_date - quotation.date` in days, for Sales Orders with a non-null `source_commercial_document_id` and non-null `customer_po_date`. Reports median/p50/p75/p90.
- **Grain:** by owner, period, client.
- **Source fields:** `sales_orders.source_commercial_document_id`, new `sales_orders.customer_po_date` (Task 4.2), source Quotation's `commercial_documents.date`.
- **Effective date:** later of (a) `source_commercial_document_id` column existing — 2026-08-07 (migration `20260807010000`) — and (b) `customer_po_date` column existing, once Task 4.2 ships. Only Sales Orders created via the linked "Closed Won → Create Sales Order" path *and* with `customer_po_date` filled in qualify.
- **Exclusions:** SOs with null `source_commercial_document_id` (direct-create/repeat-order path — no Quotation to measure from) or null `customer_po_date` (milestone not recorded). Both counted and reported, never treated as zero days.

## 5. Customer PO → Sales Order Cycle Time

- **Formula:** `sales_orders.date - customer_po_date` in days, median/p50/p75/p90. Same source/effective-date/exclusion rules as Metric 4 (both need the same two fields).

## 6. End-to-End Cycle Time (Quote Sent → SO Created)

- **Formula:** `sales_orders.date - source_quotation.date` in days, for linked SOs only (`source_commercial_document_id` not null). Does **not** require `customer_po_date` — this is the coarser Quote→SO span, independent of Metric 4/5.
- **Effective date:** 2026-08-07 (`source_commercial_document_id` availability only).
- **Exclusions:** unlinked SOs (direct-create/repeat-order).

## 7. Stage-Entry Funnel (event-based)

- **Formula:** distinct-document count entering each stage (Quotes Sent → Negotiation → Hot Prospect → Commit → Closed Won/Lost), counted from `activity_log` rows where `kind = 'commercial_item_stage_change'`, bucketed by `event_data->>'to_stage'`. Not a current-stage snapshot — a document that passed through and later moved on still counts as having entered that stage.
- **Grain:** by owner, period (`event_data->>'effective_at'`), client.
- **Source fields:** `activity_log.kind`, `.event_data` (`to_stage`, `effective_at`), `.commercial_document_id`, `.owner_id`.
- **Effective date:** 2026-08-05 (migration `20260805035617_add_atomic_commercial_stage_transition`, first writer of structured stage events).
- **Exclusions:** any stage change before 2026-08-05 (no structured event exists — the pre-Stage-1 direct-write path left no event row). Documents whose *entire* stage history predates the cutover are excluded from the funnel entirely and counted in the coverage panel, not folded into "Quotes Sent" as a default.

## 8. Stage Dwell Time

- **Formula:** for consecutive structured stage events on the same document, dwell = `next.effective_at - this.effective_at`. The final (current) stage of a still-open document has no "next" event — reported separately as **open dwell** (`now() - effective_at`, still accruing), never merged into **completed dwell** (a closed interval between two events).
- **Grain:** by stage, owner, period.
- **Effective date:** 2026-08-05, same as Metric 7. A document's dwell in a stage is only measurable once *both* the entry and exit events are structured; a stage entered before the cutover with a structured exit after it still has an unmeasurable entry timestamp and is excluded, not backfilled from `created_at`.

## 9. Data-Quality / Coverage Panel

- **Content:** per metric — `analytics_effective_from`, included row count, excluded row count, exclusion reason breakdown (e.g. "no source_quotation_id: 142", "no customer_po_date: 38", "pre-cutover stage history: 890"), and coverage % = included / (included + excluded).
- Displayed beside every affected chart, and included in exports (new sheet/section, not merged into existing columns).

---

## Open decision needed alongside this dictionary

**Customer PO milestone date field** (Task 4.2): `sales_orders.customer_po_date date null` — a business date the Sales rep enters when the PO actually lands (separate from `customer_po_number` free text and from `sales_orders.date`, which is the SO's own document date). Nullable/additive, no backfill. Approved: field name `customer_po_date`, user-entered at Sales Order creation/edit time.

## What happens if this is declined

Per spec §7.2: only Metrics 1–3 (win/loss + lost-reason) proceed. Metrics 4–6 (cycle time) and the `customer_po_date` field stay out of scope; Metrics 7–8 (funnel/dwell) are unaffected since they don't depend on the PO milestone field.
