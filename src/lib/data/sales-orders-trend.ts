import { supabase } from "@/lib/supabase";

export type MonthlyTrendPoint = { month: number; revenue: number };

type MonthlyTrendRow = { month: number; revenue: string };

export async function getSalesOrdersMonthlyTrend(
  filters: { year?: number; ownerId?: string } = {},
): Promise<MonthlyTrendPoint[]> {
  const { data, error } = await supabase.rpc("sales_orders_monthly_trend", {
    p_year: filters.year ?? null,
    p_owner_id: filters.ownerId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as MonthlyTrendRow[])
    .map((row) => ({ month: Number(row.month), revenue: Number(row.revenue) }))
    .sort((a, b) => a.month - b.month);
}

export type OwnerYtdRevenue = { ownerId: string; revenue: number };

type OwnerYtdRow = { owner_id: string; revenue: string };

export async function getSalesOrdersOwnerYtd(
  filters: { year?: number; ownerId?: string } = {},
): Promise<OwnerYtdRevenue[]> {
  const { data, error } = await supabase.rpc("sales_orders_owner_ytd", {
    p_year: filters.year ?? null,
    p_owner_id: filters.ownerId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as OwnerYtdRow[]).map((row) => ({
    ownerId: row.owner_id,
    revenue: Number(row.revenue),
  }));
}
