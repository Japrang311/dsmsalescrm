import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Receipt,
  ArrowRight,
  Download,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";

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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  compareSalesOrdersByNewestNumber,
  listSalesOrders,
  restoreSalesOrder,
} from "@/lib/data/sales-orders";
import {
  canShowDeletedMode,
  salesOrdersQueryKey,
} from "@/components/commercial/deleted-mode";
import {
  exportSalesOrdersPdf,
  exportSalesOrdersXlsx,
  type SalesOrdersExportContext,
} from "@/lib/export-sales-orders";
import { EmptyExportError } from "@/lib/export-csv";

export const Route = createFileRoute("/_app/sales-orders/")({
  head: () => ({ meta: [{ title: "Sales Orders & Revenue · DSM" }] }),
  component: SalesOrdersRevenuePage,
});

function SalesOrdersRevenuePage() {
  const { role, authReady } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    orders,
    clients: clientList,
    ownersById,
    salesTeam,
    isLoading,
  } = useDashboardData();
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<string>();
  const deletedMode = showDeleted && canShowDeletedMode(role);
  const deletedOrders = useQuery({
    queryKey: salesOrdersQueryKey(true),
    queryFn: () => listSalesOrders({ deleted: true }),
    enabled: authReady && deletedMode,
  });
  const sourceOrders = useMemo(
    () => (deletedMode ? (deletedOrders.data ?? []) : orders),
    [deletedMode, deletedOrders.data, orders],
  );

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
      filterSalesOrders(sourceOrders, filters).sort(
        compareSalesOrdersByNewestNumber,
      ),
    [sourceOrders, filters],
  );

  const summary = useMemo(() => {
    let ppn = 0;
    let nonPpn = 0;
    let newProduct = 0;
    let existing = 0;
    let protoPaid = 0;
    let focCount = 0;
    for (const s of rows) {
      const v = s.value ?? 0;
      if (s.taxType === "PPN") ppn += v;
      else if (s.taxType === "Non-PPN") nonPpn += v;
      if (s.source === "New Product") newProduct += v;
      else if (s.source === "Existing / Repeat Order") existing += v;
      else if (s.source === "Prototype Paid") protoPaid += v;
      if (s.type === "Prototype" && s.prototypeStatus === "FOC") focCount += 1;
    }
    const total = ppn + nonPpn;
    return { ppn, nonPpn, total, newProduct, existing, protoPaid, focCount };
  }, [rows]);

  const exportContext = useMemo<SalesOrdersExportContext>(
    () => ({
      role,
      range: filters.range,
      rows,
      clientsById: clients,
      ownersById,
      summary,
    }),
    [role, filters.range, rows, clients, ownersById, summary],
  );

  const handleExport = (format: "xlsx" | "pdf") => {
    try {
      if (format === "xlsx") {
        const rowCount = exportSalesOrdersXlsx(exportContext);
        toast.success("Sales Orders Excel dibuat", {
          description: `${rowCount} SO · ${formatRupiahShort(summary.total)}.`,
        });
        return;
      }

      exportSalesOrdersPdf(exportContext);
      toast.success("Sales Orders PDF dibuat", {
        description: `${rows.length} SO · ${formatRupiahShort(summary.total)}.`,
      });
    } catch (error) {
      if (error instanceof EmptyExportError) {
        toast.error("Tidak ada data untuk export", {
          description: error.message,
        });
        return;
      }
      toast.error("Gagal membuat export", {
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan.",
      });
    }
  };

  async function restoreOrder(id: string) {
    setRestoringId(id);
    try {
      await restoreSalesOrder(id);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: salesOrdersQueryKey(false),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: salesOrdersQueryKey(true),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ["activity-log"] }),
      ]);
      toast.success("Sales Order dipulihkan");
    } catch (error) {
      toast.error("Gagal memulihkan Sales Order", {
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan.",
      });
    } finally {
      setRestoringId(undefined);
    }
  }

  if (isLoading || (deletedMode && deletedOrders.isLoading)) {
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
            {rows.length} SO {deletedMode ? "terhapus" : "aktif"} · Scope:{" "}
            {ROLE_LABEL[role]}
            {!deletedMode &&
              " · SO FOC ditampilkan sebagai Rp0 dan tidak masuk ke revenue."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canShowDeletedMode(role) && (
            <label className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium">
              <Switch
                aria-label="Show deleted"
                checked={deletedMode}
                onCheckedChange={setShowDeleted}
              />
              Show deleted
            </label>
          )}
          {!deletedMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => handleExport("xlsx")}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => handleExport("pdf")}
                >
                  <FileText className="h-4 w-4" /> PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ReportFilterBar
        role={role}
        value={filters}
        onChange={patch}
        clients={clientList}
        salesTeam={salesTeam}
      />

      {deletedMode ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-3 text-sm text-amber-900">
            Sales Order terhapus tidak dihitung sebagai revenue dan tidak
            disertakan dalam laporan atau export aktif.
          </CardContent>
        </Card>
      ) : (
        <>
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
                <TrendingUp className="h-4 w-4 text-primary" /> Revenue by
                Source
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              <SourceRow
                label="New Product"
                value={summary.newProduct}
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
        </>
      )}

      {rows.length === 0 ? (
        <EmptyState
          className="py-14"
          icon={Search}
          description="Tidak ada SO pada rentang & filter ini. Longgarkan filter atau pilih periode lain."
        />
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
                    <TableHead>Nama Product</TableHead>
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
                      <TableRow
                        key={so.id}
                        className={cn(
                          "outline-none transition-colors",
                          !deletedMode &&
                            "cursor-pointer hover:bg-primary-soft/60 focus-visible:bg-primary-soft/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                          deletedMode && "hover:bg-muted/40",
                        )}
                        tabIndex={deletedMode ? undefined : 0}
                        role={deletedMode ? undefined : "link"}
                        aria-label={
                          deletedMode
                            ? undefined
                            : `Buka detail ${so.soNumber ?? "sales order"}`
                        }
                        onClick={
                          deletedMode
                            ? undefined
                            : () =>
                                navigate({
                                  to: "/sales-orders/$soId",
                                  params: { soId: so.id },
                                })
                        }
                        onKeyDown={
                          deletedMode
                            ? undefined
                            : (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  navigate({
                                    to: "/sales-orders/$soId",
                                    params: { soId: so.id },
                                  });
                                }
                              }
                        }
                      >
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
                        <TableCell className="max-w-[220px] truncate">
                          {so.items.length === 0
                            ? "—"
                            : so.items.length === 1
                              ? (so.items[0].productName ?? "—")
                              : `${so.items[0].productName ?? "—"} +${so.items.length - 1} lainnya`}
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
                        <TableCell
                          className="w-[80px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {deletedMode ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={restoringId === so.id}
                              onClick={() => void restoreOrder(so.id)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              {restoringId === so.id
                                ? "Memulihkan…"
                                : "Restore"}
                            </Button>
                          ) : (
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
                          )}
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
      {!deletedMode && role !== "sales" && (
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
