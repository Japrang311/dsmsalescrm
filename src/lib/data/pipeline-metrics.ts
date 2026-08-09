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

type PipelineMetricsRow = {
  stage: string;
  item_count: string;
  total_value: string;
  open_value: string;
  won_value: string;
  lost_value: string;
  won_count: string;
  lost_count: string;
};

export async function getPipelineMetrics(
  filters?: PipelineMetricsFilters,
): Promise<PipelineMetrics> {
  const { data, error } = await supabase.rpc("pipeline_metrics", {
    p_owner_id: filters?.ownerId ?? null,
    p_client_status: filters?.clientStatus ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as PipelineMetricsRow[];
  const stages: PipelineStageMetrics[] = rows.map((row) => ({
    stage: row.stage,
    itemCount: Number(row.item_count),
    totalValue: Number(row.total_value),
    openValue: Number(row.open_value),
    wonValue: Number(row.won_value),
    lostValue: Number(row.lost_value),
    wonCount: Number(row.won_count),
    lostCount: Number(row.lost_count),
  }));

  const totals = stages.reduce(
    (acc, s) => ({
      itemCount: acc.itemCount + s.itemCount,
      totalValue: acc.totalValue + s.totalValue,
      openValue: acc.openValue + s.openValue,
      wonValue: acc.wonValue + s.wonValue,
      lostValue: acc.lostValue + s.lostValue,
      wonCount: acc.wonCount + s.wonCount,
      lostCount: acc.lostCount + s.lostCount,
      winRate: 0, // computed below
    }),
    {
      itemCount: 0,
      totalValue: 0,
      openValue: 0,
      wonValue: 0,
      lostValue: 0,
      wonCount: 0,
      lostCount: 0,
      winRate: 0,
    },
  );

  const decided = totals.wonCount + totals.lostCount;
  totals.winRate = decided > 0 ? (totals.wonCount / decided) * 100 : 0;

  return { stages, totals };
}
