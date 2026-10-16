import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { metricScopeSchema } from "@/lib/report-metric-scope";
import {
  forecastValuesMatch,
  reconcileForecastItems,
  type ForecastDrilldownItem,
} from "./forecast";

export { reconcileForecastItems } from "./forecast";

const numeric = z
  .union([z.number(), z.string()])
  .transform(Number)
  .pipe(z.number().finite());
const nullableNumeric = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => (value === null ? null : Number(value)))
  .pipe(z.number().finite().nullable());

const rawSnapshotSchema = z.object({
  snapshotMode: z.enum(["current", "historical_unavailable"]),
  period: z.object({ from: z.string(), to: z.string() }),
  asOfDate: z.string(),
  fetchedAt: z.string(),
  salesOrderValue: numeric,
  openPipelineValue: nullableNumeric,
  forecastValue: nullableNumeric,
  undated: z.object({ count: numeric, totalValue: numeric }),
  overdue: z.object({
    count: numeric,
    totalValue: numeric,
    weightedValue: numeric,
  }),
  page: z.object({
    limit: numeric,
    offset: numeric,
    totalCount: numeric,
    contributionValue: numeric,
  }),
  items: z.array(
    z.object({
      documentId: z.string(),
      quotationNumber: z.string(),
      clientId: z.string(),
      clientName: z.string(),
      ownerId: z.string(),
      ownerName: z.string(),
      stage: z.string(),
      expectedCloseDate: z.string().nullable(),
      totalValue: numeric,
      weight: numeric,
      weightedValue: numeric,
      bucket: z.enum(["scheduled", "overdue", "undated"]),
      contributes: z.boolean(),
    }),
  ),
});

export type ForecastSnapshot = Omit<
  z.infer<typeof rawSnapshotSchema>,
  "items"
> & { items: ForecastDrilldownItem[] };

export type ForecastScope = {
  from: string;
  to: string;
  ownerId?: string;
  clientId?: string;
};

export function normalizeForecastSnapshot(input: unknown): ForecastSnapshot {
  const snapshot = rawSnapshotSchema.parse(input) as ForecastSnapshot;
  if (snapshot.snapshotMode === "current") {
    const pageContribution = reconcileForecastItems(snapshot.items);
    if (
      snapshot.openPipelineValue === null ||
      snapshot.forecastValue === null ||
      !forecastValuesMatch(pageContribution, snapshot.page.contributionValue) ||
      (snapshot.page.offset === 0 &&
        snapshot.page.totalCount === snapshot.items.length &&
        !forecastValuesMatch(pageContribution, snapshot.openPipelineValue))
    ) {
      throw new Error("FORECAST_DRILLDOWN_MISMATCH");
    }
    if (
      !forecastValuesMatch(
        snapshot.salesOrderValue + snapshot.openPipelineValue,
        snapshot.forecastValue,
      )
    ) {
      throw new Error("FORECAST_TOTAL_MISMATCH");
    }
  } else if (
    snapshot.openPipelineValue !== null ||
    snapshot.forecastValue !== null ||
    snapshot.items.length !== 0 ||
    snapshot.page.totalCount !== 0
  ) {
    throw new Error("HISTORICAL_FORECAST_MUST_BE_UNAVAILABLE");
  }
  return snapshot;
}

export async function getForecastSnapshot(
  input: ForecastScope,
  page: { limit?: number; offset?: number } = {},
): Promise<ForecastSnapshot> {
  const scope = metricScopeSchema.parse(input);
  const { data, error } = await supabase.rpc("crm_forecast_snapshot", {
    p_from: scope.from,
    p_to: scope.to,
    p_owner_id: scope.ownerId ?? null,
    p_client_id: scope.clientId ?? null,
    p_limit: page.limit ?? 100,
    p_offset: page.offset ?? 0,
  });
  if (error) throw error;
  if (!data) throw new Error("Snapshot forecast tidak tersedia");
  return normalizeForecastSnapshot(data);
}
