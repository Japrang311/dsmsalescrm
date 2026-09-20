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
  ytdAchievementPct: number;
  yearTargetTotal: number;
}) {
  const revenueOrderCount = Math.max(
    0,
    totals.totalCount - totals.protoFocCount,
  );
  const averageOrderValue =
    revenueOrderCount > 0 ? totals.revenue / revenueOrderCount : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        icon={<Target className="h-4 w-4" />}
        label="Achievement YTD"
        value={formatRupiahShort(totals.revenue)}
        // yearTargetTotal is the target summed *through the current month*, not
        // the full-year figure the Dashboard compares against — hence a
        // different % for the same revenue. Say so.
        sub={`${formatPercent(ytdAchievementPct)} dari target sampai bulan ini (${formatRupiahShort(yearTargetTotal)})`}
        accent
      />
      <KpiTile
        icon={<FileCheck2 className="h-4 w-4" />}
        label="Total Sales Orders"
        value={`${totals.totalCount.toLocaleString("id-ID")} SO`}
        sub={`${revenueOrderCount.toLocaleString("id-ID")} revenue · ${totals.protoFocCount.toLocaleString("id-ID")} FOC`}
      />
      <KpiTile
        icon={<CircleDollarSign className="h-4 w-4" />}
        label="Average Order Value"
        value={
          revenueOrderCount > 0 ? formatRupiahShort(averageOrderValue) : "—"
        }
        sub={
          revenueOrderCount > 0
            ? `Rata-rata dari ${revenueOrderCount.toLocaleString("id-ID")} SO revenue`
            : "Belum ada SO berkontribusi revenue"
        }
      />
      <KpiTile
        icon={<FlaskConical className="h-4 w-4" />}
        label="Prototype"
        value={`${formatRupiahShort(totals.protoPaid)} · ${totals.protoFocCount} FOC`}
        sub={`${totals.protoPaidCount} Paid berkontribusi revenue`}
      />
    </div>
  );
}
