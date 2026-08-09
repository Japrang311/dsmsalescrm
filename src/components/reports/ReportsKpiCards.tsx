import { TrendingUp, Target, FlaskConical } from "lucide-react";
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
  };
  ytdAchievementPct: number;
  yearTargetTotal: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        icon={<Target className="h-4 w-4" />}
        label="Achievement YTD"
        value={formatRupiahShort(totals.revenue)}
        sub={`${formatPercent(ytdAchievementPct)} dari target ${formatRupiahShort(yearTargetTotal)}`}
        accent
      />
      <KpiTile
        icon={<TrendingUp className="h-4 w-4" />}
        label="PPN Revenue"
        value={formatRupiahShort(totals.ppn)}
        sub={`${formatPercent(totals.revenue ? totals.ppn / totals.revenue : 0)} dari revenue`}
      />
      <KpiTile
        icon={<TrendingUp className="h-4 w-4" />}
        label="Non-PPN Revenue"
        value={formatRupiahShort(totals.nonPpn)}
        sub={`${formatPercent(totals.revenue ? totals.nonPpn / totals.revenue : 0)} dari revenue`}
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
