import { supabase } from "@/lib/supabase";
import { toLocalIsoDate } from "@/lib/domain";

// Same loose filter shape as SalesOrdersMetricsFilters/ReportFilters so the
// Reports page can drive every Stage 4 RPC from one filter state without
// casts; "all"/undefined means "no filter".
export type Stage4MetricsFilters = {
  from?: Date;
  to?: Date;
  ownerId?: string;
  clientId?: string;
};

function isoDate(date: Date | undefined): string | null {
  return date ? toLocalIsoDate(date) : null;
}

function optional(value: string | undefined): string | null {
  return !value || value === "all" ? null : value;
}

export type WinLossMetrics = {
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  terminalCount: number;
  winRate: number | null;
};

type WinLossRow = {
  won_count: string;
  won_value: string;
  lost_count: string;
  lost_value: string;
  terminal_count: string;
  win_rate: string | null;
};

export async function getWinLossMetrics(
  filters: Stage4MetricsFilters = {},
): Promise<WinLossMetrics> {
  const { data, error } = await supabase.rpc("commercial_win_loss_metrics", {
    p_from: isoDate(filters.from),
    p_to: isoDate(filters.to),
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
  });
  if (error) throw error;
  const [row] = (data ?? []) as WinLossRow[];
  return {
    wonCount: Number(row?.won_count ?? 0),
    wonValue: Number(row?.won_value ?? 0),
    lostCount: Number(row?.lost_count ?? 0),
    lostValue: Number(row?.lost_value ?? 0),
    terminalCount: Number(row?.terminal_count ?? 0),
    winRate:
      row?.win_rate === null || row?.win_rate === undefined
        ? null
        : Number(row.win_rate),
  };
}

export type LostReasonMetric = {
  lostReason: string;
  lostCount: number;
  lostValue: number;
};

type LostReasonRow = {
  lost_reason: string;
  lost_count: string;
  lost_value: string;
};

export async function getLostReasonMetrics(
  filters: Stage4MetricsFilters = {},
): Promise<LostReasonMetric[]> {
  const { data, error } = await supabase.rpc("commercial_lost_reason_metrics", {
    p_from: isoDate(filters.from),
    p_to: isoDate(filters.to),
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
  });
  if (error) throw error;
  return ((data ?? []) as LostReasonRow[])
    .map((row) => ({
      lostReason: row.lost_reason,
      lostCount: Number(row.lost_count),
      lostValue: Number(row.lost_value),
    }))
    .sort((a, b) => b.lostCount - a.lostCount);
}

export type CycleTimeLeg = "quote_to_po" | "po_to_so" | "quote_to_so";

export type CycleTimeMetric = {
  leg: CycleTimeLeg;
  medianDays: number | null;
  p75Days: number | null;
  p90Days: number | null;
  includedCount: number;
  excludedCount: number;
};

type CycleTimeRow = {
  leg: CycleTimeLeg;
  median_days: string | null;
  p75_days: string | null;
  p90_days: string | null;
  included_count: string;
  excluded_count: string;
};

export async function getCycleTimeMetrics(
  filters: Stage4MetricsFilters = {},
): Promise<CycleTimeMetric[]> {
  const { data, error } = await supabase.rpc("commercial_cycle_time_metrics", {
    p_from: isoDate(filters.from),
    p_to: isoDate(filters.to),
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
  });
  if (error) throw error;
  return ((data ?? []) as CycleTimeRow[]).map((row) => ({
    leg: row.leg,
    medianDays: row.median_days === null ? null : Number(row.median_days),
    p75Days: row.p75_days === null ? null : Number(row.p75_days),
    p90Days: row.p90_days === null ? null : Number(row.p90_days),
    includedCount: Number(row.included_count),
    excludedCount: Number(row.excluded_count),
  }));
}

export type StageFunnelMetric = {
  stage: string;
  enteredCount: number;
};

type StageFunnelRow = {
  stage: string;
  entered_count: string;
};

export async function getStageFunnelMetrics(
  filters: Stage4MetricsFilters = {},
): Promise<StageFunnelMetric[]> {
  const { data, error } = await supabase.rpc(
    "commercial_stage_funnel_metrics",
    {
      p_from: isoDate(filters.from),
      p_to: isoDate(filters.to),
      p_owner_id: optional(filters.ownerId),
      p_client_id: optional(filters.clientId),
    },
  );
  if (error) throw error;
  return ((data ?? []) as StageFunnelRow[]).map((row) => ({
    stage: row.stage,
    enteredCount: Number(row.entered_count),
  }));
}

export type StageDwellMetric = {
  stage: string;
  completedMedianDays: number | null;
  completedCount: number;
  openMedianDays: number | null;
  openCount: number;
};

type StageDwellRow = {
  stage: string;
  completed_median_days: string | null;
  completed_count: string;
  open_median_days: string | null;
  open_count: string;
};

export async function getStageDwellMetrics(
  filters: Pick<Stage4MetricsFilters, "ownerId" | "clientId"> = {},
): Promise<StageDwellMetric[]> {
  const { data, error } = await supabase.rpc("commercial_stage_dwell_metrics", {
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
  });
  if (error) throw error;
  return ((data ?? []) as StageDwellRow[]).map((row) => ({
    stage: row.stage,
    completedMedianDays:
      row.completed_median_days === null
        ? null
        : Number(row.completed_median_days),
    completedCount: Number(row.completed_count),
    openMedianDays:
      row.open_median_days === null ? null : Number(row.open_median_days),
    openCount: Number(row.open_count),
  }));
}

export type AnalyticsCoverage = {
  metricName: "win_loss" | "lost_reason" | "cycle_time" | "funnel" | "dwell";
  effectiveFrom: string | null;
  includedCount: number;
  excludedCount: number;
  exclusionReason: string | null;
};

type AnalyticsCoverageRow = {
  metric_name: AnalyticsCoverage["metricName"];
  analytics_effective_from: string | null;
  included_count: string;
  excluded_count: string;
  exclusion_reason: string | null;
};

export async function getAnalyticsCoverage(
  filters: Stage4MetricsFilters = {},
): Promise<AnalyticsCoverage[]> {
  const { data, error } = await supabase.rpc("commercial_analytics_coverage", {
    p_from: isoDate(filters.from),
    p_to: isoDate(filters.to),
    p_owner_id: optional(filters.ownerId),
    p_client_id: optional(filters.clientId),
  });
  if (error) throw error;
  return ((data ?? []) as AnalyticsCoverageRow[]).map((row) => ({
    metricName: row.metric_name,
    effectiveFrom: row.analytics_effective_from,
    includedCount: Number(row.included_count),
    excludedCount: Number(row.excluded_count),
    exclusionReason: row.exclusion_reason,
  }));
}
