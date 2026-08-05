# Spec: Stage 3 Pipeline Pagination with Server Filters

**Status:** APPROVED — Owner decision 2026-08-05  
**Stage:** 3 — Data and Performance  
**Feature:** commercial_documents/Pipeline pagination  
**Design:** Bounded per-stage keyset load + Aggregate RPC (Opsi A)

---

## 1. Objective

Paginate the Pipeline kanban board (`_app.pipeline.tsx`) with bounded per-stage server queries and move summary statistics to a server aggregate RPC. Fix the superseded-Quotation-revision data-correctness bug in the same pass.

---

## 2. Tech Stack

- **Database:** Supabase Postgres 17.6, new RPC + migration
- **Data layer:** `src/lib/data/commercial-documents.ts` extension, `src/lib/pagination-contracts.ts` reuse
- **UI:** `src/routes/_app.pipeline.tsx`, `src/components/pipeline/PipelineAnalytics.tsx`
- **Pattern references:** `listClientRowsPage` (keyset pagination), `task_control_loop_metrics` (aggregate RPC)

---

## 3. Commands

```bash
# Local dev
bun run dev                    # port 8080

# Database
bunx supabase start            # local Supabase
bunx supabase db reset         # apply migrations locally

# Verification
bun run test                   # full test suite
bun run typecheck              # tsc --noEmit
bun run lint                   # ESLint
bun run build                  # production build
bun run stage3:baseline        # performance baseline (post-change)
```

---

## 4. Project Structure (new/modified files)

```
supabase/migrations/
  20260805120000_add_pipeline_metrics_rpc.sql          # NEW: aggregate RPC

src/lib/data/
  commercial-documents.ts                              # MOD: add paginated query
  pipeline-metrics.ts                                  # NEW: RPC wrapper + types

src/routes/
  _app.pipeline.tsx                                    # MOD: per-stage queries + aggregate

src/components/pipeline/
  PipelineAnalytics.tsx                                # MOD: consume RPC data, not client compute

src/lib/
  pagination-contracts.ts                              # REUSE: existing keyset/cursor

src/lib/data/__tests__/
  pipeline-metrics.test.ts                             # NEW: RPC tests
  commercial-documents-pagination.test.ts              # NEW: pagination tests
```

---

## 5. Scope

### 5.1 Database Migration

**File:** `supabase/migrations/20260805120000_add_pipeline_metrics_rpc.sql`

Create `public.pipeline_metrics()` RPC:

```sql
create or replace function public.pipeline_metrics(
  p_owner_id uuid default null,
  p_client_status public.client_status default null,
  p_next_window text default null  -- 'overdue' | 'today' | 'week' | 'none' | null
)
returns table (
  stage text,
  item_count bigint,
  total_value numeric,
  open_value numeric,
  won_value numeric,
  lost_value numeric,
  won_count bigint,
  lost_count bigint
)
```

**Semantics:**

- `stage`: one of `COMMERCIAL_STAGES` (Quotes Sent, Negotiation, Hot Prospect, Commit, Closed Won, Closed Lost)
- `item_count`: documents in this stage matching filters
- `total_value`: sum of `total_value` (from `commercial_document_items.line_total`) for this stage
- `open_value`: same as `total_value` for non-final stages; 0 for Closed Won/Lost
- `won_value`: `total_value` where stage = 'Closed Won'
- `lost_value`: `total_value` where stage = 'Closed Lost'
- `won_count`/`lost_count`: count for win-rate calculation

**Filters:**

- `p_owner_id`: filter by `commercial_documents.owner_id`
- `p_client_status`: filter by `clients.status` (join)
- `p_next_window`: filter by earliest active task due date (computed via `activeCommercialTasks` equivalent logic — may need helper or document as limitation)

**Revision filter (bug fix):**

- Only count `is_current_revision = true` for Quotations
- `type != 'Quotation'` rows always counted regardless of revision flag

**Security:**

- `security definer`, `set search_path = ''`
- RLS already scopes rows; aggregate RPC runs as definer but respects RLS on underlying tables
- Grant `execute` to `authenticated`, revoke from `anon`/`public`

### 5.2 Data Layer: Paginated Commercial Documents

**File:** `src/lib/data/commercial-documents.ts`

Add:

```typescript
export type CommercialDocumentPageFilters = {
  stage?: CommercialStage;
  ownerId?: string;
  clientStatus?: ClientStatus;
  // nextWindow filter TBD — may stay client-side post-filter for v1
};

export type CommercialDocumentPage = {
  rows: CommercialDocumentWithItems[];
  totalCount: number; // per-stage count from RPC, not from query
  nextCursor: string | null;
};

export async function listCommercialDocumentsPage(input: {
  filters?: CommercialDocumentPageFilters;
  page?: ListPageInput;
}): Promise<CommercialDocumentPage>;
```

**Query shape:**

- Keyset cursor on `updated_at DESC, id DESC` (most recently active first)
- `.eq("stage", filters.stage)` when provided
- `.eq("owner_id", filters.ownerId)` when provided
- `.eq("is_current_revision", true)` when `type = 'Quotation'` — the bug fix
- Join to `clients` for `client_status` filter when provided
- Limit `pageSize + 1` for cursor detection

### 5.3 Data Layer: Pipeline Metrics RPC Wrapper

**File:** `src/lib/data/pipeline-metrics.ts`

```typescript
export type PipelineMetricsFilters = {
  ownerId?: string;
  clientStatus?: ClientStatus;
  nextWindow?: "overdue" | "today" | "week" | "none";
};

export type PipelineStageMetrics = {
  stage: string;
  itemCount: number;
  totalValue: number;
  openValue: number;
  wonValue: number;
  lostValue: number;
  wonCount: number;
  lostCount: number;
};

export type PipelineMetrics = {
  stages: PipelineStageMetrics[];
  totals: {
    itemCount: number;
    totalValue: number;
    openValue: number;
    wonValue: number;
    lostValue: number;
    wonCount: number;
    lostCount: number;
    winRate: number; // wonCount / (wonCount + lostCount) * 100
  };
};

export async function getPipelineMetrics(
  filters?: PipelineMetricsFilters,
): Promise<PipelineMetrics>;
```

### 5.4 UI: Pipeline Route

**File:** `src/routes/_app.pipeline.tsx`

**Current:**

```typescript
const { data: items = [] } = useQuery({
  queryKey: ["commercial-items", "all"],
  queryFn: listCommercialItems,
});
```

**New:**

```typescript
// Per-stage queries (6 queries, can be parallel)
const stageQueries = STAGES.map((stage) =>
  useQuery({
    queryKey: listQueryKey("commercial-documents", "page", {
      filters: { stage, ownerId, clientStatus },
      page: { pageSize: 50, cursor: stageCursors[stage] },
    }),
    queryFn: () =>
      listCommercialDocumentsPage({
        filters: { stage, ownerId, clientStatus },
        page: { pageSize: 50, cursor: stageCursors[stage] },
      }),
    enabled: authReady,
  }),
);

// Aggregate query
const { data: metrics } = useQuery({
  queryKey: listQueryKey("commercial-documents", "aggregate", {
    filters: { ownerId, clientStatus, nextWindow },
  }),
  queryFn: () => getPipelineMetrics({ ownerId, clientStatus, nextWindow }),
  enabled: authReady,
});
```

**State changes:**

- Replace `items: CommercialItem[]` with `stagePages: Map<Stage, CommercialDocumentPage>`
- Add `stageCursors: Record<Stage, string | null>` for "load more"
- Add `loadMore(stage)` handler
- `grouped` computed from loaded stage pages (for rendering)
- `filtered` removed — filtering now server-side

**Drag-and-drop:**

- Only loaded cards are draggable
- `handleDrop` looks up item from `stagePages.get(fromStage)?.rows.find(...)`
- After `transitionCommercialStage` success: invalidate all stage queries + aggregate query

### 5.5 UI: PipelineAnalytics

**File:** `src/components/pipeline/PipelineAnalytics.tsx`

**Current:** Computes from `items: Item[]` prop

**New:** Accepts `metrics: PipelineMetrics` prop, renders from RPC data

```typescript
export function PipelineAnalytics({
  metrics,
  showOwners,
  ownerById = {},
}: {
  metrics: PipelineMetrics;
  showOwners: boolean;
  ownerById?: Record<string, { name: string }>;
});
```

- KPI tiles: `metrics.totals`
- Stage breakdown: `metrics.stages` (already includes count, value, share)
- Owner performance: needs separate per-owner breakdown — either extend RPC or keep client-side from loaded items for v1 (documented limitation)

### 5.6 Bug Fix: Superseded Quotation Revisions

**Current behavior:** Pipeline shows all Quotation revisions as separate cards; header summary counts them all.

**Fixed behavior:**

- `listCommercialDocumentsPage` filters `is_current_revision = true` for Quotations
- `pipeline_metrics` RPC filters `is_current_revision = true` for Quotations
- Only current revisions appear on board and count toward summary

**Out of scope:** `CommercialViews.tsx` (Quotations index) already has this filter; no change needed there.

---

## 6. Out of Scope

- Quotations Table/Board view pagination (`_app.quotations.index.tsx`) — later pass
- Sales Orders pagination — separate checklist item
- Tasks pagination — separate checklist item
- Activity log pagination — separate checklist item
- Real-time subscriptions — Stage 4
- Per-owner metrics breakdown in RPC — v1 keeps client-side from loaded items; extend RPC later if needed

---

## 7. Data Model/Schema Changes

**New RPC:** `public.pipeline_metrics(uuid, text, text)` returns `table(stage text, item_count bigint, total_value numeric, open_value numeric, won_value numeric, lost_value numeric, won_count bigint, lost_count bigint)`

**No table changes.**

---

## 8. UI/UX Changes

| Element             | Before                            | After                                |
| ------------------- | --------------------------------- | ------------------------------------ |
| Board load          | All 436+ items at once            | 50 per stage, "Load more" per column |
| Header summary      | Client-computed from loaded items | Server RPC, always accurate          |
| Quotation revisions | All shown, counted                | Only current revision shown/counted  |
| Filter behavior     | Client-side post-filter           | Server-side (owner, client status)   |
| Drag-and-drop       | Any card draggable                | Only loaded cards draggable          |

---

## 9. Security Considerations

- `pipeline_metrics` is `security definer` but queries RLS-protected tables — rows already scoped
- Grant `execute` to `authenticated` only; revoke from `anon`/`public` (same pattern as `task_control_loop_metrics`)
- No PII in aggregate results (counts and sums only)

---

## 10. Testing Strategy

### Unit Tests

- `pipeline-metrics.test.ts`: RPC wrapper parses response correctly
- `commercial-documents-pagination.test.ts`: cursor encode/decode, filter serialization, page boundary logic

### Database Tests

- `pipeline_metrics` returns correct counts/values with seeded data
- Respects owner filter
- Respects client status filter
- Excludes superseded Quotation revisions
- Excludes soft-deleted documents

### Browser E2E

- Pipeline loads with 6 stage columns, bounded item counts
- "Load more" fetches additional items per stage
- Header summary matches loaded items (reconciliation)
- Drag-and-drop between stages works for loaded items
- Filter by owner/status updates board and summary
- No console errors

---

## 11. Acceptance Criteria

- [ ] `bunx supabase db reset` applies new migration cleanly
- [ ] `bun run test` passes (existing + new)
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Pipeline board loads ≤ 50 items per stage initially
- [ ] "Load more" button appears when stage has > 50 items
- [ ] Header summary shows accurate totals from RPC
- [ ] Superseded Quotation revisions do not appear on board
- [ ] Superseded Quotation revisions do not count toward summary
- [ ] Drag-and-drop works between stages for loaded items
- [ ] Owner filter works server-side
- [ ] Client status filter works server-side
- [ ] `bun run stage3:baseline` shows improved `commercial_documents` metrics

---

## 12. Boundaries

- **Does not change:** `CommercialViews.tsx`, Quotations index route, Sales Orders, Tasks, Activity log
- **Does not add:** Real-time subscriptions, new table columns, new RLS policies
- **Does not remove:** Existing `listCommercialItems` (still used by Quotations view, Client Detail, etc.)
- **Defers:** Per-owner metrics RPC breakdown, `nextWindow` server-side filtering

---

## 13. Open Questions

None — all design decisions resolved with owner on 2026-08-05.

---

## 14. References

- Handoff: `HANDOFF.md` § Stage 3 Pipeline pagination (2026-08-05)
- Baseline: `docs/reports/2026-08-05-stage-3-performance-baseline.md`
- Checklist: `tasks/four-stage-stabilization-and-growth-todo.md` § Stage 3
- Pattern: `src/lib/data/clients.ts:listClientRowsPage`
- Pattern: `supabase/migrations/20260727150000_restrict_task_exception_visibility.sql:task_control_loop_metrics`
