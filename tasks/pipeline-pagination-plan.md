# Implementation Plan: Stage 3 Pipeline Pagination

**Spec:** `docs/superpowers/specs/2026-08-05-pipeline-pagination-design.md`  
**Created:** 2026-08-05  
**Status:** Ready for execution

---

## Task 1: Database Migration — pipeline_metrics RPC

**File:** `supabase/migrations/20260805120000_add_pipeline_metrics_rpc.sql`

Create the aggregate RPC following `task_control_loop_metrics` pattern:

```sql
-- Migration: add_pipeline_metrics_rpc
--
-- Stage 3 pagination: aggregate metrics for Pipeline header/analytics,
-- replacing client-side computation from unbounded full-list fetch.

create or replace function public.pipeline_metrics(
  p_owner_id uuid default null,
  p_client_status public.client_status default null
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
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    cd.stage::text,
    count(*)::bigint as item_count,
    coalesce(sum(items_total.total_value), 0)::numeric as total_value,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage not in ('Closed Won', 'Closed Lost')
    ), 0)::numeric as open_value,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage = 'Closed Won'
    ), 0)::numeric as won_value,
    coalesce(sum(items_total.total_value) filter (
      where cd.stage = 'Closed Lost'
    ), 0)::numeric as lost_value,
    count(*) filter (where cd.stage = 'Closed Won')::bigint as won_count,
    count(*) filter (where cd.stage = 'Closed Lost')::bigint as lost_count
  from public.commercial_documents cd
  cross join lateral (
    select coalesce(sum(cdi.line_total), 0) as total_value
    from public.commercial_document_items cdi
    where cdi.commercial_document_id = cd.id
  ) items_total
  left join public.clients c on c.id = cd.client_id
  where cd.deleted_at is null
    and cd.type != 'RFQ'
    and (cd.type != 'Quotation' or cd.is_current_revision = true)
    and (p_owner_id is null or cd.owner_id = p_owner_id)
    and (p_client_status is null or c.status = p_client_status)
  group by cd.stage;
end;
$$;

comment on function public.pipeline_metrics(uuid, public.client_status) is
'Aggregate Pipeline metrics per stage for Stage 3 pagination. Replaces client-side computation from unbounded commercial_documents fetch. Excludes superseded Quotation revisions and soft-deleted documents.';

grant execute on function public.pipeline_metrics(uuid, public.client_status)
  to authenticated;

revoke execute on function public.pipeline_metrics(uuid, public.client_status)
  from anon, public;
```

**Verification:**

- `bunx supabase db reset` applies cleanly
- Query with seeded data returns sensible per-stage counts
- Query with `p_owner_id` filter returns subset
- Query with `p_client_status` filter returns subset
- Superseded Quotation revision (if any in seed) not counted

---

## Task 2: Data Layer — Paginated Commercial Documents Query

**File:** `src/lib/data/commercial-documents.ts` (modify)

Add paginated query function:

```typescript
export type CommercialDocumentPageFilters = {
  stage?: string;
  ownerId?: string;
  clientStatus?: string;
};

export type CommercialDocumentPage = {
  rows: CommercialDocumentWithItems[];
  totalCount: number;
  nextCursor: string | null;
};

export async function listCommercialDocumentsPage(input: {
  filters?: CommercialDocumentPageFilters;
  page?: ListPageInput;
}): Promise<CommercialDocumentPage>;
```

Implementation:

- Keyset cursor on `updated_at DESC, id DESC`
- `.eq("stage", filters.stage)` when provided
- `.eq("owner_id", filters.ownerId)` when provided
- `.eq("is_current_revision", true)` when filtering for Quotation stages (or add explicit filter param)
- Join to `clients` for `client_status` filter when provided
- `.is("deleted_at", null)`
- `.neq("type", "RFQ")`
- Limit `pageSize + 1`

**File:** `src/lib/data/commercial-items.ts` (modify)

Add convenience wrapper that returns `CommercialItem[]` from paginated query (for backward compatibility with existing consumers).

---

## Task 3: Data Layer — Pipeline Metrics RPC Wrapper

**File:** `src/lib/data/pipeline-metrics.ts` (new)

```typescript
import { supabase } from "@/lib/supabase";
import type { ClientStatus } from "@/lib/domain";

export type PipelineMetricsFilters = {
  ownerId?: string;
  clientStatus?: ClientStatus;
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
    winRate: number;
  };
};

export async function getPipelineMetrics(
  filters?: PipelineMetricsFilters,
): Promise<PipelineMetrics>;
```

---

## Task 4: UI — Pipeline Route Per-Stage Queries

**File:** `src/routes/_app.pipeline.tsx` (major refactor)

Replace single `useQuery(["commercial-items", "all"])` with:

1. 6 per-stage `useQuery` calls using `listQueryKey("commercial-documents", "page", ...)`
2. 1 aggregate `useQuery` using `listQueryKey("commercial-documents", "aggregate", ...)`
3. `stageCursors` state for "load more" per column
4. `loadMore(stage)` handler

Key changes:

- Remove `filtered` memo — filtering now server-side
- Remove `grouped` memo — derive from stage query results
- Update `nextByItem` to work across loaded pages
- Update `handleDrop` to find item from stage pages
- Update `confirmMove` invalidation to cover all stage queries + aggregate
- Update `PipelineAnalytics` prop from `items={filtered}` to `metrics={metricsData}`

---

## Task 5: UI — PipelineAnalytics Consume RPC Data

**File:** `src/components/pipeline/PipelineAnalytics.tsx` (modify)

Change props from `items: Item[]` to `metrics: PipelineMetrics`:

- KPI tiles read from `metrics.totals`
- Stage breakdown reads from `metrics.stages`
- Owner performance: keep client-side from loaded items for v1 (documented), or extend RPC later

---

## Task 6: Tests

**Database test:** `src/lib/data/__tests__/pipeline-metrics.test.ts`

- RPC returns correct shape
- Respects filters
- Excludes superseded revisions

**Unit test:** `src/lib/data/__tests__/commercial-documents-pagination.test.ts`

- Cursor encode/decode round-trip
- Page boundary detection
- Filter application

**Browser E2E:** Manual verification

- Load Pipeline, verify bounded stage columns
- Click "Load more", verify additional items
- Verify header summary matches
- Drag-and-drop between stages
- Filter by owner/status

---

## Task 7: Verification & Documentation

1. Run full verification suite:

   ```bash
   bunx supabase db reset
   bun run test
   bun run typecheck
   bun run lint
   bun run build
   ```

2. Run performance baseline:

   ```bash
   bun run stage3:baseline
   ```

   Compare `commercial_documents` metrics before/after.

3. Update checklist:
   - Check off "Paginate commercial documents/Pipeline with server filters and stable order"
   - Add dated verification note

4. Update HANDOFF.md with session closeout.

---

## Execution Order

```
Task 1 (migration) → Task 2 (data layer) → Task 3 (RPC wrapper)
    ↓
Task 4 (pipeline route) → Task 5 (analytics component)
    ↓
Task 6 (tests) → Task 7 (verification)
```

Tasks 2 and 3 can be done in parallel. Tasks 4 and 5 can be done in parallel after 2+3.
