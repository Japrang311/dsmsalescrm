import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  DateRangePicker,
  type PeriodRange,
} from "@/components/dashboard/DateRangePicker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import { useRole } from "@/context/role-context-core";
import {
  Activity,
  Phone,
  Mail,
  MessageCircle,
  Users,
  FileText,
  ShoppingCart,
  CheckSquare,
  ArrowRightLeft,
  GitBranch,
  Download,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { EmptyExportError } from "@/lib/export-csv";
import {
  exportActivityCsv,
  exportActivityPdf,
  type ActivityExportEvent,
} from "@/lib/export-activity";
import type { FeedEvent } from "@/lib/data/activity-feed";
import {
  listActivityFeedPage,
  listAllActivityFeedEvents,
  listRelatedActivityFeedEvents,
  mapActivityFeedRow,
  type ActivityFeedFilters,
} from "@/lib/data/activity-feed-page";
import { listQueryKey, serializeListFilters } from "@/lib/pagination-contracts";
import { toLocalIsoDate } from "@/lib/domain";

export const Route = createFileRoute("/_app/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log · DSM Sales Execution" },
      {
        name: "description",
        content:
          "Timeline aktivitas terpadu: follow-up, perubahan status, pipeline, quotation, dan sales order.",
      },
    ],
  }),
  component: ActivityPage,
});

const KIND_META: Record<
  FeedEvent["kind"],
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  client_created: {
    label: "Client Baru",
    icon: Users,
    color: "bg-cyan-100 text-cyan-700",
  },
  follow_up: {
    label: "Follow-Up",
    icon: Phone,
    color: "bg-blue-100 text-blue-700",
  },
  status_change: {
    label: "Perubahan Status",
    icon: ArrowRightLeft,
    color: "bg-amber-100 text-amber-700",
  },
  ownership_change: {
    label: "Perubahan Owner",
    icon: Users,
    color: "bg-sky-100 text-sky-700",
  },
  commercial_history: {
    label: "Pipeline Update",
    icon: GitBranch,
    color: "bg-violet-100 text-violet-700",
  },
  task_history: {
    label: "Task Update",
    icon: CheckSquare,
    color: "bg-slate-100 text-slate-700",
  },
  commercial_created: {
    label: "Commercial Baru",
    icon: FileText,
    color: "bg-emerald-100 text-emerald-700",
  },
  order_created: {
    label: "Sales Order",
    icon: ShoppingCart,
    color: "bg-teal-100 text-teal-700",
  },
  task_created: {
    label: "Task Baru",
    icon: Users,
    color: "bg-indigo-100 text-indigo-700",
  },
  so_tax_change: {
    label: "Koreksi Pajak SO",
    icon: ShoppingCart,
    color: "bg-rose-100 text-rose-700",
  },
  record_lifecycle: {
    label: "Hapus / Pulihkan",
    icon: ArrowRightLeft,
    color: "bg-orange-100 text-orange-700",
  },
  team_admin: {
    label: "Administrasi Tim & Role",
    icon: Users,
    color: "bg-cyan-100 text-cyan-700",
  },
};

function methodIcon(method: string) {
  switch (method) {
    case "Phone":
      return Phone;
    case "Email":
      return Mail;
    case "WhatsApp":
      return MessageCircle;
    default:
      return Users;
  }
}

const PAGE_SIZE = 25;

function ActivityPage() {
  const { role, authReady } = useRole();

  // owners/clients stay small, unbounded lookups — same pattern as every
  // other route (Sales Orders, Clients). The heavy reads (activity_log +
  // follow_up_logs merged into one timeline) are server-paginated below via
  // the activity_feed_events view.
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  // Owner filter options, deliberately NOT `owners`: that lookup is every
  // profile (needed so a row logged by a deactivated account still renders a
  // name instead of a raw id). Offering all of them as filters listed people
  // who can't own anything — a director, deactivated reps, a QA account —
  // and picking one always returned an empty feed.
  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady,
  });

  const [kindFilter, setKindFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [rangePreset, setRangePreset] = useState<string>("30");
  const [customRange, setCustomRange] = useState<PeriodRange>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 29);
    return { from, to };
  });

  const activeRange = useMemo<PeriodRange | null>(() => {
    if (rangePreset === "all") return null;
    if (rangePreset === "custom") return customRange;
    const days = Number(rangePreset);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, [rangePreset, customRange]);

  const clientsById = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);
  const clientName = (id?: string) => (id ? clientsById[id]?.name : undefined);

  const serverFilters = useMemo<ActivityFeedFilters>(
    () => ({
      from: activeRange?.from,
      to: activeRange
        ? new Date(
            activeRange.to.getFullYear(),
            activeRange.to.getMonth(),
            activeRange.to.getDate(),
            23,
            59,
            59,
            999,
          )
        : undefined,
      feedKind: kindFilter,
      ownerId: ownerFilter,
      query,
    }),
    [activeRange, kindFilter, ownerFilter, query],
  );
  const filterKey = useMemo(
    () =>
      serializeListFilters({
        from: serverFilters.from?.toISOString(),
        to: serverFilters.to?.toISOString(),
        feedKind: serverFilters.feedKind,
        ownerId: serverFilters.ownerId,
        query: serverFilters.query,
      }),
    [serverFilters],
  );

  const feedQuery = useInfiniteQuery({
    queryKey: listQueryKey("activity-log", "page", {
      filters: { key: filterKey },
    }),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listActivityFeedPage({
        filters: serverFilters,
        page: { pageSize: PAGE_SIZE, cursor: pageParam },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: authReady,
  });

  const events = useMemo<FeedEvent[]>(
    () =>
      (feedQuery.data?.pages ?? []).flatMap((page) =>
        page.rows.map((row) => mapActivityFeedRow(row, owners)),
      ),
    [feedQuery.data, owners],
  );
  const totalCount = feedQuery.data?.pages[0]?.totalCount ?? 0;
  const hasMore = feedQuery.hasNextPage;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((x) => x.isIntersecting) &&
          !feedQuery.isFetchingNextPage
        ) {
          void feedQuery.fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, feedQuery]);

  const grouped = useMemo(() => {
    const m = new Map<string, FeedEvent[]>();
    for (const e of events) {
      const day = e.at.slice(0, 10);
      const arr = m.get(day) ?? [];
      arr.push(e);
      m.set(day, arr);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [events]);

  const rangeLabel = useMemo(() => {
    if (rangePreset === "all") return "Semua waktu";
    if (rangePreset === "custom") {
      const f = customRange.from.toLocaleDateString("id-ID");
      const t = customRange.to.toLocaleDateString("id-ID");
      return `${f} – ${t}`;
    }
    return `${rangePreset} hari terakhir`;
  }, [rangePreset, customRange]);

  // Export must cover every filtered event, not just the loaded pages, so
  // it fetches the full filtered set on demand — same pattern as Sales
  // Orders' export.
  async function handleExport(format: "CSV" | "PDF") {
    const toastId = toast.loading(`Menyiapkan Activity Log (${format})…`);
    try {
      const rows = await listAllActivityFeedEvents(serverFilters);
      const payload: ActivityExportEvent[] = rows.map((row) => {
        const e = mapActivityFeedRow(row, owners);
        return {
          id: e.id,
          at: e.at,
          kindLabel: e.kindLabel ?? KIND_META[e.kind].label,
          clientName: clientName(e.clientId),
          ownerName: e.ownerName,
          title: e.title,
          detail: e.detail,
          linkLabel: e.link?.label,
        };
      });
      const meta = {
        role,
        rangeLabel,
        filters: {
          keyword: query || undefined,
          kind:
            kindFilter === "all"
              ? "Semua jenis"
              : (KIND_META[kindFilter as FeedEvent["kind"]]?.label ??
                kindFilter),
          owner:
            ownerFilter === "all"
              ? "Semua owner"
              : (owners[ownerFilter]?.name ?? ownerFilter),
        },
        fromISO: toLocalIsoDate(activeRange?.from ?? new Date(0)),
        toISO: toLocalIsoDate(activeRange?.to ?? new Date()),
      };
      const count =
        format === "CSV"
          ? exportActivityCsv(payload, meta)
          : exportActivityPdf(payload, meta);
      toast.success(`Activity Log berhasil di-export`, {
        id: toastId,
        description: `${format} · ${count.toLocaleString("id-ID")} baris data.`,
      });
    } catch (err) {
      if (err instanceof EmptyExportError) {
        toast.error("Tidak ada data untuk di-export", {
          id: toastId,
          description: err.message + " Ubah filter dan coba lagi.",
        });
        return;
      }
      console.error("[export] activity failed", err);
      toast.error(`Gagal export Activity Log`, {
        id: toastId,
        description:
          err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.",
      });
    }
  }

  const [selected, setSelected] = useState<FeedEvent | null>(null);
  const relatedQuery = useQuery({
    queryKey: ["activity-log", "related", selected?.id],
    queryFn: () =>
      listRelatedActivityFeedEvents({
        excludeEventId: selected!.id,
        at: selected!.at,
        clientId: selected!.clientId,
        commercialItemId: selected!.commercialItemId,
        salesOrderId: selected!.salesOrderId,
      }),
    enabled:
      !!selected &&
      (!!selected.clientId ||
        !!selected.commercialItemId ||
        !!selected.salesOrderId),
  });
  const relatedEvents = useMemo<FeedEvent[]>(
    () =>
      (relatedQuery.data ?? []).map((row) => mapActivityFeedRow(row, owners)),
    [relatedQuery.data, owners],
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Timeline aktivitas terpadu — follow-up, perubahan status, pipeline,
            dan dokumen komersial.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleExport("CSV")}>
              <FileDown className="mr-2 h-4 w-4" /> Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport("PDF")}>
              <FileDown className="mr-2 h-4 w-4" /> Export PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Input
            placeholder="Cari client / catatan / owner…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Jenis aktivitas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua jenis</SelectItem>
              {Object.entries(KIND_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {role !== "sales" && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua owner</SelectItem>
                {salesTeam.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Select value={rangePreset} onValueChange={setRangePreset}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Rentang tanggal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 hari terakhir</SelectItem>
                <SelectItem value="30">30 hari terakhir</SelectItem>
                <SelectItem value="90">90 hari terakhir</SelectItem>
                <SelectItem value="all">Semua waktu</SelectItem>
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>
            {rangePreset === "custom" && (
              <DateRangePicker
                value={customRange}
                onChange={(r) => setCustomRange(r)}
              />
            )}
          </div>
          <div className="flex items-center justify-end text-sm text-muted-foreground md:col-span-3 lg:col-span-4">
            {totalCount} aktivitas
            {activeRange && (
              <span className="ml-2 text-xs">
                · {activeRange.from.toLocaleDateString("id-ID")} —{" "}
                {activeRange.to.toLocaleDateString("id-ID")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {grouped.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Belum ada aktivitas untuk filter ini.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {new Date(day).toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <Card>
                <CardContent className="divide-y p-0">
                  {items.map((e) => {
                    const meta = KIND_META[e.kind];
                    const Icon =
                      e.kind === "follow_up"
                        ? methodIcon(e.title.split(" ")[0])
                        : meta.icon;
                    const cName = clientName(e.clientId);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelected(e)}
                        className="flex w-full gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/60"
                      >
                        <div
                          className={`h-9 w-9 shrink-0 rounded-full ${meta.color} flex items-center justify-center`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {e.kindLabel ?? meta.label}
                            </Badge>
                            <span className="text-sm font-medium">
                              {e.title}
                            </span>
                            {cName && e.clientId && (
                              <Link
                                to="/clients/$clientId"
                                params={{ clientId: e.clientId }}
                                onClick={(ev) => ev.stopPropagation()}
                                className="text-sm text-primary hover:underline"
                              >
                                {cName}
                              </Link>
                            )}
                          </div>
                          {e.detail && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {e.detail}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {e.kind === "team_admin"
                                ? `Aktor: ${e.actorName ?? "Tidak tersedia"} · Target: ${e.targetName ?? "Tidak tersedia"}`
                                : e.kind === "ownership_change"
                                  ? `Aktor: ${e.ownerName ?? "Tidak tersedia"} · Owner baru: ${e.targetName ?? "Tidak tersedia"}`
                                  : (e.ownerName ?? "System")}{" "}
                              {" · "}
                              {new Date(e.at).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {e.link && (
                              <Link
                                to={e.link.to as never}
                                params={(e.link.params ?? {}) as never}
                                onClick={(ev) => ev.stopPropagation()}
                                className="font-medium text-primary hover:underline"
                              >
                                {e.link.label} →
                              </Link>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
          <div ref={sentinelRef} />
          <div className="pt-2 text-center text-xs text-muted-foreground">
            {hasMore
              ? `Memuat lebih banyak… (${events.length} dari ${totalCount})`
              : `Menampilkan semua ${totalCount} aktivitas`}
          </div>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
        >
          {selected &&
            (() => {
              const meta = KIND_META[selected.kind];
              const Icon =
                selected.kind === "follow_up"
                  ? methodIcon(selected.title.split(" ")[0])
                  : meta.icon;
              const cName = clientName(selected.clientId);
              return (
                <>
                  <SheetHeader className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-9 w-9 rounded-full ${meta.color} flex items-center justify-center`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {selected.kindLabel ?? meta.label}
                      </Badge>
                    </div>
                    <SheetTitle className="text-left text-base">
                      {selected.title}
                    </SheetTitle>
                    <SheetDescription className="text-left">
                      {new Date(selected.at).toLocaleString("id-ID", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-4 space-y-4 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      {selected.actorName && (
                        <>
                          <div className="text-muted-foreground">Aktor</div>
                          <div className="col-span-2 font-medium">
                            {selected.actorName}
                          </div>
                        </>
                      )}
                      {selected.targetName && (
                        <>
                          <div className="text-muted-foreground">Target</div>
                          <div className="col-span-2 font-medium">
                            {selected.targetName}
                          </div>
                        </>
                      )}
                      {selected.ownerName && (
                        <>
                          <div className="text-muted-foreground">Owner</div>
                          <div className="col-span-2 font-medium">
                            {selected.ownerName}
                          </div>
                        </>
                      )}
                      {cName && selected.clientId && (
                        <>
                          <div className="text-muted-foreground">Client</div>
                          <div className="col-span-2">
                            <Link
                              to="/clients/$clientId"
                              params={{ clientId: selected.clientId }}
                              className="text-primary hover:underline"
                              onClick={() => setSelected(null)}
                            >
                              {cName}
                            </Link>
                          </div>
                        </>
                      )}
                      <div className="text-muted-foreground">ID</div>
                      <div className="col-span-2 font-mono text-xs text-muted-foreground">
                        {selected.id}
                      </div>
                    </div>

                    {selected.detail && (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        {selected.detail}
                      </div>
                    )}

                    {selected.administrativeReason && (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Alasan Administratif
                        </div>
                        {selected.administrativeReason}
                      </div>
                    )}

                    {selected.link && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="w-full"
                      >
                        <Link
                          to={selected.link.to as never}
                          params={(selected.link.params ?? {}) as never}
                          onClick={() => setSelected(null)}
                        >
                          {selected.link.label} →
                        </Link>
                      </Button>
                    )}

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Perubahan Terkait ({relatedEvents.length})
                      </div>
                      {relatedEvents.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Tidak ada aktivitas terkait dalam rentang ±7 hari.
                        </p>
                      ) : (
                        <ol className="relative space-y-3 border-l pl-4">
                          {relatedEvents.map((r) => {
                            const rMeta = KIND_META[r.kind];
                            const RIcon = rMeta.icon;
                            return (
                              <li key={r.id} className="relative">
                                <span
                                  className={`absolute -left-[22px] flex h-4 w-4 items-center justify-center rounded-full ${rMeta.color}`}
                                >
                                  <RIcon className="h-2.5 w-2.5" />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelected(r)}
                                  className="w-full rounded-md p-2 text-left hover:bg-muted/40"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {r.kindLabel ?? rMeta.label}
                                    </Badge>
                                    <span className="text-sm font-medium">
                                      {r.title}
                                    </span>
                                  </div>
                                  {r.detail && (
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                      {r.detail}
                                    </p>
                                  )}
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {r.kind === "team_admin"
                                      ? `Aktor: ${r.actorName ?? "Tidak tersedia"} · Target: ${r.targetName ?? "Tidak tersedia"}`
                                      : r.kind === "ownership_change"
                                        ? `Aktor: ${r.ownerName ?? "Tidak tersedia"} · Owner baru: ${r.targetName ?? "Tidak tersedia"}`
                                        : (r.ownerName ?? "System")}{" "}
                                    {" · "}
                                    {new Date(r.at).toLocaleString("id-ID", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
