import { Search, Plus, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRole } from "@/lib/role-store";
import type { Role } from "@/lib/mock-data";

const roleLabel: Record<Role, string> = {
  sales: "Sales",
  manager: "Sales Manager",
  executive: "Top Executive",
};

export function TopBar() {
  const { role, user, setRole } = useRole();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
      <div className="flex flex-1 items-center gap-2 max-w-xl">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients, RFQ, quotation, PO..."
            className="h-9 pl-8 bg-muted/40 border-muted"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Role
          </span>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="h-7 border-0 bg-transparent px-1.5 text-xs font-medium shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="manager">Sales Manager</SelectItem>
              <SelectItem value="executive">Top Executive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {role !== "executive" ? (
          <Button size="sm" className="gap-1.5 h-9">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Follow-Up</span>
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 rounded-md pl-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-navy text-navy-foreground text-xs font-semibold">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden lg:block text-right">
            <p className="text-xs font-medium leading-tight">{user.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{roleLabel[role]}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
