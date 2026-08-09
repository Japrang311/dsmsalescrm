import { supabase } from "@/lib/supabase";

// Same loose filter shape as SalesOrdersMetricsFilters (minus from/to,
// deleted -- these RPCs are year-scoped, not date-range-scoped); "all" or
// omitted means "no filter". Shared by the Dashboard (year+owner only) and
// the Reports route's full filter bar.
export type SalesOrdersTrendFilters = {
  year?: number;
  ownerId?: string;
  clientId?: string;
  taxType?: string;
  soType?: string;
  source?: string;
};

function optional(value: string | undefined): string | null {
  return !value || value === "all" ? null : value;
}

export type MonthlyTrendPoint = { month: number; revenue: number };

type MonthlyTrendRow = { month: number; revenue: string };

export async function getSalesOrdersMonthlyTrend(
  filters: SalesOrdersTrendFilters = {},
): Promise<MonthlyTrendPoint[]> {
  const source = optional(filters.source);
  const { data, error } = await supabase.rpc("sales_orders_monthly_trend", {
    p_year: filters.year ?? null,
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
    p_tax_type: optional(filters.taxType),
    p_so_type: optional(filters.soType),
    p_source: source === "New Product" ? "RFQ / New Product" : source,
  });
  if (error) throw error;
  return ((data ?? []) as MonthlyTrendRow[])
    .map((row) => ({ month: Number(row.month), revenue: Number(row.revenue) }))
    .sort((a, b) => a.month - b.month);
}

export type OwnerYtdRevenue = { ownerId: string; revenue: number };

type OwnerYtdRow = { owner_id: string; revenue: string };

export async function getSalesOrdersOwnerYtd(
  filters: SalesOrdersTrendFilters = {},
): Promise<OwnerYtdRevenue[]> {
  const source = optional(filters.source);
  const { data, error } = await supabase.rpc("sales_orders_owner_ytd", {
    p_year: filters.year ?? null,
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
    p_tax_type: optional(filters.taxType),
    p_so_type: optional(filters.soType),
    p_source: source === "New Product" ? "RFQ / New Product" : source,
  });
  if (error) throw error;
  return ((data ?? []) as OwnerYtdRow[]).map((row) => ({
    ownerId: row.owner_id,
    revenue: Number(row.revenue),
  }));
}
