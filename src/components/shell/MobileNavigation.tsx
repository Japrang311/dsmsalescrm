import { Link, useRouterState } from "@tanstack/react-router";
import { GitBranch, House, ListChecks, Menu, Users } from "lucide-react";
import { useRole } from "@/context/role-context-core";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const { role } = useRole();
  const { setOpenMobile, openMobile } = useSidebar();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const items = [
    { url: "/dashboard", label: "Beranda", icon: House },
    role === "executive"
      ? { url: "/clients", label: "Klien", icon: Users }
      : { url: "/tasks", label: "Tugas", icon: ListChecks },
    { url: "/pipeline", label: "Pipeline", icon: GitBranch },
  ] as const;
  return (
    <nav
      aria-label="Navigasi mobile"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ url, label, icon: Icon }) => {
        const active = pathname === url || pathname.startsWith(`${url}/`);
        return (
          <Link
            key={url}
            to={url}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 border-transparent text-xs font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        aria-expanded={openMobile}
        aria-label="Lainnya, buka navigasi"
        onClick={() => setOpenMobile(true)}
        className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        Lainnya
      </button>
    </nav>
  );
}
