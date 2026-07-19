import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Receipt, ArrowRight, Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatRupiahShort,
  formatRupiahFull,
  formatDateShort,
  formatPercent,
} from "@/lib/format";

import { useRole } from "@/context/role-context";
import { NOW, CURRENT_YEAR } from "@/lib/domain";
import {
  ReportFilterBar,
  defaultReportFilters,
  type ReportFilters,
} from "@/components/reports/ReportFilterBar";
import { filterSalesOrders } from "@/lib/report-selectors";
import { ROLE_LABEL } from "@/context/role-context";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export const Route = createFileRoute("/_app/sales-orders/")({
  head: () => ({ meta: [{ title: "Sales Orders & Revenue · DSM" }] }),
  component: SalesOrdersRevenuePage,
});

function SalesOrdersRevenuePage() {
  const { role } = useRole();
  const {
    orders,
    clients: clientList,
    ownersById,
    salesTeam,
    isLoading,
  } = useDashboardData();

  const [filters, setFilters] = useState<ReportFilters>(() =>
    defaultReportFilters({ from: new Date(CURRENT_YEAR, 0, 1), to: NOW }),
  );
  const patch = (p: Partial<ReportFilters>) =>
    setFilters((s) => ({ ...s, ...p }));

  const clients = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);
  const owners = ownersById;

  const rows = useMemo(
    () =>
      filterSalesOrders(orders, filters).sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    [orders, filters],
  );

  const summary = useMemo(() => {
    let ppn = 0;
    let nonPpn = 0;
    let rfq = 0;
    let existing = 0;
    let protoPaid = 0;
    let focCount = 0;
    for (const s of rows) {
      const v = s.value ?? 0;
      if (s.taxType === "PPN") ppn += v;
      else if (s.taxType === "Non-PPN") nonPpn += v;
      if (s.source === "RFQ / New Product") rfq += v;
      else if (s.source === "Existing / Repeat Order") existing += v;
      else if (s.source === "Prototype Paid") protoPaid += v;
      if (s.type === "Prototype" && s.prototypeStatus === "FOC") focCount += 1;
    }
    const total = ppn + nonPpn;
    return { ppn, nonPpn, total, rfq, existing, protoPaid, focCount };
  }, [rows]);

  const handleMockExport = () => {
    toast.success("Export siap (mock)", {
      description: `${rows.length} SO · ${formatRupiahShort(summary.total)} akan dikirim ke Excel/PDF pada versi produksi.`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Loading sales orders…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Receipt className="h-5 w-5 text-primary" /> Sales Orders & Revenue
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} SO · Scope: {ROLE_LABEL[role]} · SO FOC ditampilkan
            sebagai Rp0 dan tidak masuk ke revenue.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMockExport}
          className="gap-2"
        >
          <Download className="h-3.5 w-3.5" /> Export (mock)
        </Button>
      </div>

      <ReportFilterBar
        role={role}
        value={filters}
        onChange={patch}
        clients={clientList}
        salesTeam={salesTeam}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Total Revenue"
          value={formatRupiahShort(summary.total)}
          sub={formatRupiahFull(summary.total)}
          accent
        />
        <KpiTile
          label="PPN"
          value={formatRupiahShort(summary.ppn)}
          sub={`${formatPercent(summary.total ? summary.ppn / summary.total : 0)} dari total`}
        />
        <KpiTile
          label="Non-PPN"
          value={formatRupiahShort(summary.nonPpn)}
          sub={`${formatPercent(summary.total ? summary.nonPpn / summary.total : 0)} dari total`}
        />
        <KpiTile
          label="Prototype FOC"
          value={`${summary.focCount} SO`}
          sub="Tidak berkontribusi ke revenue"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" /> Revenue by Source
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <SourceRow
            label="RFQ / New Product"
            value={summary.rfq}
            total={summary.total}
            tone="sky"
          />
          <SourceRow
            label="Existing / Repeat Order"
            value={summary.existing}
            total={summary.total}
            tone="emerald"
          />
          <SourceRow
            label="Prototype Paid"
            value={summary.protoPaid}
            total={summary.total}
            tone="violet"
          />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            Tidak ada SO pada rentang & filter ini. Longgarkan filter atau pilih
            periode lain.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. SO</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Customer PO</TableHead>
                    <TableHead>Klien</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Pajak</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((so) => {
                    const foc =
                      so.type === "Prototype" && so.prototypeStatus === "FOC";
                    return (
                      <TableRow key={so.id} className="hover:bg-muted/40">
                        <TableCell className="font-mono text-xs">
                          {so.soNumber}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateShort(so.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {so.customerPoNumber ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {clients[so.clientId]?.name ?? "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {owners[so.ownerId]?.name ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {so.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {so.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {foc ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              FOC
                            </Badge>
                          ) : (
                            (so.taxType ?? "—")
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {so.items.length}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {foc ? (
                            <span className="text-muted-foreground">Rp0</span>
                          ) : (
                            formatRupiahShort(so.value ?? 0)
                          )}
                        </TableCell>
                        <TableCell className="w-[80px]">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                          >
                            <Link
                              to="/sales-orders/$soId"
                              params={{ soId: so.id }}
                            >
                              Detail <ArrowRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/** Manager / executive can jump into the full executive report */}
      {role !== "sales" && (
        <div className="flex justify-end">
          <Button asChild variant="link" size="sm" className="text-xs">
            <Link to="/reports">Lihat Executive Report lengkap →</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/[0.03]" : ""}>
      <CardContent className="p-3.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SourceRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "sky" | "emerald" | "violet";
}) {
  const pct = total > 0 ? value / total : 0;
  const bar = {
    sky: "bg-sky-500",
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
  }[tone];
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatPercent(pct)}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums">
        {formatRupiahShort(value)}
      </p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={`${bar} h-full`}
          style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
