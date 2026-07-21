import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkPlus,
  Filter,
  LayoutList,
  Rows3,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";

import { useRole } from "@/context/role-context";
import { CLIENT_STATUSES } from "@/lib/business-rules";
import { listClientRows, listSalesTeamProfiles } from "@/lib/data/clients";
import { listSalesOrders } from "@/lib/data/sales-orders";
import { revenueByTax } from "@/lib/data/dashboard-selectors";
import { ClientsTable } from "@/components/clients/ClientsTable";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { daysBetween, formatRupiahShort } from "@/lib/format";
import { NOW } from "@/lib/domain";
import type { ClientSource, ClientStatus } from "@/lib/domain";

const SOURCES: ClientSource[] = [
  "Referral",
  "Website Inquiry",
  "Business Relationship",
  "Repeat",
];
const COMMERCIAL_TYPE_FILTERS = [
  "RFQ",
  "Quotation",
  "Direct Order",
  "Prototype",
] as const;
type SavedView = { name: string; description: string };
const SAVED_VIEWS: SavedView[] = [
  { name: "Semua Klien", description: "Default" },
  { name: "Butuh Perhatian", description: "Overdue FU + dormant" },
  { name: "Prospect Aktif", description: "Prospect dengan next FU" },
];

export const Route = createFileRoute("/_app/clients/")({
  head: () => ({ meta: [{ title: "Clients · DSM Sales Execution" }] }),
  component: ClientListPage,
});

function ClientListPage() {
  const { role, authReady } = useRole();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["clients", "rows"],
    queryFn: listClientRows,
    enabled: authReady,
  });
  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && role !== "sales",
  });
  const { data: salesOrders = [] } = useQuery({
    queryKey: ["sales-orders", "all"],
    queryFn: listSalesOrders,
    enabled: authReady,
  });

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ClientStatus[]>([]);
  const [sources, setSources] = useState<ClientSource[]>([]);
  const [ownerId, setOwnerId] = useState<string>("all");
  const [commercialTypes, setCommercialTypes] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [nextFuWindow, setNextFuWindow] = useState<string>("all");
  const [spendingRange, setSpendingRange] = useState<[number, number]>([
    0, 3000,
  ]); // in juta (Rp M)
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [page, setPage] = useState(1);
  const [savedView, setSavedView] = useState<SavedView>(SAVED_VIEWS[0]);
  const pageSize = 10;

  // Compute per-client PPN/Non-PPN from real Sales Orders data
  const enrichedRows = useMemo(() => {
    if (salesOrders.length === 0) return rows;
    return rows.map((row) => {
      const tax = revenueByTax(
        salesOrders.filter((so) => so.clientId === row.client.id),
      );
      return { ...row, ppn: tax.ppn, nonPpn: tax.nonPpn };
    });
  }, [rows, salesOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedRows.filter((r) => {
      if (q && !r.client.name.toLowerCase().includes(q)) return false;
      if (statuses.length && !statuses.includes(r.client.status)) return false;
      if (sources.length && !sources.includes(r.client.source)) return false;
      if (ownerId !== "all" && r.client.ownerId !== ownerId) return false;
      if (
        commercialTypes.length &&
        !commercialTypes.some((t) => r.activeCommercialTypes.includes(t))
      )
        return false;
      const spendJuta = r.spendingYtd / 1_000_000;
      if (spendJuta < spendingRange[0]) return false;
      if (spendingRange[1] < 3000 && spendJuta > spendingRange[1]) return false;
      if (overdueOnly) {
        if (!r.nextFu) return false;
        if (daysBetween(NOW, r.nextFu) >= 0) return false;
      }
      if (nextFuWindow !== "all") {
        if (!r.nextFu) return false;
        const diff = daysBetween(NOW, r.nextFu);
        if (nextFuWindow === "today" && diff !== 0) return false;
        if (nextFuWindow === "7d" && (diff < 0 || diff > 7)) return false;
        if (nextFuWindow === "30d" && (diff < 0 || diff > 30)) return false;
      }
      return true;
    });
  }, [
    enrichedRows,
    search,
    statuses,
    sources,
    ownerId,
    commercialTypes,
    overdueOnly,
    nextFuWindow,
    spendingRange,
  ]);

  const activeFilterCount =
    statuses.length +
    sources.length +
    (ownerId !== "all" ? 1 : 0) +
    commercialTypes.length +
    (overdueOnly ? 1 : 0) +
    (nextFuWindow !== "all" ? 1 : 0) +
    (spendingRange[0] > 0 || spendingRange[1] < 3000 ? 1 : 0);

  const resetFilters = () => {
    setStatuses([]);
    setSources([]);
    setOwnerId("all");
    setCommercialTypes([]);
    setOverdueOnly(false);
    setNextFuWindow("all");
    setSpendingRange([0, 3000]);
    setSearch("");
    setPage(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Kelola akun klien—dari prospect hingga repeat order. Fokus pada
            hubungan yang sudah ada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedViewsDropdown
            current={savedView}
            onPick={(v) => {
              setSavedView(v);
              if (v.name === "Butuh Perhatian") {
                setOverdueOnly(true);
                setStatuses([]);
                setSources([]);
                setOwnerId("all");
                setCommercialTypes([]);
                setNextFuWindow("all");
                setSpendingRange([0, 3000]);
              } else if (v.name === "Prospect Aktif") {
                setOverdueOnly(false);
                setStatuses(["Prospect"]);
                setSources([]);
                setOwnerId("all");
                setCommercialTypes([]);
                setNextFuWindow("all");
                setSpendingRange([0, 3000]);
              } else {
                resetFilters();
              }
              setPage(1);
            }}
          />
          <AddClientDialog />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nama klien…"
              className="h-9 pl-8"
            />
          </div>

          <StatusFilter statuses={statuses} onChange={setStatuses} />
          <SourceFilter sources={sources} onChange={setSources} />

          {role !== "sales" && (
            <Select
              value={ownerId}
              onValueChange={(v) => {
                setOwnerId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Sales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Sales</SelectItem>
                {salesTeam.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={nextFuWindow}
            onValueChange={(v) => {
              setNextFuWindow(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Next FU" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Next FU</SelectItem>
              <SelectItem value="today">Hari ini</SelectItem>
              <SelectItem value="7d">7 hari ke depan</SelectItem>
              <SelectItem value="30d">30 hari ke depan</SelectItem>
            </SelectContent>
          </Select>

          <AdvancedFilters
            commercialTypes={commercialTypes}
            setCommercialTypes={(v) => {
              setCommercialTypes(v);
              setPage(1);
            }}
            overdueOnly={overdueOnly}
            setOverdueOnly={(v) => {
              setOverdueOnly(v);
              setPage(1);
            }}
            spendingRange={spendingRange}
            setSpendingRange={(v) => {
              setSpendingRange(v);
              setPage(1);
            }}
          />

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4" /> Reset ({activeFilterCount})
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Density
            </span>
            <ToggleGroup
              type="single"
              size="sm"
              value={density}
              onValueChange={(v) =>
                v && setDensity(v as "compact" | "comfortable")
              }
              className="hidden sm:flex"
            >
              <ToggleGroupItem value="compact" aria-label="Compact">
                <Rows3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="comfortable" aria-label="Comfortable">
                <LayoutList className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {statuses.map((s) => (
              <FilterChip
                key={s}
                label={s}
                onRemove={() => setStatuses(statuses.filter((x) => x !== s))}
              />
            ))}
            {sources.map((s) => (
              <FilterChip
                key={s}
                label={s}
                onRemove={() => setSources(sources.filter((x) => x !== s))}
              />
            ))}
            {commercialTypes.map((t) => (
              <FilterChip
                key={t}
                label={t}
                onRemove={() =>
                  setCommercialTypes(commercialTypes.filter((x) => x !== t))
                }
              />
            ))}
            {overdueOnly && (
              <FilterChip
                label="Overdue FU"
                onRemove={() => setOverdueOnly(false)}
              />
            )}
            {(spendingRange[0] > 0 || spendingRange[1] < 3000) && (
              <FilterChip
                label={`Spending ${formatRupiahShort(spendingRange[0] * 1_000_000)} – ${
                  spendingRange[1] >= 3000
                    ? "∞"
                    : formatRupiahShort(spendingRange[1] * 1_000_000)
                }`}
                onRemove={() => setSpendingRange([0, 3000])}
              />
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {!authReady || isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
          Loading clients…
        </div>
      ) : (
        <ClientsTable
          rows={filtered}
          density={density}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
      {label}
      <button
        onClick={onRemove}
        className="ml-1 rounded-full p-0.5 hover:bg-background/50"
        aria-label={`Hapus filter ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function StatusFilter({
  statuses,
  onChange,
}: {
  statuses: ClientStatus[];
  onChange: (v: ClientStatus[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          Status{" "}
          {statuses.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {statuses.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Filter status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CLIENT_STATUSES.map((s) => (
          <DropdownMenuCheckboxItem
            key={s}
            checked={statuses.includes(s)}
            onCheckedChange={(v) =>
              onChange(v ? [...statuses, s] : statuses.filter((x) => x !== s))
            }
          >
            {s}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SourceFilter({
  sources,
  onChange,
}: {
  sources: ClientSource[];
  onChange: (v: ClientSource[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          Sumber{" "}
          {sources.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {sources.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Filter sumber</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SOURCES.map((s) => (
          <DropdownMenuCheckboxItem
            key={s}
            checked={sources.includes(s)}
            onCheckedChange={(v) =>
              onChange(v ? [...sources, s] : sources.filter((x) => x !== s))
            }
          >
            {s}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdvancedFilters({
  commercialTypes,
  setCommercialTypes,
  overdueOnly,
  setOverdueOnly,
  spendingRange,
  setSpendingRange,
}: {
  commercialTypes: string[];
  setCommercialTypes: (v: string[]) => void;
  overdueOnly: boolean;
  setOverdueOnly: (v: boolean) => void;
  spendingRange: [number, number];
  setSpendingRange: (v: [number, number]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Filter className="h-4 w-4" /> Lanjutan
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Commercial Type
          </Label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Belum tersedia — menunggu migrasi Commercial Items.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 opacity-50">
            {COMMERCIAL_TYPE_FILTERS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  disabled
                  checked={commercialTypes.includes(t)}
                  onChange={(e) =>
                    setCommercialTypes(
                      e.target.checked
                        ? [...commercialTypes, t]
                        : commercialTypes.filter((x) => x !== t),
                    )
                  }
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Spending YTD
            </Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatRupiahShort(spendingRange[0] * 1_000_000)} –{" "}
              {spendingRange[1] >= 3000
                ? "∞"
                : formatRupiahShort(spendingRange[1] * 1_000_000)}
            </span>
          </div>
          <Slider
            className="mt-3"
            min={0}
            max={3000}
            step={50}
            value={spendingRange}
            onValueChange={(v) =>
              setSpendingRange([v[0], v[1]] as [number, number])
            }
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-2">
          <div>
            <p className="text-sm font-medium">Overdue Follow Up</p>
            <p className="text-xs text-muted-foreground">Next FU sudah lewat</p>
          </div>
          <Switch checked={overdueOnly} onCheckedChange={setOverdueOnly} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SavedViewsDropdown({
  current,
  onPick,
}: {
  current: SavedView;
  onPick: (v: SavedView) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Bookmark className="h-4 w-4" /> {current.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SAVED_VIEWS.map((v) => (
          <DropdownMenuCheckboxItem
            key={v.name}
            checked={v.name === current.name}
            onCheckedChange={() => onPick(v)}
          >
            <span className="flex flex-col">
              <span>{v.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {v.description}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <button
          className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
          onClick={() =>
            toast.info(
              "Prototype: Simpan filter saat ini sebagai view kustom (belum tersedia).",
            )
          }
        >
          <BookmarkPlus className="h-4 w-4" /> Simpan view saat ini
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
