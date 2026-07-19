import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Package,
  PhoneCall,
  Archive,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDateShort, formatRupiahShort, daysBetween } from "@/lib/format";
import { StatusBadge, RiskDot } from "@/components/clients/StatusBadges";
import { AddFollowUpDialog } from "@/components/clients/AddFollowUpDialog";
import type { ClientListRow } from "@/lib/data/clients";
import { NOW } from "@/lib/domain";
import { toast } from "sonner";

type SortKey = "name" | "spending" | "lastFu" | "nextFu" | "active";
type Density = "compact" | "comfortable";

export function ClientsTable({
  rows,
  density,
  page,
  pageSize,
  onPageChange,
}: {
  rows: ClientListRow[];
  density: Density;
  page: number;
  pageSize: number;
  onPageChange: (n: number) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("spending");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return dir * a.client.name.localeCompare(b.client.name);
        case "spending":
          return dir * (a.spendingYtd - b.spendingYtd);
        case "active":
          return dir * (a.activeCommercialCount - b.activeCommercialCount);
        case "lastFu":
          return dir * (a.lastFu ?? "").localeCompare(b.lastFu ?? "");
        case "nextFu":
          return dir * (a.nextFu ?? "").localeCompare(b.nextFu ?? "");
        default:
          return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const cellPad = density === "compact" ? "py-1.5 px-2.5" : "py-3 px-3";
  const textSize = density === "compact" ? "text-[12px]" : "text-sm";

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Tidak ada klien untuk filter ini
        </p>
        <p className="text-xs text-muted-foreground">
          Coba reset filter atau ubah rentang spending.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className={cn("w-full border-collapse tabular-nums", textSize)}>
          <thead className="border-b bg-muted/40 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th
                onClick={() => toggleSort("name")}
                label="Client"
                active={sortKey === "name"}
              />
              <th className={cn("font-medium", cellPad)}>Status</th>
              <th className={cn("font-medium", cellPad)}>Source</th>
              <th className={cn("font-medium", cellPad)}>Sales</th>
              <Th
                onClick={() => toggleSort("spending")}
                label="Spending YTD"
                active={sortKey === "spending"}
                align="right"
              />
              <th className={cn("text-right font-medium", cellPad)}>PPN</th>
              <th className={cn("text-right font-medium", cellPad)}>Non-PPN</th>
              <Th
                onClick={() => toggleSort("lastFu")}
                label="Last FU"
                active={sortKey === "lastFu"}
              />
              <Th
                onClick={() => toggleSort("nextFu")}
                label="Next FU"
                active={sortKey === "nextFu"}
              />
              <Th
                onClick={() => toggleSort("active")}
                label="Active Items"
                active={sortKey === "active"}
                align="right"
              />
              <th className={cn("font-medium", cellPad)}>Risk</th>
              <th className={cn("w-10", cellPad)} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const nextDays = r.nextFu ? daysBetween(NOW, r.nextFu) : null;
              const overdue = nextDays !== null && nextDays < 0;
              return (
                <tr
                  key={r.client.id}
                  className="border-b transition-colors last:border-b-0 hover:bg-muted/30"
                >
                  <td className={cellPad}>
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: r.client.id }}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {r.client.name}
                    </Link>
                  </td>
                  <td className={cellPad}>
                    <StatusBadge status={r.client.status} />
                  </td>
                  <td className={cn(cellPad, "text-muted-foreground")}>
                    {r.client.source}
                  </td>
                  <td className={cn(cellPad, "text-muted-foreground")}>
                    {r.ownerName}
                  </td>
                  <td className={cn(cellPad, "text-right font-medium")}>
                    {r.spendingYtd > 0 ? (
                      formatRupiahShort(r.spendingYtd)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className={cn(cellPad, "text-right text-muted-foreground")}
                  >
                    {r.ppn > 0 ? formatRupiahShort(r.ppn) : "—"}
                  </td>
                  <td
                    className={cn(cellPad, "text-right text-muted-foreground")}
                  >
                    {r.nonPpn > 0 ? formatRupiahShort(r.nonPpn) : "—"}
                  </td>
                  <td className={cn(cellPad, "text-muted-foreground")}>
                    {r.lastFu ? formatDateShort(r.lastFu) : "—"}
                  </td>
                  <td className={cellPad}>
                    {r.nextFu ? (
                      <span
                        className={
                          overdue
                            ? "text-rose-600 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {formatDateShort(r.nextFu)}
                        {overdue && (
                          <span className="ml-1 text-[10px]">overdue</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn(cellPad, "text-right")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="tabular-nums">
                        {r.activeCommercialCount}
                      </span>
                      {r.activeCommercialTypes.slice(0, 2).map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="border-muted-foreground/20 px-1 py-0 text-[10px] font-normal text-muted-foreground"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={cellPad}>
                    <RiskDot risk={r.risk} />
                  </td>
                  <td className={cellPad}>
                    <RowActions
                      clientId={r.client.id}
                      clientName={r.client.name}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="divide-y md:hidden">
        {pageRows.map((r) => (
          <Link
            key={r.client.id}
            to="/clients/$clientId"
            params={{ clientId: r.client.id }}
            className="flex flex-col gap-1.5 px-3 py-3 active:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.client.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.ownerName} · {r.client.source}
                </p>
              </div>
              <StatusBadge status={r.client.status} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums font-medium">
                {r.spendingYtd > 0 ? formatRupiahShort(r.spendingYtd) : "Rp0"}
              </span>
              <div className="flex items-center gap-2 text-muted-foreground">
                {r.nextFu && <span>Next: {formatDateShort(r.nextFu)}</span>}
                <RiskDot risk={r.risk} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {sorted.length === 0
            ? "0"
            : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, sorted.length)} dari ${sorted.length}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Th({
  onClick,
  label,
  active,
  align = "left",
}: {
  onClick: () => void;
  label: string;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "font-medium",
        align === "right" ? "text-right" : "text-left",
        "py-2 px-3",
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

function RowActions({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [followUpOpen, setFollowUpOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link to="/clients/$clientId" params={{ clientId }}>
              <Eye className="h-4 w-4" /> View profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFollowUpOpen(true)}>
            <PhoneCall className="h-4 w-4" /> Add Follow Up
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              toast.info(
                "Prototype: Add Commercial Item flow akan tersedia di Phase 3.",
              )
            }
          >
            <Package className="h-4 w-4" /> Add Commercial Item
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-amber-700 focus:text-amber-800"
            onSelect={() =>
              toast.warning(`Arsipkan ${clientName}?`, {
                description:
                  "Prototype: klien tidak akan dihapus, hanya disembunyikan dari daftar aktif.",
                action: {
                  label: "Arsipkan",
                  onClick: () => toast.success(`${clientName} diarsipkan`),
                },
              })
            }
          >
            <Archive className="h-4 w-4" /> Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddFollowUpDialog
        clientName={clientName}
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
      />
    </>
  );
}
