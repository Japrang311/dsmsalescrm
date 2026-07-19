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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ROLE_LABEL, useRole } from "@/context/role-context";
import type { Role } from "@/lib/domain";
import { listOwners } from "@/lib/data/clients";
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

// Matches the hardcoded seed account the dev role switcher signs into for
// "sales" (see role-context.tsx) — same simplification used in
// TargetCharts.tsx, _app.dashboard.tsx and _app.reports.tsx. Only used
// when authSource === "dev" (local dev role-switching), never for a real
// signed-in session.
const CURRENT_SALES_ID = "22222222-2222-2222-2222-222222222222";

export function TopBar() {
  const { role, setRole, authSource, realProfile, signOut } = useRole();
  const [quickCreate, setQuickCreate] = useState<QuickCreateKind | null>(null);
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authSource === "dev",
  });
  const manager = Object.values(owners).find((o) => o.role === "manager");
  const currentUser =
    authSource === "real" && realProfile
      ? realProfile
      : role === "executive"
        ? { name: "Direktur Utama", initials: "DU", email: "exec@dsm.co.id" }
        : role === "manager"
          ? (manager ?? { name: "—", initials: "—", email: "—" })
          : role === "sales"
            ? (owners[CURRENT_SALES_ID] ?? {
                name: "—",
                initials: "—",
                email: "—",
              })
            : // super_admin has no dev seed login (see role-context.tsx) — never
              // fall back to the Sales seed account's identity here.
              { name: "—", initials: "—", email: "—" };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
      <SidebarTrigger className="text-foreground" />

      <div className="relative hidden flex-1 max-w-xl md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari client, RFQ, quotation, SO..."
          className="h-9 pl-8 bg-surface-muted border-border"
        />
      </div>

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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              <span className="sr-only">Notifications</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifikasi</TooltipContent>
        </Tooltip>

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
