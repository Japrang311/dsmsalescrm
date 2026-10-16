import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateShort,
  formatDateTime,
  formatPercent,
  formatRupiahShort,
} from "@/lib/format";
import type { ForecastSnapshot } from "@/lib/data/forecast-snapshot";
import { ChartEmpty } from "./ReportPrimitives";
import { CHART_COLORS } from "./chart-colors";
import { legendLabel } from "@/components/charts/chart-legend";

function ForecastMetric({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums">
        {formatRupiahShort(value)}
      </p>
      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
        {target > 0
          ? `${formatPercent(value / target)} dari target`
          : "Target tidak sebanding"}
      </p>
    </div>
  );
}

export function ReportsForecastSection({
  totalRevenue,
  sourceBreakdown,
  snapshot,
  target,
  targetComparable,
  unavailableReason,
  isLoading,
  isError,
}: {
  totalRevenue: number;
  sourceBreakdown: { name: string; value: number }[];
  snapshot?: ForecastSnapshot;
  target: number;
  targetComparable: boolean;
  unavailableReason?: string;
  isLoading: boolean;
  isError: boolean;
}) {
  const current = snapshot?.snapshotMode === "current" ? snapshot : undefined;
  const unavailable =
    unavailableReason ??
    (snapshot?.snapshotMode === "historical_unavailable"
      ? "Forecast historis tidak tersedia karena pipeline hanya disimpan sebagai snapshot kondisi saat ini."
      : undefined);

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-sm font-semibold">
            Komposisi sumber Nilai SO
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] px-2 pb-3">
          {totalRevenue === 0 ? (
            <ChartEmpty />
          ) : (
            <div
              className="h-full w-full"
              role="img"
              aria-label={`Diagram lingkaran: pembagian Nilai SO per sumber. ${sourceBreakdown.map((s) => `${s.name} ${formatRupiahShort(s.value)}`).join(", ")}.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {sourceBreakdown.map((s, i) => (
                      <Cell key={s.name} fill={CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    formatter={legendLabel}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        className="lg:col-span-3"
        role="region"
        aria-label="Forecast Nilai SO"
        data-forecast-value={current?.forecastValue ?? undefined}
      >
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle as="h2" className="text-sm font-semibold">
                Forecast Nilai SO
              </CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Basis: Nilai SO dalam periode + quotation open bertanggal dalam
                periode × bobot tahap. Bobot tahap adalah asumsi tetap, bukan
                probabilitas empiris.
              </p>
            </div>
            {current && (
              <span className="rounded-full border px-2 py-1 text-[11px] font-medium">
                Snapshot saat ini
              </span>
            )}
          </div>
          {snapshot && (
            <p className="text-[11px] text-muted-foreground">
              Periode {formatDateShort(snapshot.period.from)} –{" "}
              {formatDateShort(snapshot.period.to)} · as of{" "}
              {formatDateShort(snapshot.asOfDate)} · diambil{" "}
              {formatDateTime(snapshot.fetchedAt)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p role="status">Memuat forecast periode…</p>}
          {isError && (
            <p role="alert">
              Forecast gagal dimuat; angka pipeline dan forecast belum dapat
              dipastikan.
            </p>
          )}
          {!isLoading && !isError && unavailable && (
            <p
              role="status"
              className="rounded-md border bg-muted/30 p-3 text-sm"
            >
              {unavailable}
            </p>
          )}
          {current &&
            current.openPipelineValue !== null &&
            current.forecastValue !== null && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ForecastMetric
                    label="Nilai SO periode"
                    value={current.salesOrderValue}
                    target={targetComparable ? target : 0}
                  />
                  <ForecastMetric
                    label="Pipeline terbobot periode"
                    value={current.openPipelineValue}
                    target={targetComparable ? target : 0}
                  />
                  <ForecastMetric
                    label="Forecast periode"
                    value={current.forecastValue}
                    target={targetComparable ? target : 0}
                  />
                  <ForecastMetric
                    label="Target periode"
                    value={targetComparable ? target : 0}
                    target={targetComparable ? target : 0}
                  />
                </div>

                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <p className="font-medium">Belum dijadwalkan</p>
                    <p className="text-muted-foreground">
                      {current.undated.count} quotation ·{" "}
                      {formatRupiahShort(current.undated.totalValue)} · tidak
                      menambah forecast
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="font-medium">Closing lewat</p>
                    <p className="text-muted-foreground">
                      {current.overdue.count} quotation ·{" "}
                      {formatRupiahShort(current.overdue.totalValue)} · terbobot{" "}
                      {formatRupiahShort(current.overdue.weightedValue)} · tidak
                      menambah periode ini
                    </p>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <caption className="px-3 py-2 text-left font-medium">
                      Drilldown quotation (menampilkan {current.items.length}{" "}
                      dari {current.page.totalCount})
                    </caption>
                    <thead className="sticky top-0 border-t bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Quotation</th>
                        <th className="px-3 py-2">Client / owner</th>
                        <th className="px-3 py-2">Tahap / expected close</th>
                        <th className="px-3 py-2 text-right">Bobot</th>
                        <th className="px-3 py-2 text-right">Kontribusi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.items.map((item) => (
                        <tr key={item.documentId} className="border-t">
                          <td className="px-3 py-2 font-medium">
                            {item.quotationNumber}
                          </td>
                          <td className="px-3 py-2">
                            {item.clientName}
                            <span className="block text-muted-foreground">
                              {item.ownerName}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {item.stage}
                            <span className="block text-muted-foreground">
                              {item.expectedCloseDate
                                ? formatDateShort(item.expectedCloseDate)
                                : "Belum dijadwalkan"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatPercent(item.weight)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {item.contributes
                              ? formatRupiahShort(item.weightedValue)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                      {current.items.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-5 text-center text-muted-foreground"
                          >
                            Tidak ada quotation open untuk scope ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
