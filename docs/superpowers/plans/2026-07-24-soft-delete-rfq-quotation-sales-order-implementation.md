# Soft Delete RFQ, Quotation, and Sales Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible, permission-safe soft delete and restore flows for RFQ, Quotation, and Sales Order, with deleted records excluded from normal business views and every transition recorded in the immutable activity log.

**Architecture:** Add nullable deletion metadata and the required column-level grants without changing the existing UPDATE RLS policies. Extend the normalized document and Sales Order adapters with explicit active/deleted query modes and audited mutation functions, then expose those functions through shared detail confirmation controls and role-gated deleted-list modes. Normal dashboard/report queries continue using active-only adapters, so deleted revenue and forecast data disappear without selector rewrites.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, TypeScript, React 19, TanStack Router, TanStack Query, shadcn AlertDialog/Switch, Bun test.

## Global Constraints

- Use soft delete only; never add a browser-accessible SQL `DELETE` path.
- Sales may delete/restore only rows where `owner_id = auth.uid()`; Manager and Super Admin may act on any visible row; Executive remains read-only.
- Preserve the existing `commercial_documents_update` and `sales_orders_update` RLS policies; enforce the feature through UPDATE.
- Explicitly grant `authenticated` UPDATE on `deleted_at` and `deleted_by` for both tables.
- Keep activity enum additions in a migration separate from the migration that uses the new enum values.
- Reject deletion of a commercial document when another row has `supersedes_document_id` equal to its id.
- Do not invent an RFQ/Quotation-to-Sales-Order dependency check; the schema has no such relationship.
- Default list/detail/dashboard/report queries must exclude `deleted_at is not null`.
- “Show deleted” and restore controls are hidden from Executive.
- Do not run migrations or mutations against linked/remote Supabase without explicit owner approval.
- Local integration tests must pass the loopback safety guard in `supabase/tests/helpers.ts`.

---

### Task 1: Add deletion metadata, grants, activity kinds, and database permission coverage

**Files:**
- Create: `supabase/migrations/20260724110000_add_commercial_soft_delete_activity_kinds.sql`
- Create: `supabase/migrations/20260724110001_add_commercial_soft_delete_columns.sql`
- Create: `supabase/tests/commercial-soft-delete-rls.test.ts`

**Interfaces:**
- Consumes: existing `commercial_documents_update` and `sales_orders_update` policies from `supabase/migrations/20260719041351_harden_normalized_document_permissions.sql`
- Produces: `deleted_at timestamptz`, `deleted_by uuid`, and four `public.activity_kind` values available to all later tasks

- [ ] **Step 1: Write the failing schema/RLS integration test**

Create fixtures for one Sales-owned and one Manager-owned commercial document and Sales Order. Use `signInAs()` clients—not `adminClient`—for the assertions:

```ts
const deletedAt = "2026-07-24T04:00:00.000Z";

const ownCommercial = await salesClient
  .from("commercial_documents")
  .update({ deleted_at: deletedAt, deleted_by: fixtures.sales.id })
  .eq("id", salesCommercialId)
  .select("deleted_at, deleted_by")
  .single();
expect(ownCommercial.error).toBeNull();
expect(ownCommercial.data?.deleted_by).toBe(fixtures.sales.id);

const otherCommercial = await salesClient
  .from("commercial_documents")
  .update({ deleted_at: deletedAt, deleted_by: fixtures.sales.id })
  .eq("id", managerCommercialId)
  .select("id");
expect(otherCommercial.data).toEqual([]);

const executiveRestore = await executiveClient
  .from("sales_orders")
  .update({ deleted_at: null, deleted_by: null })
  .eq("id", salesOrderId)
  .select("id");
expect(executiveRestore.data).toEqual([]);
```

Cover both tables and all four roles: own Sales succeeds; other-owner Sales returns no updated row; Manager and Super Admin succeed on another owner; Executive cannot delete or restore. Assert the new activity enum labels exist through:

```ts
const enumRows = await db`
  select enumlabel
  from pg_enum
  join pg_type on pg_type.oid = pg_enum.enumtypid
  where pg_type.typname = 'activity_kind'
`;
expect(enumRows.map((row) => row.enumlabel)).toEqual(
  expect.arrayContaining([
    "commercial_document_deleted",
    "commercial_document_restored",
    "sales_order_deleted",
    "sales_order_restored",
  ]),
);
```

- [ ] **Step 2: Run the new test and verify the schema is missing**

Run:

```bash
bun test supabase/tests/commercial-soft-delete-rls.test.ts
```

Expected: FAIL because `deleted_at`/`deleted_by` and the new enum values do not exist.

- [ ] **Step 3: Add the enum-only migration**

```sql
-- New enum values must commit before a later migration inserts them.
alter type public.activity_kind
  add value if not exists 'commercial_document_deleted';
alter type public.activity_kind
  add value if not exists 'commercial_document_restored';
alter type public.activity_kind
  add value if not exists 'sales_order_deleted';
alter type public.activity_kind
  add value if not exists 'sales_order_restored';
```

- [ ] **Step 4: Add columns, indexes, and exact column grants**

```sql
alter table public.commercial_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

alter table public.sales_orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

create index if not exists commercial_documents_active_idx
  on public.commercial_documents (owner_id, document_date desc)
  where deleted_at is null;

create index if not exists sales_orders_active_idx
  on public.sales_orders (owner_id, date desc)
  where deleted_at is null;

grant update (deleted_at, deleted_by)
  on table public.commercial_documents to authenticated;
grant update (deleted_at, deleted_by)
  on table public.sales_orders to authenticated;
```

Do not recreate or broaden UPDATE policies and do not grant table-level UPDATE.

- [ ] **Step 5: Rebuild only the local database and rerun the permission test**

Run:

```bash
bunx supabase db reset
bun test supabase/tests/commercial-soft-delete-rls.test.ts
```

Expected: PASS. The reset target must be the local loopback stack; stop if the command indicates a linked/remote target.

- [ ] **Step 6: Commit the schema boundary**

```bash
git add supabase/migrations/20260724110000_add_commercial_soft_delete_activity_kinds.sql supabase/migrations/20260724110001_add_commercial_soft_delete_columns.sql supabase/tests/commercial-soft-delete-rls.test.ts
git commit -m "feat: add commercial soft delete schema"
```

---

### Task 2: Implement active/deleted commercial-document queries and audited transitions

**Files:**
- Modify: `src/lib/data/commercial-documents.ts`
- Modify: `src/lib/data/commercial-documents.test.ts`
- Modify: `src/lib/data/commercial-items.ts`
- Modify: `src/lib/data/activity-log.ts`

**Interfaces:**
- Consumes: Task 1 columns and activity kinds
- Produces:
  - `listCommercialDocuments(options?: { deleted?: boolean }): Promise<CommercialDocumentWithItems[]>`
  - `getCommercialDocument(id: string, options?: { deleted?: boolean }): Promise<CommercialDocumentWithItems | null>`
  - `deleteCommercialDocument(id: string): Promise<void>`
  - `restoreCommercialDocument(id: string): Promise<void>`
  - `listCommercialItems(options?: { deleted?: boolean }): Promise<CommercialItem[]>`

- [ ] **Step 1: Extend adapter tests with active/deleted and revision-guard cases**

Import the four new interfaces and create a base Quotation plus a revision through the existing RPC. Then assert:

```ts
await deleteCommercialDocument(base.id);
expect((await listCommercialDocuments()).some((row) => row.id === base.id)).toBe(false);
expect(
  (await listCommercialDocuments({ deleted: true })).some(
    (row) => row.id === base.id,
  ),
).toBe(true);

await restoreCommercialDocument(base.id);
expect((await listCommercialDocuments()).some((row) => row.id === base.id)).toBe(true);
expect(
  (await listCommercialDocuments({ deleted: true })).some(
    (row) => row.id === base.id,
  ),
).toBe(false);
```

For the revision guard, try deleting the superseded base after creating its revision and assert:

```ts
await expect(deleteCommercialDocument(base.id)).rejects.toThrow(
  "Quotation ini tidak dapat dihapus karena sudah memiliki revisi yang lebih baru.",
);
```

Query `activity_log` as `adminClient` and assert one deleted and one restored entry reference `commercial_document_id`.

- [ ] **Step 2: Run the focused test and verify the new functions are absent**

Run:

```bash
bun test src/lib/data/commercial-documents.test.ts
```

Expected: FAIL at TypeScript/import resolution for the missing functions.

- [ ] **Step 3: Add deletion metadata to the normalized type mapper**

Add to `CommercialDocumentWithItems`, `CommercialDocumentRow`, and `toDocument()`:

```ts
deletedAt: string | null;
deletedBy: string | null;
```

Map from:

```ts
deletedAt: row.deleted_at,
deletedBy: row.deleted_by,
```

- [ ] **Step 4: Add explicit query modes and a detail fetch**

Use one private query builder so normal reads cannot accidentally omit the filter:

```ts
type DeletedQuery = { deleted?: boolean };

function withDeletionFilter<T extends {
  is: (column: string, value: null) => T;
  not: (column: string, operator: string, value: null) => T;
}>(query: T, options: DeletedQuery): T {
  return options.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
}
```

Apply it to `listCommercialDocuments(options = {})` and `getCommercialDocument(id, options = {})`. The detail query must also use `.eq("id", id).maybeSingle()` and return `null` when the active/deleted mode does not match.

- [ ] **Step 5: Add audited delete and restore functions**

Authenticate once with `getCurrentActorId()`. Fetch the active target first to obtain `ownerId`, `clientId`, type, and document number. For delete, check the revision guard before mutation:

```ts
const { count, error: revisionError } = await supabase
  .from("commercial_documents")
  .select("id", { count: "exact", head: true })
  .eq("supersedes_document_id", id);
if (revisionError) throw revisionError;
if ((count ?? 0) > 0) {
  throw new Error(
    "Quotation ini tidak dapat dihapus karena sudah memiliki revisi yang lebih baru.",
  );
}
```

Then update exactly the target and require a returned row:

```ts
const { data, error } = await supabase
  .from("commercial_documents")
  .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
  .eq("id", id)
  .is("deleted_at", null)
  .select("id")
  .single();
if (error) throw error;
```

Call `logActivity()` with `commercial_document_deleted`. Restore uses the deleted detail query, sets both columns to `null`, and logs `commercial_document_restored`. Use document-specific Indonesian titles, e.g. `Quotation dihapus` and `Quotation dipulihkan`.

- [ ] **Step 6: Extend activity TypeScript unions and labels**

Add:

```ts
| "commercial_document_deleted"
| "commercial_document_restored"
| "sales_order_deleted"
| "sales_order_restored"
```

and labels:

```ts
commercial_document_deleted: "RFQ/Quotation Dihapus",
commercial_document_restored: "RFQ/Quotation Dipulihkan",
sales_order_deleted: "Sales Order Dihapus",
sales_order_restored: "Sales Order Dipulihkan",
```

- [ ] **Step 7: Keep the compatibility facade active-only by default**

Change only the signature and forwarding:

```ts
export async function listCommercialItems(
  options: { deleted?: boolean } = {},
): Promise<CommercialItem[]> {
  return (await listCommercialDocuments(options)).map(toCommercialItem);
}
```

Do not change existing callers; their default becomes active-only.

- [ ] **Step 8: Run focused commercial tests**

Run:

```bash
bun test src/lib/data/commercial-documents.test.ts src/lib/data/commercial-items.test.ts src/lib/data/activity-log.test.ts
```

Expected: PASS with no remote connection.

- [ ] **Step 9: Commit the commercial adapter**

```bash
git add src/lib/data/commercial-documents.ts src/lib/data/commercial-documents.test.ts src/lib/data/commercial-items.ts src/lib/data/activity-log.ts
git commit -m "feat: add audited commercial document soft delete"
```

---

### Task 3: Implement active/deleted Sales Order queries and audited transitions

**Files:**
- Modify: `src/lib/data/sales-orders.ts`
- Modify: `src/lib/data/sales-orders.test.ts`

**Interfaces:**
- Consumes: Task 1 columns and Task 2 activity kinds/helpers
- Produces:
  - `listSalesOrders(options?: { deleted?: boolean }): Promise<SalesOrderDocument[]>`
  - `getSalesOrder(id: string, options?: { deleted?: boolean }): Promise<SalesOrderDocument | null>`
  - `deleteSalesOrder(id: string): Promise<void>`
  - `restoreSalesOrder(id: string): Promise<void>`

- [ ] **Step 1: Add a failing Sales Order lifecycle test**

After creating a Sales Order, assert active/deleted visibility, restore, and the two activity entries:

```ts
await deleteSalesOrder(created.id);
expect((await listSalesOrders()).some((row) => row.id === created.id)).toBe(false);
expect(
  (await listSalesOrders({ deleted: true })).some(
    (row) => row.id === created.id,
  ),
).toBe(true);

await restoreSalesOrder(created.id);
expect((await listSalesOrders()).some((row) => row.id === created.id)).toBe(true);
```

Also assert `deleted_by` equals the authenticated Sales id after delete and both deletion columns are null after restore.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun test src/lib/data/sales-orders.test.ts
```

Expected: FAIL because the new interfaces do not exist.

- [ ] **Step 3: Extend Sales Order types and query modes**

Add `deletedAt` and `deletedBy` to `SalesOrderDocument`, `SalesOrderRow`, and `toSalesOrder()`. Apply `.is("deleted_at", null)` to default list/detail reads and `.not("deleted_at", "is", null)` only when `{ deleted: true }`.

- [ ] **Step 4: Implement audited delete and restore**

Use the same authenticated-actor and exact-row pattern as Task 2. Delete writes:

```ts
{ deleted_at: new Date().toISOString(), deleted_by: actorId }
```

and logs:

```ts
await logActivity({
  kind: "sales_order_deleted",
  ownerId: order.ownerId,
  actorId,
  clientId: order.clientId,
  salesOrderId: order.id,
  title: "Sales Order dihapus",
  detail: order.soNumber,
});
```

Restore reads through `{ deleted: true }`, clears both fields, and logs `sales_order_restored`. Do not add a revision/dependency check for Sales Orders.

- [ ] **Step 5: Run focused adapter tests**

Run:

```bash
bun test src/lib/data/sales-orders.test.ts src/lib/data/activity-log.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the Sales Order adapter**

```bash
git add src/lib/data/sales-orders.ts src/lib/data/sales-orders.test.ts
git commit -m "feat: add audited sales order soft delete"
```

---

### Task 4: Add role-safe delete controls to commercial and Sales Order detail pages

**Files:**
- Create: `src/components/commercial/SoftDeleteConfirmDialog.tsx`
- Create: `src/components/commercial/SoftDeleteConfirmDialog.test.tsx`
- Modify: `src/components/commercial/CommercialDetailPage.tsx`
- Modify: `src/routes/_app.sales-orders.$soId.tsx`

**Interfaces:**
- Consumes: `deleteCommercialDocument(id)` and `deleteSalesOrder(id)` from Tasks 2–3
- Produces: a shared confirmation dialog accepting `label`, `open`, `busy`, `error`, `onOpenChange`, and `onConfirm`

- [ ] **Step 1: Write failing component contract tests**

Render the dialog and assert it does not call `onConfirm` on cancel, calls it once on confirmation, disables actions while `busy`, and renders a supplied revision-guard error:

```tsx
render(
  <SoftDeleteConfirmDialog
    label="Quotation DSM-26QUO-0001"
    open
    busy={false}
    error="Quotation ini tidak dapat dihapus karena sudah memiliki revisi yang lebih baru."
    onOpenChange={() => {}}
    onConfirm={onConfirm}
  />,
);
expect(screen.getByText(/tidak dapat dihapus/)).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Hapus" }));
expect(onConfirm).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
bun test src/components/commercial/SoftDeleteConfirmDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the shared AlertDialog**

Use `src/components/ui/alert-dialog.tsx`. Copy must explicitly say the record can be restored and no permanent deletion occurs. Use `AlertDialogCancel` with `Batal` and a destructive `AlertDialogAction` with `Hapus`.

- [ ] **Step 4: Wire commercial detail delete permission and behavior**

In `CommercialDetailPage`, derive:

```ts
const canDelete =
  role === "manager" ||
  role === "super_admin" ||
  (role === "sales" && item.ownerId === currentUserId);
```

Never render the button for Executive. On success:

```ts
await deleteCommercialDocument(item.id);
await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
navigate({ to: backHref });
```

Keep the dialog open and display the thrown message when the revision guard rejects deletion.

- [ ] **Step 5: Wire Sales Order detail delete permission and behavior**

Reuse the existing `canEditOwnSo` boundary. On success invalidate `["sales-orders"]` and `["activity-log"]`, then navigate to `/sales-orders`. Do not alter tax/header/item edit permissions.

- [ ] **Step 6: Run tests, typecheck, and targeted lint**

Run:

```bash
bun test src/components/commercial/SoftDeleteConfirmDialog.test.tsx
bunx tsc --noEmit
bunx eslint src/components/commercial/SoftDeleteConfirmDialog.tsx src/components/commercial/CommercialDetailPage.tsx 'src/routes/_app.sales-orders.$soId.tsx'
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit detail controls**

```bash
git add src/components/commercial/SoftDeleteConfirmDialog.tsx src/components/commercial/SoftDeleteConfirmDialog.test.tsx src/components/commercial/CommercialDetailPage.tsx 'src/routes/_app.sales-orders.$soId.tsx'
git commit -m "feat: add soft delete controls to document details"
```

---

### Task 5: Add deleted-list modes and restore actions

**Files:**
- Modify: `src/components/commercial/CommercialViews.tsx`
- Modify: `src/routes/_app.sales-orders.index.tsx`
- Create: `src/components/commercial/CommercialViews.test.tsx`
- Create: `src/routes/_app.sales-orders.index.test.tsx`

**Interfaces:**
- Consumes: `{ deleted: true }` list modes and restore functions from Tasks 2–3
- Produces: role-gated “Show deleted” modes that never share cache keys with active lists

- [ ] **Step 1: Write failing role and cache-key tests**

For `CommercialViews`, assert:

```tsx
expect(screen.queryByLabelText("Show deleted")).not.toBeInTheDocument(); // Executive
expect(screen.getByLabelText("Show deleted")).toBeInTheDocument(); // Sales
```

After toggling, assert the query uses `["commercial-items", "deleted"]`, shows a `Restore` button, and restore invalidates both exact list families. For Sales Orders, assert deleted mode uses `["sales-orders", "deleted"]`, not `["sales-orders", "all"]`.

- [ ] **Step 2: Run the new UI tests and verify they fail**

Run:

```bash
bun test src/components/commercial/CommercialViews.test.tsx src/routes/_app.sales-orders.index.test.tsx
```

Expected: FAIL because deleted modes and restore actions do not exist.

- [ ] **Step 3: Add commercial deleted mode without contaminating active caches**

Add `showDeleted` state and a separate query:

```ts
const deletedItems = useQuery({
  queryKey: ["commercial-items", "deleted"],
  queryFn: () => listCommercialItems({ deleted: true }),
  enabled: authReady && role !== "executive" && showDeleted,
});
const allItems = showDeleted ? (deletedItems.data ?? []) : activeItems;
```

The `Switch` labeled `Show deleted` is rendered only when `role !== "executive"`. In deleted mode, replace the detail arrow with `Restore`; after `restoreCommercialDocument(id)`, invalidate `["commercial-items", "all"]`, `["commercial-items", "deleted"]`, and `["activity-log"]`.

- [ ] **Step 4: Add Sales Order deleted mode**

Keep `useDashboardData().orders` as the active source so dashboard/report behavior is unchanged. Add a deleted-only query to the route:

```ts
const deletedOrders = useQuery({
  queryKey: ["sales-orders", "deleted"],
  queryFn: () => listSalesOrders({ deleted: true }),
  enabled: role !== "executive" && showDeleted,
});
const sourceOrders = showDeleted ? (deletedOrders.data ?? []) : orders;
```

Run the existing report filters against `sourceOrders`. In deleted mode, exports must be hidden to avoid presenting deleted revenue as a normal report, and each row receives `Restore`. After restore, invalidate `["sales-orders", "all"]`, `["sales-orders", "deleted"]`, and `["activity-log"]`.

- [ ] **Step 5: Run UI tests and the full local verification suite**

Run:

```bash
bun test src/components/commercial/CommercialViews.test.tsx src/routes/_app.sales-orders.index.test.tsx
bun run test
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all commands exit 0. If the full suite requires local Supabase, start only the local stack and confirm `SUPABASE_URL` resolves to `127.0.0.1:54321`.

- [ ] **Step 6: Browser-verify all roles against local Supabase**

Start the app only with a local Supabase environment. Verify:

1. Sales deletes and restores their own RFQ, Quotation, and Sales Order.
2. Sales never receives a control for another owner’s record.
3. Manager and Super Admin delete/restore another owner’s records.
4. Executive sees no delete, restore, or “Show deleted” control.
5. A superseded Quotation displays the guard error and remains visible.
6. Deleted records disappear from normal RFQ/Quotation/Sales Order lists, dashboard, reports, pipeline, tasks, activity relationship views, and Client Detail.
7. Restored records return to normal views.
8. Activity Log contains the matching delete/restore event.

Capture the exact disposable fixture IDs and clean up only those local QA rows in foreign-key-safe order; never perform cleanup against a linked/remote project.

- [ ] **Step 7: Commit the list/restore experience**

```bash
git add src/components/commercial/CommercialViews.tsx src/components/commercial/CommercialViews.test.tsx src/routes/_app.sales-orders.index.tsx src/routes/_app.sales-orders.index.test.tsx
git commit -m "feat: add deleted document restore views"
```

---

### Task 6: Final regression and documentation reconciliation

**Files:**
- Modify: `HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-07-24-soft-delete-rfq-quotation-sales-order-design.md`

**Interfaces:**
- Consumes: verified commits and test evidence from Tasks 1–5
- Produces: an accurate operational handoff that distinguishes local, pushed, and remote-applied state

- [ ] **Step 1: Re-run the release gate from a clean worktree**

Run:

```bash
git status --short --branch
bun run test
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all verification commands pass; only the intended documentation files may remain modified after the test run.

- [ ] **Step 2: Record implementation truth**

Update the design status from `Disetujui` to `Diimplementasikan dan diverifikasi secara lokal` only if Tasks 1–5 and browser verification passed. Update `HANDOFF.md` with:

- exact commit hashes,
- exact test counts/commands,
- browser roles and flows verified,
- whether commits are pushed,
- whether migrations are local-only or explicitly applied remotely,
- any residual limitation.

Do not claim remote migration application unless it was separately authorized and confirmed.

- [ ] **Step 3: Commit documentation**

```bash
git add HANDOFF.md docs/superpowers/specs/2026-07-24-soft-delete-rfq-quotation-sales-order-design.md
git commit -m "docs: record soft delete verification"
```

- [ ] **Step 4: Confirm final repository state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
```

Expected: clean worktree and a linear sequence of the feature commits. Push only when the owner has requested it; remote Supabase remains a separate approval boundary from Git push.
