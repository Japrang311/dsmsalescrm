# Soft Delete for RFQ, Quotation, and Sales Order

Date: 2026-07-24
Status: Accepted

## Problem

There is currently no way to remove an RFQ, Quotation, or Sales Order from
the app once created, even if it was created by mistake or is a duplicate.
The user asked for a delete feature, available to every role except
Executive.

## Constraint discovered during design

Every exposed table in this app deliberately has **no hard DELETE policy**
(PRD §9: "archive over hard delete" — see comments in
`clients.sql`, `tasks.sql`, `commercial_items.sql`, `sales_orders.sql`,
`normalize_commercial_documents.sql`). Revenue records (Sales Orders)
especially must not disappear silently from historical reports. This
feature follows that existing pattern: **soft delete**, not a SQL `DELETE`.

## Scope

- RFQ and Quotation are both rows in `public.commercial_documents`
  (distinguished by `type`). Sales Order is `public.sales_orders`.
- Roles: Sales, Manager, Super Admin can delete/restore. Executive is
  unchanged (read-only).
- Sales may only delete/restore their own records (`owner_id` match).
  Manager and Super Admin may delete/restore any record. This exactly
  matches the existing UPDATE RLS policies on both tables — no RLS changes
  are required for permission enforcement.
- Deletes are restorable (a "Restore" action), not one-way.

## Out of scope (explicitly)

- **No block on deleting an RFQ/Quotation that a Sales Order was created
  from.** Checked the schema: there is no foreign key or any other link
  from `sales_orders` back to the `commercial_documents` row it
  conceptually originated from. Enforcing that would require adding a new
  tracked relationship, which is a separate, larger feature. Restore is the
  safety net if this turns out to matter in practice.
- No changes to dashboard/report selectors beyond the natural effect of
  deleted rows being excluded once list/detail queries filter on
  `deleted_at`.
- No permanent/hard delete path in this feature.

## Schema changes

New migration adds to both `public.commercial_documents` and
`public.sales_orders`:

```sql
alter table public.commercial_documents
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id);

alter table public.sales_orders
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id);
```

No RLS policy changes. The existing UPDATE policies on both tables already
read:

```
(role = 'sales' and owner_id = auth.uid()) or role in ('manager', 'super_admin')
```

Soft delete/restore is implemented as an UPDATE against these two columns,
so this policy already enforces exactly the permission set requested.

A second migration (its own transaction, per the existing pattern for enum
value additions — see `20260721100000_add_sales_order_edit_activity_kinds.sql`)
adds to `public.activity_kind`:

- `commercial_document_deleted`
- `commercial_document_restored`
- `sales_order_deleted`
- `sales_order_restored`

## Data layer changes

`src/lib/data/commercial-documents.ts`:

- `deleteCommercialDocument(id)`: sets `deleted_at = now()`,
  `deleted_by = current user`. Before writing, checks whether any other
  `commercial_documents` row has `supersedes_document_id = id` (i.e. a
  newer Quotation revision exists) — if so, rejects with a clear error
  message rather than deleting. This check applies to both RFQ and
  Quotation rows (it will simply never match for RFQ, since RFQs don't
  participate in the revision chain).
- `restoreCommercialDocument(id)`: clears both columns.
- Both write one `activity_log` row (actor, target document, kind).
- Existing fetch functions used by list/detail views add
  `.is("deleted_at", null)` so deleted rows disappear from normal views
  without touching every call site's business logic.
- A new fetch function (or an optional parameter on the existing one)
  returns only rows where `deleted_at is not null`, for the "Show deleted"
  view.

`src/lib/data/sales-orders.ts`: same shape —
`deleteSalesOrder(id)` / `restoreSalesOrder(id)`, no revision check (Sales
Orders don't have a revision chain), existing fetch functions filter
`deleted_at is null` by default, new fetch path for deleted-only.

## UI changes

Detail pages (`_app.rfq.$id.tsx`, `_app.quotations.$id.tsx`,
`_app.sales-orders.$soId.tsx`):

- Add a "Delete" button next to existing edit controls, gated by the same
  ownership check already used for editing (e.g. `canEditOwnSo` in the SO
  detail page — sales sees it only on their own records, manager/super
  admin always see it, executive never sees it).
- Clicking opens a shadcn `AlertDialog` confirmation. On confirm, calls the
  delete function and navigates back to the corresponding list page.
- If a Quotation delete is rejected because a newer revision exists, show
  that error message inline instead of navigating away.

List pages (`_app.rfq.index.tsx`, `_app.quotations.index.tsx`,
`_app.sales-orders.index.tsx`):

- Add a "Show deleted" toggle, visible only to Sales/Manager/Super Admin
  (hidden for Executive), that switches the list query to the
  deleted-only fetch path.
- In that mode, the per-row action becomes "Restore" instead of the normal
  row actions.

## Testing

- RLS/data-layer tests (`bun run test`) covering: sales can delete/restore
  own records, cannot delete others'; manager/super_admin can
  delete/restore any record; executive cannot delete or restore (no UPDATE
  policy applies to executive today, so this should already fail closed —
  confirm with a test); deleted rows are excluded from normal fetch
  functions and included in the deleted-only fetch path; deleting a
  Quotation with a newer revision is rejected; restoring clears both
  columns and makes the row visible again in normal fetches.
