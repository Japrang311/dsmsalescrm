import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  GitBranch,
  Receipt,
  Activity,
  BarChart3,
  Settings,
  FileText,
  ReceiptText,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useRole } from "@/context/role-context";
import dsmMarkUrl from "/dsm-mark.svg";

const NAV_FULL = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "My Tasks", url: "/tasks", icon: ListChecks },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Commercial Pipeline", url: "/pipeline", icon: GitBranch },
  { title: "Sales Orders & Revenue", url: "/sales-orders", icon: Receipt },
  { title: "Activity Log", url: "/activity", icon: Activity },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

const NAV_EXECUTIVE = [
  { title: "Executive Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Sales Orders & Revenue", url: "/sales-orders", icon: Receipt },
  { title: "Commercial Pipeline", url: "/pipeline", icon: GitBranch },
  { title: "Reports", url: "/reports", icon: BarChart3 },
] as const;

const COMMERCIAL_ITEMS_NAV = [
  { title: "RFQ", url: "/rfq", icon: FileText },
  { title: "Quotations", url: "/quotations", icon: ReceiptText },
] as const;

export function AppSidebar() {
  const { role } = useRole();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const items = role === "executive" ? NAV_EXECUTIVE : NAV_FULL;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-zinc-100 to-zinc-300 p-1 shadow-sm ring-1 ring-zinc-400/40">
            <img
              src={dsmMarkUrl}
              alt="DSM"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground leading-tight">
              DSM Sales
            </span>
            <span className="text-[11px] text-sidebar-foreground/60 leading-tight">
              Duta Solusi Metalindo
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  pathname === item.url ||
                  (item.url !== "/dashboard" && pathname.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {role !== "executive" && (
          <SidebarGroup>
            <SidebarGroupLabel>Commercial Items</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {COMMERCIAL_ITEMS_NAV.map((item) => {
                  const active =
                    pathname === item.url ||
                    pathname.startsWith(item.url + "/");
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                      >
                        <Link to={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
