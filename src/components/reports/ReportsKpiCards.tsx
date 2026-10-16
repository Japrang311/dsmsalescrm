import {
  CircleDollarSign,
  FileCheck2,
  Target,
  FlaskConical,
} from "lucide-react";
import { formatPercent, formatRupiahShort } from "@/lib/format";
import { KpiTile } from "./ReportPrimitives";

export function ReportsKpiCards({
  totals,
  ytdAchievementPct,
  yearTargetTotal,
  targetReason,
}: {
  totals: {
    revenue: number;
    ppn: number;
    nonPpn: number;
    protoPaid: number;
    protoFocCount: number;
    protoPaidCount: number;
    totalCount: number;
  };
  ytdAchievementPct: number | null;
  yearTargetTotal: number;
  targetReason?: string;
}) {
  const revenueOrderCount = Math.max(
    0,
    totals.totalCount - totals.protoFocCount,
  );
  const averageOrderValue =
    revenueOrderCount > 0 ? totals.revenue / revenueOrderCount : 0;

  return (
    <div className="precision-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        icon={<Target className="h-4 w-4" />}
        label="Nilai SO · periode terpilih"
        value={formatRupiahShort(totals.revenue)}
        // yearTargetTotal is the target summed *through the current month*, not
        // the full-year figure the Dashboard compares against — hence a
        // different % for the same revenue. Say so.
        sub={
          ytdAchievementPct === null
            ? `— · ${targetReason ?? "Target tidak sebanding."}`
            : `${formatPercent(ytdAchievementPct)} dari target periode (${formatRupiahShort(yearTargetTotal)})`
        }
        accent
      />
      <KpiTile
        icon={<FileCheck2 className="h-4 w-4" />}
        label="Total Sales Orders"
        value={`${totals.totalCount.toLocaleString("id-ID")} SO`}
        sub={`${revenueOrderCount.toLocaleString("id-ID")} SO berbayar · ${totals.protoFocCount.toLocaleString("id-ID")} FOC`}
      />
      <KpiTile
        icon={<CircleDollarSign className="h-4 w-4" />}
        label="Average Order Value"
        value={
          revenueOrderCount > 0 ? formatRupiahShort(averageOrderValue) : "—"
        }
        sub={
          revenueOrderCount > 0
            ? `Rata-rata dari ${revenueOrderCount.toLocaleString("id-ID")} SO berbayar`
            : "Belum ada SO berkontribusi Nilai SO"
        }
      />
      <KpiTile
        icon={<FlaskConical className="h-4 w-4" />}
        label="Prototype"
        value={`${formatRupiahShort(totals.protoPaid)} · ${totals.protoFocCount} FOC`}
        sub={`${totals.protoPaidCount} order berbayar berkontribusi Nilai SO`}
      />
    </div>
  );
}
