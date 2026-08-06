import { supabase } from "@/lib/supabase";

// Same loose filter shape as SalesOrderListFilters so the page and the
// aggregate can be driven by one ReportFilters state without casts; "all"
// means "no filter".
export type SalesOrdersMetricsFilters = {
  from?: Date;
  to?: Date;
  ownerId?: string;
  clientId?: string;
  taxType?: string;
  soType?: string;
  source?: string;
  deleted?: boolean;
};

export type SalesOrdersMetrics = {
  ppnValue: number;
  nonPpnValue: number;
  newProductValue: number;
  existingValue: number;
  prototypePaidValue: number;
  focCount: number;
  totalCount: number;
  prototypePaidCount: number;
};

type SalesOrdersMetricsRow = {
  ppn_value: string;
  non_ppn_value: string;
  new_product_value: string;
  existing_value: string;
  prototype_paid_value: string;
  foc_count: string;
  total_count: string;
  prototype_paid_count: string;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function optional(value: string | undefined): string | null {
  return !value || value === "all" ? null : value;
}

export async function getSalesOrdersMetrics(
  filters: SalesOrdersMetricsFilters = {},
): Promise<SalesOrdersMetrics> {
  const source = optional(filters.source);
  const { data, error } = await supabase.rpc("sales_orders_metrics", {
    p_from: filters.from ? isoDate(filters.from) : null,
    p_to: filters.to ? isoDate(filters.to) : null,
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
    p_tax_type: optional(filters.taxType),
    p_so_type: optional(filters.soType),
    p_source: source === "New Product" ? "RFQ / New Product" : source,
    p_deleted: filters.deleted ?? false,
  });
  if (error) throw error;

  const [row] = (data ?? []) as SalesOrdersMetricsRow[];
  return {
    ppnValue: Number(row?.ppn_value ?? 0),
    nonPpnValue: Number(row?.non_ppn_value ?? 0),
    newProductValue: Number(row?.new_product_value ?? 0),
    existingValue: Number(row?.existing_value ?? 0),
    prototypePaidValue: Number(row?.prototype_paid_value ?? 0),
    focCount: Number(row?.foc_count ?? 0),
    totalCount: Number(row?.total_count ?? 0),
    prototypePaidCount: Number(row?.prototype_paid_count ?? 0),
  };
}
