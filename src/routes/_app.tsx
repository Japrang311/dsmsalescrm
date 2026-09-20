import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/context/role-context";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { MobileNavigation } from "@/components/shell/MobileNavigation";
import { TopBar } from "@/components/shell/TopBar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <RoleProvider>
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background">
            <AppSidebar />
            <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
              <TopBar />
              <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
                <Outlet />
              </main>
              <MobileNavigation />
            </SidebarInset>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </RoleProvider>
  );
}
