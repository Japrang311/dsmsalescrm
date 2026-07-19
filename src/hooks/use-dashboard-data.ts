import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/context/role-context";
import { listSalesOrders } from "@/lib/data/sales-orders";
import { listTasks } from "@/lib/data/tasks";
import { listCommercialItems } from "@/lib/data/commercial-items";
import {
  listClients,
  listOwners,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import { listTargets } from "@/lib/data/targets";
import { companyMonthlyTarget } from "@/lib/data/dashboard-selectors";

// Shared real-data fetch for every dashboard/reports/activity component.
// Each query reuses the same queryKey used elsewhere in the app (Clients
// page, Tasks page, etc.), so React Query serves these from cache instead
// of firing duplicate network requests.
export function useDashboardData() {
  const { authReady } = useRole();

  const orders = useQuery({
    queryKey: ["sales-orders", "all"],
    queryFn: listSalesOrders,
    enabled: authReady,
  });
  const tasks = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });
  const items = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const clients = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const owners = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const salesTeam = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady,
  });
  const targets = useQuery({
    queryKey: ["targets", "all"],
    queryFn: () => listTargets(),
    enabled: authReady,
  });

  const targetsByMember = targets.data ?? {};

  return {
    orders: orders.data ?? [],
    tasks: tasks.data ?? [],
    items: items.data ?? [],
    clients: clients.data ?? [],
    ownersById: owners.data ?? {},
    salesTeam: salesTeam.data ?? [],
    targetsByMember,
    companyTarget: companyMonthlyTarget(targetsByMember),
    isLoading:
      !authReady ||
      orders.isLoading ||
      tasks.isLoading ||
      items.isLoading ||
      clients.isLoading ||
      owners.isLoading ||
      salesTeam.isLoading ||
      targets.isLoading,
  };
}
