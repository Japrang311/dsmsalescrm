import { useMemo } from "react";
import { TrendingUp, Target, Percent, Wallet } from "lucide-react";
import { formatRupiahShort } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  stage: string;
  ownerId: string;
  estimatedValue: number;
};

const ALL_STAGES = [
  "RFQ Received",
  "Quotation in Progress",
  "Quotation Sent",
  "Waiting Client PO",
  "PO Received",
  "Prototype in Progress",
  "Closed Lost",
] as const;

const WON_STAGES = new Set(["PO Received", "Prototype in Progress"]);
const LOST_STAGES = new Set(["Closed Lost"]);

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

export function PipelineAnalytics({
  items,
  showOwners,
  ownerById = {},
}: {
  items: Item[];
  showOwners: boolean;
  ownerById?: Record<string, { name: string }>;
}) {
  const totals = useMemo(() => {
    let total = 0;
    let open = 0;
    let won = 0;
    let lost = 0;
    let wonCount = 0;
    let lostCount = 0;
    for (const it of items) {
      total += it.estimatedValue;
      if (WON_STAGES.has(it.stage)) {
        won += it.estimatedValue;
        wonCount++;
      } else if (LOST_STAGES.has(it.stage)) {
        lost += it.estimatedValue;
        lostCount++;
      } else {
        open += it.estimatedValue;
      }
    }
    const decided = wonCount + lostCount;
    const winRate = pct(wonCount, decided);
    return { total, open, won, lost, wonCount, lostCount, winRate };
  }, [items]);

  const byStage = useMemo(() => {
    return ALL_STAGES.map((stage) => {
      const rows = items.filter((it) => it.stage === stage);
      const value = rows.reduce((s, it) => s + it.estimatedValue, 0);
      return {
        stage,
        count: rows.length,
        value,
        share: pct(value, totals.total),
      };
    });
  }, [items, totals.total]);

  const maxStageValue = Math.max(1, ...byStage.map((s) => s.value));

  const byOwner = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        won: number;
        lost: number;
        openCount: number;
        wonCount: number;
        lostCount: number;
      }
    >();
    for (const it of items) {
      const cur = map.get(it.ownerId) ?? {
        total: 0,
        won: 0,
        lost: 0,
        openCount: 0,
        wonCount: 0,
        lostCount: 0,
      };
      cur.total += it.estimatedValue;
      if (WON_STAGES.has(it.stage)) {
        cur.won += it.estimatedValue;
        cur.wonCount++;
      } else if (LOST_STAGES.has(it.stage)) {
        cur.lost += it.estimatedValue;
        cur.lostCount++;
      } else {
        cur.openCount++;
      }
      map.set(it.ownerId, cur);
    }
    return Array.from(map.entries())
      .map(([ownerId, v]) => ({
        ownerId,
        name: ownerById[ownerId]?.name ?? "Unknown",
        ...v,
        winRate: pct(v.wonCount, v.wonCount + v.lostCount),
      }))
      .sort((a, b) => b.total - a.total);
  }, [items, ownerById]);

  const maxOwnerValue = Math.max(1, ...byOwner.map((o) => o.total));

  return (
    <div className="flex flex-col gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="Total pipeline"
          value={formatRupiahShort(totals.total)}
          sub={`${items.length} item`}
        />
        <KpiTile
          icon={<Target className="h-3.5 w-3.5" />}
          label="Open value"
          value={formatRupiahShort(totals.open)}
          sub={`${items.length - totals.wonCount - totals.lostCount} aktif`}
          tone="primary"
        />
        <KpiTile
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Won value"
          value={formatRupiahShort(totals.won)}
          sub={`${totals.wonCount} deal`}
          tone="success"
        />
        <KpiTile
          icon={<Percent className="h-3.5 w-3.5" />}
          label="Win rate"
          value={`${totals.winRate.toFixed(1)}%`}
          sub={`${totals.wonCount} won · ${totals.lostCount} lost`}
          tone={totals.winRate >= 50 ? "success" : "warning"}
        />
      </div>

      <div
        className={cn("grid grid-cols-1 gap-3", showOwners && "lg:grid-cols-2")}
      >
        {/* Stage breakdown */}
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Value & konversi per stage
            </h3>
            <span className="text-[11px] text-muted-foreground">
              % dari total pipeline
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {byStage.map((s) => {
              const isLost = LOST_STAGES.has(s.stage);
              const isWon = WON_STAGES.has(s.stage);
              return (
                <div
                  key={s.stage}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-medium text-foreground">
                        {s.stage}
                      </p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {s.count} · {formatRupiahShort(s.value)}
                      </p>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isLost
                            ? "bg-zinc-400"
                            : isWon
                              ? "bg-emerald-500"
                              : "bg-primary",
                        )}
                        style={{
                          width: `${(s.value / maxStageValue) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                    {s.share.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Owner performance */}
        {showOwners && (
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Performa per owner
              </h3>
              <span className="text-[11px] text-muted-foreground">
                value · win rate
              </span>
            </div>
            {byOwner.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-muted-foreground">
                Belum ada data owner.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {byOwner.map((o) => (
                  <div
                    key={o.ownerId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] font-medium text-foreground">
                          {o.name}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {formatRupiahShort(o.total)}
                        </p>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${(o.total / maxOwnerValue) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                        {o.wonCount} won · {o.lostCount} lost · {o.openCount}{" "}
                        open
                      </p>
                    </div>
                    <span
                      className={cn(
                        "w-14 rounded px-1.5 py-0.5 text-right text-[11px] font-medium tabular-nums",
                        o.winRate >= 50
                          ? "bg-emerald-50 text-emerald-700"
                          : o.winRate > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {o.wonCount + o.lostCount === 0
                        ? "—"
                        : `${o.winRate.toFixed(0)}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
