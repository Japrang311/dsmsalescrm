import { Bell, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ROLE_LABEL, useRole } from "@/context/role-context";
import type { Role } from "@/lib/domain";
import { listOwners } from "@/lib/data/clients";
import { getCurrentActorId } from "@/lib/data/activity-log";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { AddFollowUpDialog } from "@/components/clients/AddFollowUpDialog";
import {
  CreateRfqDialog,
  CreateQuotationDialog,
  CreateSalesOrderDialog,
  CreatePrototypeDialog,
} from "@/components/clients/CreateRecordDialogs";

type QuickCreateKind =
  | "followup"
  | "client"
  | "rfq"
  | "quotation"
  | "so"
  | "prototype";

export const QUICK_CREATE_ITEMS = [
  { kind: "followup", label: "New Follow Up" },
  { kind: "client", label: "New Client" },
  { kind: "rfq", label: "New RFQ" },
  { kind: "quotation", label: "New Quotation" },
  { kind: "so", label: "Record Sales Order" },
  { kind: "prototype", label: "New Prototype Request" },
] as const satisfies readonly {
  kind: QuickCreateKind;
  label: string;
}[];

const MAX_RESULTS_PER_GROUP = 5;

// Global search covers exactly what its placeholder promises — client, RFQ,
// quotation, SO — matched client-side against data already fetched by
// useDashboardData() (shared React Query cache, no extra network round
// trip). Uses a plain <Input> + PopoverAnchor (not PopoverTrigger) so the
// dropdown opens as the user types rather than on click.
function GlobalSearch() {
  const navigate = useNavigate();
  const { clients, items, orders } = useDashboardData();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const matchedClients = q
    ? clients
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
    : [];
  const matchedRfq = q
    ? items
        .filter(
          (i) =>
            i.type === "RFQ" &&
            (i.description.toLowerCase().includes(q) ||
              (i.lineItems ?? []).some((line) =>
                (line.productName ?? "").toLowerCase().includes(q),
              )),
        )
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
    matchedRfq.length > 0 ||
    matchedQuotation.length > 0 ||
    matchedOrders.length > 0;

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
            placeholder="Cari client, RFQ, quotation, SO..."
            className="h-9 pl-8 bg-surface-muted border-border"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-anchor-width) p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
                      closeSearch();
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
            {matchedRfq.length > 0 && (
              <CommandGroup heading="RFQ">
                {matchedRfq.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={`rfq-${i.id}`}
                    onSelect={() => {
                      closeSearch();
                      void navigate({ to: "/rfq/$id", params: { id: i.id } });
                    }}
                  >
                    {i.description}
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
                      closeSearch();
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
                      closeSearch();
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
      </PopoverContent>
    </Popover>
  );
}

// Notifications derived from data already on hand — tasks due today or
// overdue — rather than a separate notifications table/read-state, per
// owner decision 2026-07-20.
function NotificationsMenu() {
  const navigate = useNavigate();
  const { tasks, clients } = useDashboardData();
  const alerts = tasks
    .filter((t) => t.status === "Overdue" || t.status === "Today")
    .sort((a, b) =>
      a.status === b.status ? 0 : a.status === "Overdue" ? -1 : 1,
    );
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
              onSelect={() =>
                void navigate({
                  to: "/clients/$clientId",
                  params: { clientId: t.clientId },
                })
              }
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.title}</span>
                <Badge
                  variant="outline"
                  className={
                    t.status === "Overdue"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-warning/40 bg-warning/10 text-warning"
                  }
                >
                  {t.status === "Overdue" ? "Overdue" : "Hari ini"}
                </Badge>
              </span>
              <span className="text-xs text-muted-foreground">
                {clientName(t.clientId)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const { role, setRole, authSource, authReady, realProfile, signOut } =
    useRole();
  const [quickCreate, setQuickCreate] = useState<QuickCreateKind | null>(null);
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authSource === "dev",
  });
  // Looked up by the real signed-in user's id, not guessed by role — the
  // dev switcher signs into a specific seed account per role (see
  // role-context.tsx's ROLE_LOGIN), and a hardcoded id or an "any manager"
  // heuristic previously showed the wrong person's name/avatar whenever
  // that specific seed account wasn't the one actually running.
  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentActorId,
    enabled: authReady && authSource === "dev",
  });
  const devUser = currentUserId ? owners[currentUserId] : undefined;
  const currentUser =
    authSource === "real" && realProfile
      ? realProfile
      : role === "executive"
        ? { name: "Direktur Utama", initials: "DU", email: "exec@dsm.co.id" }
        : (devUser ?? { name: "—", initials: "—", email: "—" });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
      <SidebarTrigger className="text-foreground" />

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5">
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
        <CreateRfqDialog
          open={quickCreate === "rfq"}
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

        <NotificationsMenu />

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
            {authSource === "dev" ? (
              <>
                <DropdownMenuLabel className="flex items-center justify-between">
                  Prototype Role
                  <Badge variant="outline" className="text-[10px]">
                    demo
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={role}
                  onValueChange={(v) => setRole(v as Role)}
                >
                  <DropdownMenuRadioItem value="sales">
                    Sales
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="manager">
                    Sales Manager
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="executive">
                    Top Executive
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
              </>
            ) : (
              <>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {ROLE_LABEL[role]}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
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
