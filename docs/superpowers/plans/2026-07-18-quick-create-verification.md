# Quick Create Label Fix and Verification Implementation Plan

> **Historical completed plan.** The constraints below describe the label/verification task at execution time. They do not block the accepted Phase 11 schema, form, numbering, revision, or grouped-view work documented in ADR-001 and the current commercial design.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Sales Order Quick Create label and prove all six global Quick Create flows persist correctly to local Supabase without leaving QA data.

**Architecture:** `TopBar.tsx` will own one typed menu configuration and render all six dropdown items from it. A Bun contract test will lock the exact kind-label pairs. Browser verification will submit uniquely marked records against `127.0.0.1:54321`, verify them through local Postgres, and remove them by exact client ID.

**Tech Stack:** React 19, TanStack Start, TypeScript, Bun test, Radix UI, local Supabase/Postgres, Chrome browser control.

## Global Constraints

- The exact Sales Order menu label is `Record Sales Order`.
- Keep exactly six existing Quick Create kinds: `followup`, `client`, `rfq`, `quotation`, `so`, and `prototype`.
- Do not change dialog fields, validation, schema, migrations, RLS, or list/detail grouping.
- Use only the local Supabase URL configured in `.env.local`; do not run `supabase link`, `supabase db push`, or any remote mutation.
- QA rows use the exact marker `QA-QC-20260718-IMPLEMENTATION` and are deleted by captured client ID.
- Do not initialize Git or commit because this Lovable-connected folder has no `.git` directory.

---

## File Structure

- Create `src/components/shell/TopBar.test.ts`: exact menu-contract regression test.
- Modify `src/components/shell/TopBar.tsx`: export typed configuration and render the dropdown from it.
- No database, migration, or application-data file changes.

### Task 1: Lock and Correct the Quick Create Menu Contract

**Files:**

- Create: `src/components/shell/TopBar.test.ts`
- Modify: `src/components/shell/TopBar.tsx:38-116`

**Interfaces:**

- Produces: `QUICK_CREATE_ITEMS`, a readonly array of `{ kind: QuickCreateKind; label: string }`.
- Preserves: `setQuickCreate(kind)` and the six existing dialog-open conditions.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from "bun:test";

import * as TopBarModule from "./TopBar";

type QuickCreateItem = { kind: string; label: string };

describe("Quick Create menu", () => {
  test("exposes the six approved kind-label pairs", () => {
    const items = (
      TopBarModule as unknown as {
        QUICK_CREATE_ITEMS?: readonly QuickCreateItem[];
      }
    ).QUICK_CREATE_ITEMS;

    expect(items).toEqual([
      { kind: "followup", label: "New Follow Up" },
      { kind: "client", label: "New Client" },
      { kind: "rfq", label: "New RFQ" },
      { kind: "quotation", label: "New Quotation" },
      { kind: "so", label: "Record Sales Order" },
      { kind: "prototype", label: "New Prototype Request" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bun --env-file=.env.local test src/components/shell/TopBar.test.ts
```

Expected: one assertion failure because `QUICK_CREATE_ITEMS` is currently `undefined`.

- [ ] **Step 3: Add the typed configuration**

Add below `QuickCreateKind` in `TopBar.tsx`:

```ts
export const QUICK_CREATE_ITEMS = [
  { kind: "followup", label: "New Follow Up" },
  { kind: "client", label: "New Client" },
  { kind: "rfq", label: "New RFQ" },
  { kind: "quotation", label: "New Quotation" },
  { kind: "so", label: "Record Sales Order" },
  { kind: "prototype", label: "New Prototype Request" },
] as const satisfies readonly {
  kind: QuickCreateKind;
  label: string;
}[];
```

Replace the six hardcoded `<DropdownMenuItem>` blocks with:

```tsx
{
  QUICK_CREATE_ITEMS.map((item) => (
    <DropdownMenuItem
      key={item.kind}
      onSelect={() => setQuickCreate(item.kind)}
    >
      {item.label}
    </DropdownMenuItem>
  ));
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun --env-file=.env.local test src/components/shell/TopBar.test.ts
```

Expected: `1 pass`, `0 fail`.

- [ ] **Step 5: Run targeted static checks**

Run:

```bash
bunx eslint src/components/shell/TopBar.tsx src/components/shell/TopBar.test.ts
bunx tsc --noEmit
```

Expected: targeted ESLint exits 0. Record the TypeScript result exactly; do not describe it as clean if the two known `CommercialViews.tsx` errors remain.

### Task 2: Verify All Six Quick Create Flows Against Local Supabase

**Files:** None.

**Interfaces:**

- Consumes: the six dropdown items and existing dialog submit functions.
- Produces temporarily: one QA client plus follow-up, RFQ, quotation, Sales Order, prototype, and activity rows identified by the exact marker.

- [ ] **Step 1: Confirm local-only safety and record baseline counts**

Confirm `.env.local` classifies `VITE_SUPABASE_URL` as local without printing keys. Then run:

```bash
docker exec supabase_db_DSM_SALES_WEB_APP_V2 psql -U postgres -d postgres -Atc "
select 'clients=' || count(*) from public.clients;
select 'follow_up_logs=' || count(*) from public.follow_up_logs;
select 'commercial_items=' || count(*) from public.commercial_items;
select 'sales_orders=' || count(*) from public.sales_orders;
select 'activity_log=' || count(*) from public.activity_log;
select 'existing_qa_clients=' || count(*) from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION';
"
```

Expected: the URL classification is `local`. If `existing_qa_clients` is not zero, stop and inspect those rows before testing.

- [ ] **Step 2: Open Quick Create and verify the menu contract visually**

Use the existing Chrome tab at `http://localhost:8081/pipeline`. Reload, open Quick Create, and verify exactly these six labels appear, with `Record Customer PO` absent:

```text
New Follow Up
New Client
New RFQ
New Quotation
Record Sales Order
New Prototype Request
```

- [ ] **Step 3: Submit New Client**

Use:

```text
Nama Klien: QA-QC-20260718-IMPLEMENTATION
Status: Prospect
Source: Referral
Owner: current local sales user (auto-assigned)
```

Expected: success toast `Klien berhasil ditambahkan` and the dialog closes.

- [ ] **Step 4: Submit New Follow Up for the QA client**

Use:

```text
Client: QA-QC-20260718-IMPLEMENTATION
Method: Phone
Result: Interested
Date: 2026-07-18
Notes: QA-QC-20260718-IMPLEMENTATION follow-up verification
```

Expected: success toast `Follow up tercatat` and the dialog closes.

- [ ] **Step 5: Submit New RFQ for the QA client**

Use:

```text
Client: QA-QC-20260718-IMPLEMENTATION
RFQ number: QA-RFQ-20260718
Stage: RFQ Received
Description: QA-QC-20260718-IMPLEMENTATION RFQ bracket
Qty: 2
Unit price: 15000
```

Expected: success toast `RFQ dibuat`; persisted `estimated_value` is `30000`.

- [ ] **Step 6: Submit New Quotation for the QA client**

Use:

```text
Client: QA-QC-20260718-IMPLEMENTATION
Quotation number: QA-QUO-20260718
Stage: Quotation Sent
Description: QA-QC-20260718-IMPLEMENTATION quotation bracket
Qty: 3
Unit price: 20000
```

Expected: success toast `Quotation dibuat`; persisted `estimated_value` is `60000`.

- [ ] **Step 7: Submit Record Sales Order for the QA client**

Use:

```text
Client: QA-QC-20260718-IMPLEMENTATION
SO number: QA-SO-20260718
Type: Regular
Tax: PPN
Source: Existing / Repeat Order
Date: 2026-07-18
Qty: 4
Unit price: 25000
```

Expected: success toast `Sales Order dicatat`; persisted `value` is `100000`.

- [ ] **Step 8: Submit New Prototype Request for the QA client**

Use:

```text
Client: QA-QC-20260718-IMPLEMENTATION
Description: QA-QC-20260718-IMPLEMENTATION prototype request
Estimated value: 125000
```

Expected: success toast `Prototype Request dibuat` and one matching `commercial_items` row.

- [ ] **Step 9: Inspect browser errors and verify persisted rows**

Read console messages at `error` and `warn` level and report any finding. Run:

```bash
docker exec supabase_db_DSM_SALES_WEB_APP_V2 psql -U postgres -d postgres -P pager=off -c "
select id, name, status, source from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION';
select fu_date, method, result, notes from public.follow_up_logs where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION');
select type, rfq_number, quotation_number, description, qty, unit_price, estimated_value from public.commercial_items where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION') order by created_at;
select so_number, type, tax_type, source, qty, unit_price, value from public.sales_orders where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION');
select kind, title, detail from public.activity_log where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION') order by created_at;
"
```

Expected: one client, one follow-up, RFQ and quotation plus prototype commercial rows, one Sales Order, and their activity entries with the exact values above.

- [ ] **Step 10: Delete only the captured QA graph in foreign-key-safe order**

Run this against the local container only:

```bash
docker exec supabase_db_DSM_SALES_WEB_APP_V2 psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
begin;
delete from public.activity_log
where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION');
delete from public.follow_up_logs
where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION');
delete from public.sales_orders
where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION');
delete from public.commercial_items
where client_id = (select id from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION');
delete from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION';
commit;
SQL
```

- [ ] **Step 11: Verify cleanup and compare baseline counts**

Run the same count query from Step 1 plus:

```sql
select count(*) from public.clients where name = 'QA-QC-20260718-IMPLEMENTATION';
select count(*) from public.follow_up_logs where notes like 'QA-QC-20260718-IMPLEMENTATION%';
select count(*) from public.commercial_items where description like 'QA-QC-20260718-IMPLEMENTATION%';
select count(*) from public.sales_orders where so_number = 'QA-SO-20260718';
select count(*) from public.activity_log where title like '%QA-%' or detail like 'QA-QC-20260718-IMPLEMENTATION%';
```

Expected: all targeted counts are `0`; table counts equal the recorded baseline.

### Task 3: Run the Final Verification Matrix

**Files:** No additional changes expected.

- [ ] **Step 1: Run the focused regression test**

```bash
bun --env-file=.env.local test src/components/shell/TopBar.test.ts
```

Expected: `1 pass`, `0 fail`.

- [ ] **Step 2: Run the complete test suite**

```bash
bun run test
```

Expected: all tests pass with `0 fail`.

- [ ] **Step 3: Run targeted lint and TypeScript**

```bash
bunx eslint src/components/shell/TopBar.tsx src/components/shell/TopBar.test.ts
bunx tsc --noEmit
```

Expected: targeted lint exits 0. Report TypeScript's actual exit status and exact remaining file locations.

- [ ] **Step 4: Run the production build**

```bash
bun run build
```

Expected: exit 0.

- [ ] **Step 5: Report evidence and unresolved issues**

Report the label before/after, RED and GREEN test evidence, six browser submissions, database values, cleanup proof, test count, lint/typecheck/build results, and any console/network findings. Do not claim grouped list/detail work was performed.
