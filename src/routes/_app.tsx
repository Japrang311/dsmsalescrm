import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/context/role-context";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { TopBar } from "@/components/shell/TopBar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <RoleProvider>
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-surface-muted">
            <AppSidebar />
            <SidebarInset className="flex min-w-0 flex-1 flex-col bg-surface-muted">
              <TopBar />
              <main className="flex-1">
                <Outlet />
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </RoleProvider>
  );
}
