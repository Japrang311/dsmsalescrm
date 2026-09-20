import { KpiProgress } from "./KpiCard";
import { formatPercent, formatRupiahShort } from "@/lib/format";

type Props = {
  monthName: string;
  monthRev: number;
  monthPct: number;
  monthTgt: number;
  ytd: number;
  ytdPct: number;
  yearlyTgt: number;
  waitingPo: number;
  activeCi: number;
};
export function DashboardOverview({
  monthName,
  monthRev,
  monthPct,
  monthTgt,
  ytd,
  ytdPct,
  yearlyTgt,
  waitingPo,
  activeCi,
}: Props) {
  return (
    <section
      aria-label="Metrik utama"
      className="grid min-w-0 overflow-hidden rounded-xl border bg-card xl:grid-cols-[1.4fr_1fr]"
    >
      <div className="border-l-4 border-primary px-5 py-4 md:px-7 md:py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Capaian {monthName}
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="num text-3xl font-semibold tracking-tight md:text-4xl">
            {formatRupiahShort(monthRev)}
          </p>
          <span className="num text-sm font-semibold text-primary">
            {formatPercent(monthPct)} dari target
          </span>
        </div>
        <div className="mt-3 max-w-lg">
          <KpiProgress
            pct={monthPct}
            tone={monthPct >= 1 ? "success" : "primary"}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Target bulan ini{" "}
          <span className="num">{formatRupiahShort(monthTgt)}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x border-t bg-background/50 xl:border-l xl:border-t-0">
        <div className="flex flex-col justify-center gap-1 p-4 md:p-5">
          <p className="text-xs text-muted-foreground">Capaian YTD</p>
          <p className="num text-base font-semibold md:text-xl">
            {formatRupiahShort(ytd)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPercent(ytdPct)} dari target setahun
          </p>
          <p className="text-xs text-muted-foreground">
            Target <span className="num">{formatRupiahShort(yearlyTgt)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Selisih{" "}
            <span
              className={ytd >= yearlyTgt ? "text-success" : "text-destructive"}
            >
              {formatRupiahShort(ytd - yearlyTgt)}
            </span>
          </p>
        </div>
        <div className="flex flex-col justify-center gap-1 p-4 md:p-5">
          <p className="text-xs text-muted-foreground">Menunggu PO</p>
          <p className="num text-base font-semibold md:text-xl">
            {formatRupiahShort(waitingPo)}
          </p>
          <p className="text-xs text-muted-foreground">
            {activeCi} item aktif di seluruh pipeline
          </p>
        </div>
      </div>
    </section>
  );
}
