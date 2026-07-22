import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutGrid,
  Table as TableIcon,
  Search,
  Filter,
  User2,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatRupiahShort, formatDateShort, daysBetween } from "@/lib/format";
import { NOW } from "@/lib/domain";
import { useRole } from "@/context/role-context";
import type { CommercialItem } from "@/lib/domain";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { useQuery } from "@tanstack/react-query";
import { listCommercialItems } from "@/lib/data/commercial-items";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";

// RFQ and Quotations are the only remaining CommercialViews consumers
// (Customer PO/Prototypes/Repeat Orders were removed 2026-07-20). RFQ intake
// and quotation-stage work share the same source flow, so route-level filters
// must combine document type and stage boundaries.
export type CommercialViewFilter = {
  types?: CommercialItem["type"][];
  stages?: string[];
};

export type CommercialViewsProps = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  filter: CommercialViewFilter;
  stages: string[];
  detailBasePath: string; // e.g. "/rfq"
  headerAction?: ReactNode;
  emptyHint?: string;
};

type ViewMode = "table" | "board";

export function CommercialViews(props: CommercialViewsProps) {
  const { role, authReady } = useRole();
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const [view, setView] = useState<ViewMode>("table");
  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && role !== "sales",
  });
  const clients = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);

  const scoped = useMemo(() => {
    // RLS already scopes `allItems` server-side — no further role filter
    // needed here.
    let items = allItems.filter(
      (item) => item.type !== "Quotation" || item.isCurrentRevision !== false,
    );
    if (props.filter.types) {
      const set = new Set(props.filter.types);
      items = items.filter((i) => set.has(i.type));
    }
    if (props.filter.stages) {
      const set = new Set(props.filter.stages);
      items = items.filter((i) => set.has(i.stage));
    }
    return items;
  }, [allItems, props.filter]);

  const filtered = useMemo(() => {
    return scoped.filter((it) => {
      if (ownerFilter !== "all" && it.ownerId !== ownerFilter) return false;
      if (stageFilter !== "all" && it.stage !== stageFilter) return false;
      if (q) {
        const c = clients[it.clientId];
        const hay = [
          c?.name,
          it.description,
          it.projectName,
          it.quotationNumber,
          it.customerPoNumber,
          it.soNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [scoped, ownerFilter, stageFilter, q, clients]);

  const totalValue = filtered.reduce((s, it) => s + it.estimatedValue, 0);

  const grouped = useMemo(() => {
    const m = new Map<string, CommercialItem[]>();
    for (const st of props.stages) m.set(st, []);
    for (const it of filtered) {
      const key = props.stages.includes(it.stage) ? it.stage : props.stages[0];
      m.get(key)!.push(it);
    }
    return m;
  }, [filtered, props.stages]);

  if (!authReady || isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {props.icon}
            {props.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} dokumen · Total estimasi{" "}
            {formatRupiahShort(totalValue)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {props.headerAction}
          <div className="inline-flex rounded-md border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs",
                view === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs",
                view === "board"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Stage
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
        <span className="flex items-center gap-1 pl-1 pr-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari klien, project, no. dokumen…"
            className="h-8 w-[240px] pl-7 text-xs"
          />
        </div>
        {role !== "sales" && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <User2 className="h-3.5 w-3.5" />
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua sales</SelectItem>
              {salesTeam.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua stage</SelectItem>
            {props.stages.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(q || ownerFilter !== "all" || stageFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setQ("");
              setOwnerFilter("all");
              setStageFilter("all");
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm font-medium">Tidak ada data</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {props.emptyHint ??
                "Coba ubah filter atau reset pencarian untuk melihat item lainnya."}
            </p>
          </CardContent>
        </Card>
      ) : view === "table" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klien</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Source flow</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Estimasi</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead>No. Quotation</TableHead>
                    <TableHead>No. Customer PO</TableHead>
                    <TableHead>No. SO</TableHead>
                    <TableHead>Next FU</TableHead>
                    <TableHead>Aging</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((it) => {
                    const client = clients[it.clientId];
                    const owner = owners[it.ownerId];
                    const next = it.nextActionDate;
                    const nextDays = next ? daysBetween(NOW, next) : null;
                    const aging = daysBetween(new Date(it.updatedAt), NOW);
                    const overdue = nextDays !== null && nextDays < 0;
                    return (
                      <TableRow key={it.id} className="hover:bg-muted/40">
                        <TableCell className="max-w-[200px]">
                          <div className="truncate font-medium">
                            {client?.name ?? "-"}
                          </div>
                          {client && (
                            <div className="mt-0.5">
                              <StatusBadge status={client.status} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate text-sm">
                            {it.projectName ?? it.description}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {it.description}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {it.documentDate
                            ? formatDateShort(it.documentDate)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {it.itemCount ?? 0}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {owner?.name ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {it.sourceFlow}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {it.stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {it.prototypeStatus === "FOC" ? (
                            <span className="text-muted-foreground">
                              FOC · Rp0
                            </span>
                          ) : (
                            formatRupiahShort(it.estimatedValue)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                          {it.type === "Quotation"
                            ? it.forecastValue === null ||
                              it.forecastValue === undefined
                              ? "Belum tersedia"
                              : formatRupiahShort(it.forecastValue)
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-[11px]">
                          {it.quotationNumber ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-[11px]">
                          {it.customerPoNumber ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-[11px]">
                          {it.soNumber ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {next ? (
                            <span
                              className={cn(
                                "tabular-nums",
                                overdue && "text-rose-600 font-medium",
                                nextDays === 0 && "text-amber-700 font-medium",
                              )}
                            >
                              {overdue
                                ? `overdue ${Math.abs(nextDays!)}h`
                                : nextDays === 0
                                  ? "hari ini"
                                  : formatDateShort(next)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {aging}h
                        </TableCell>
                        <TableCell className="w-[80px]">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                          >
                            <Link
                              to={`${props.detailBasePath}/${it.id}` as never}
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
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {props.stages.map((stage) => {
            const col = grouped.get(stage) ?? [];
            const sum = col.reduce((s, it) => s + it.estimatedValue, 0);
            return (
              <div
                key={stage}
                className="flex w-[280px] shrink-0 flex-col rounded-lg border bg-muted/30"
              >
                <div className="flex items-center justify-between border-b bg-card px-3 py-2 rounded-t-lg">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
                      {stage}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {col.length} · {formatRupiahShort(sum)}
                    </p>
                  </div>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-soft px-1.5 text-[11px] font-medium tabular-nums text-primary">
                    {col.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2 min-h-[80px]">
                  {col.length === 0 ? (
                    <div className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
                      Kosong
                    </div>
                  ) : (
                    col.map((it) => {
                      const client = clients[it.clientId];
                      const owner = owners[it.ownerId];
                      const next = it.nextActionDate;
                      const nextDays = next ? daysBetween(NOW, next) : null;
                      return (
                        <Link
                          key={it.id}
                          to={`${props.detailBasePath}/${it.id}` as never}
                          className="group flex flex-col gap-1.5 rounded-md border bg-card p-2.5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                              {client?.name ?? "-"}
                            </p>
                            <Badge
                              variant="outline"
                              className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                            >
                              {it.type}
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {it.projectName ?? it.description}
                          </p>
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[12px] font-semibold tabular-nums text-foreground">
                              {it.prototypeStatus === "FOC"
                                ? "FOC · Rp0"
                                : formatRupiahShort(it.estimatedValue)}
                            </span>
                            {client && <StatusBadge status={client.status} />}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {it.itemCount ?? 0} item
                            {it.type === "Quotation"
                              ? ` · Forecast ${
                                  it.forecastValue === null ||
                                  it.forecastValue === undefined
                                    ? "Belum tersedia"
                                    : formatRupiahShort(it.forecastValue)
                                }`
                              : ""}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="truncate">
                              {owner?.name ?? "-"}
                            </span>
                            {next && (
                              <span
                                className={cn(
                                  "tabular-nums",
                                  nextDays! < 0 && "text-rose-600 font-medium",
                                  nextDays === 0 &&
                                    "text-amber-700 font-medium",
                                )}
                              >
                                {nextDays! < 0
                                  ? `overdue ${Math.abs(nextDays!)}h`
                                  : nextDays === 0
                                    ? "hari ini"
                                    : formatDateShort(next)}
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
