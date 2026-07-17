import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  GitBranch,
  FileText,
  FileSpreadsheet,
  Receipt,
  TrendingUp,
  Activity,
  BarChart3,
  Settings,
  Factory,
} from "lucide-react";
import { useRole } from "@/lib/role-store";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const salesNav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "My Tasks", icon: ListChecks },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/pipeline", label: "Commercial Pipeline", icon: GitBranch },
  { to: "/rfq", label: "RFQ", icon: FileText },
  { to: "/quotations", label: "Quotation", icon: FileSpreadsheet },
  { to: "/orders", label: "PO / Sales Order", icon: Receipt },
  { to: "/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/activity", label: "Activity Log", icon: Activity },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const execNav: NavItem[] = [
  { to: "/", label: "Executive Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

export function AppSidebar() {
  const { role } = useRole();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const nav = role === "executive" ? execNav : salesNav;

  return (
    <aside className="hidden md:flex md:w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Factory className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none">DSM Sales</p>
          <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
            Execution Suite
          </p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {nav.map((item) => {
            const active =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border p-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
        Prototype · Mock Data
      </div>
    </aside>
  );
}
