import type { CommercialItem } from "@/lib/domain";
import { COMMERCIAL_STAGES } from "@/lib/data/commercial-stages";
import type { PipelineMetrics } from "@/lib/data/pipeline-metrics";
import { daysBetween } from "@/lib/format";

export type PipelineNextWindow = "all" | "overdue" | "today" | "week" | "none";

export function matchesPipelineNextWindow(
  nextDate: string | undefined,
  window: PipelineNextWindow,
  asOf: Date,
): boolean {
  if (window === "all") return true;
  if (!nextDate) return window === "none";
  if (window === "none") return false;

  const diff = daysBetween(asOf, nextDate);
  if (window === "overdue") return diff < 0;
  if (window === "today") return diff === 0;
  return diff >= 0 && diff <= 7;
}

export function filterCommercialItemsByNextWindow<T extends CommercialItem>(
  items: T[],
  nextByItem: Map<string, string | undefined>,
  window: PipelineNextWindow,
  asOf: Date,
): T[] {
  return items.filter((item) =>
    matchesPipelineNextWindow(nextByItem.get(item.id), window, asOf),
  );
}

export function pipelineMetricsFromItems(
  items: CommercialItem[],
): PipelineMetrics {
  const stages = COMMERCIAL_STAGES.map((stage) => {
    const stageItems = items.filter((item) => item.stage === stage);
    const won = stage === "Closed Won";
    const lost = stage === "Closed Lost";
    const totalValue = stageItems.reduce(
      (sum, item) => sum + item.estimatedValue,
      0,
    );
    return {
      stage,
      itemCount: stageItems.length,
      totalValue,
      openValue: won || lost ? 0 : totalValue,
      wonValue: won ? totalValue : 0,
      lostValue: lost ? totalValue : 0,
      wonCount: won ? stageItems.length : 0,
      lostCount: lost ? stageItems.length : 0,
    };
  });

  const totals = stages.reduce(
    (acc, stage) => ({
      itemCount: acc.itemCount + stage.itemCount,
      totalValue: acc.totalValue + stage.totalValue,
      openValue: acc.openValue + stage.openValue,
      wonValue: acc.wonValue + stage.wonValue,
      lostValue: acc.lostValue + stage.lostValue,
      wonCount: acc.wonCount + stage.wonCount,
      lostCount: acc.lostCount + stage.lostCount,
      winRate: 0,
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
