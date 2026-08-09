import { Bell, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ROLE_LABEL, useRole } from "@/context/role-context-core";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  hasTaskDueState,
  isTaskOverdueLike,
} from "@/lib/data/dashboard-selectors";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { AddFollowUpDialog } from "@/components/clients/AddFollowUpDialog";
import {
  CreateQuotationDialog,
  CreateSalesOrderDialog,
  CreatePrototypeDialog,
} from "@/components/clients/CreateRecordDialogs";

type QuickCreateKind = "followup" | "client" | "quotation" | "so" | "prototype";

export const QUICK_CREATE_ITEMS = [
  { kind: "followup", label: "New Follow Up" },
  { kind: "client", label: "New Client" },
  { kind: "quotation", label: "New Quotation" },
  { kind: "so", label: "Record Sales Order" },
  { kind: "prototype", label: "New Prototype Request" },
] as const satisfies readonly {
  kind: QuickCreateKind;
  label: string;
}[];

const MAX_RESULTS_PER_GROUP = 5;

// Shared by the desktop popover search and the mobile sheet search below —
// both read from the same client/quotation/SO data already fetched by
// useDashboardData() (shared React Query cache, no extra network round trip).
function useGlobalSearchResults(query: string) {
  const { clients, items, orders } = useDashboardData();
  const q = query.trim().toLowerCase();
  const matchedClients = q
    ? clients
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
    : [];
  const matchedQuotation = q
    ? items
        .filter(
          (i) =>
            i.type === "Quotation" &&
            i.quotationNumber?.toLowerCase().includes(q),
        )
        .slice(0, MAX_RESULTS_PER_GROUP)
    : [];
  const matchedOrders = q
    ? orders
        .filter((o) => o.soNumber.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
    : [];
  const hasResults =
    matchedClients.length > 0 ||
    matchedQuotation.length > 0 ||
    matchedOrders.length > 0;

  return { matchedClients, matchedQuotation, matchedOrders, hasResults };
}

function SearchResultsList({
  query,
  matchedClients,
  matchedQuotation,
  matchedOrders,
  hasResults,
  onNavigate,
}: ReturnType<typeof useGlobalSearchResults> & {
  query: string;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Command shouldFilter={false}>
      <CommandList className="max-h-80">
        {!hasResults && (
          <CommandEmpty>
            Tidak ada hasil untuk &ldquo;{query}&rdquo;.
          </CommandEmpty>
        )}
        {matchedClients.length > 0 && (
          <CommandGroup heading="Client">
            {matchedClients.map((c) => (
              <CommandItem
                key={c.id}
                value={`client-${c.id}`}
                onSelect={() => {
                  onNavigate();
                  void navigate({
                    to: "/clients/$clientId",
                    params: { clientId: c.id },
                  });
                }}
              >
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {matchedQuotation.length > 0 && (
          <CommandGroup heading="Quotation">
            {matchedQuotation.map((i) => (
              <CommandItem
                key={i.id}
                value={`quotation-${i.id}`}
                onSelect={() => {
                  onNavigate();
                  void navigate({
                    to: "/quotations/$id",
                    params: { id: i.id },
                  });
                }}
              >
                {i.quotationNumber}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {matchedOrders.length > 0 && (
          <CommandGroup heading="Sales Order">
            {matchedOrders.map((o) => (
              <CommandItem
                key={o.id}
                value={`so-${o.id}`}
                onSelect={() => {
                  onNavigate();
                  void navigate({
                    to: "/sales-orders/$soId",
                    params: { soId: o.id },
                  });
                }}
              >
                {o.soNumber}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

// Desktop search: plain <Input> + PopoverAnchor (not PopoverTrigger) so the
// dropdown opens as the user types rather than on click. Hidden below `md`
// — see MobileSearch for the small-viewport equivalent.
function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = useGlobalSearchResults(query);
  const q = query.trim();

  function closeSearch() {
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open && q.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative hidden flex-1 max-w-xl md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Cari client, quotation, SO..."
            className="h-9 pl-8 bg-surface-muted border-border"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-anchor-width) p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SearchResultsList
          query={query}
          onNavigate={closeSearch}
          {...results}
        />
      </PopoverContent>
    </Popover>
  );
}

// Mobile search: GlobalSearch's input is `hidden md:block`, so below `md`
// there was previously no way to search at all. This opens the same
// client/quotation/SO lookup in a full-width top sheet instead.
function MobileSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useGlobalSearchResults(query);

  function closeSearch() {
    setOpen(false);
    setQuery("");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 md:hidden"
        aria-label="Cari"
        title="Cari"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <SheetContent side="top" className="p-0">
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle className="sr-only">
            Cari client, quotation, SO
          </SheetTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Cari client, quotation, SO..."
              className="h-10 pl-8"
            />
          </div>
        </SheetHeader>
        {query.trim().length > 0 && (
          <SearchResultsList
            query={query}
            onNavigate={closeSearch}
            {...results}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// Notifications derived from data already on hand — tasks due today or
// overdue — rather than a separate notifications table/read-state, per
// owner decision 2026-07-20.
function NotificationsMenu() {
  const navigate = useNavigate();
  const { tasks, clients } = useDashboardData();
  const alerts = tasks
    .filter((t) => isTaskOverdueLike(t) || hasTaskDueState(t, ["Today"]))
    .sort((a, b) => {
      const rank = (state: typeof a.dueState) =>
        state === "Escalated" ? 0 : state === "Overdue" ? 1 : 2;
      const byState = rank(a.dueState) - rank(b.dueState);
      if (byState !== 0) return byState;
      return a.dueDate.localeCompare(b.dueDate);
    });
  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notifikasi"
        >
          <Bell className="h-4 w-4" />
          {alerts.length > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifikasi</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Tidak ada task jatuh tempo atau overdue.
          </p>
        ) : (
          alerts.slice(0, 10).map((t) => (
            <DropdownMenuItem
              key={t.id}
              className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
              onSelect={() => {
                if (!t.clientId) return;
                void navigate({
                  to: "/clients/$clientId",
                  params: { clientId: t.clientId },
                });
              }}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.title}</span>
                <Badge
                  variant="outline"
                  className={
                    isTaskOverdueLike(t)
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-warning/40 bg-warning/10 text-warning"
                  }
                >
                  {t.dueState === "Escalated"
                    ? "Escalated"
                    : t.dueState === "Overdue"
                      ? "Overdue"
                      : "Hari ini"}
                </Badge>
              </span>
              <span className="text-xs text-muted-foreground">
                {t.clientId ? clientName(t.clientId) : "Tanpa klien"}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const { role, authReady, realProfile, signOut } = useRole();
  const [quickCreate, setQuickCreate] = useState<QuickCreateKind | null>(null);
  const currentUser = realProfile ?? { name: "—", initials: "—", email: "—" };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
      <SidebarTrigger className="text-foreground" />

      {authReady && <GlobalSearch />}
      {authReady && <MobileSearch />}

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        {authReady && role !== "executive" && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="h-9 gap-1.5"
                  aria-label="Quick Create"
                  title="Quick Create"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Quick Create</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Quick Create</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {QUICK_CREATE_ITEMS.map((item) => (
                  <DropdownMenuItem
                    key={item.kind}
                    onSelect={() => setQuickCreate(item.kind)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <AddFollowUpDialog
              open={quickCreate === "followup"}
              onOpenChange={(o) => !o && setQuickCreate(null)}
            />
            <AddClientDialog
              open={quickCreate === "client"}
              onOpenChange={(o) => !o && setQuickCreate(null)}
            />
            <CreateQuotationDialog
              open={quickCreate === "quotation"}
              onOpenChange={(o) => !o && setQuickCreate(null)}
            />
            <CreateSalesOrderDialog
              open={quickCreate === "so"}
              onOpenChange={(o) => !o && setQuickCreate(null)}
            />
            <CreatePrototypeDialog
              open={quickCreate === "prototype"}
              onOpenChange={(o) => !o && setQuickCreate(null)}
            />
          </>
        )}

        {authReady && <NotificationsMenu />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-semibold">
                  {currentUser.initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight md:block">
                <div className="text-xs font-medium text-foreground">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ROLE_LABEL[role]}
                </div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-xs font-normal text-muted-foreground">
                Signed in as
              </div>
              <div className="text-sm">{currentUser.name}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {ROLE_LABEL[role]}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void signOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
