import { supabase } from "@/lib/supabase";
import type { ClientStatus } from "@/lib/domain";

export type OwnerTaskClientMetrics = {
  ownerId: string;
  openTasks: number;
  overdueTasks: number;
  escalatedTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  activeClients: number;
};

type OwnerTaskClientRow = {
  owner_id: string;
  open_tasks: string;
  overdue_tasks: string;
  escalated_tasks: string;
  completed_tasks: string;
  cancelled_tasks: string;
  active_clients: string;
};

export async function getSalesTaskClientMetrics(
  filters: { ownerId?: string } = {},
): Promise<OwnerTaskClientMetrics[]> {
  const { data, error } = await supabase.rpc("sales_task_client_metrics", {
    p_owner_id: filters.ownerId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as OwnerTaskClientRow[]).map((row) => ({
    ownerId: row.owner_id,
    openTasks: Number(row.open_tasks),
    overdueTasks: Number(row.overdue_tasks),
    escalatedTasks: Number(row.escalated_tasks),
    completedTasks: Number(row.completed_tasks),
    cancelledTasks: Number(row.cancelled_tasks),
    activeClients: Number(row.active_clients),
  }));
}

export type TopCustomer = {
  clientId: string;
  clientName: string;
  clientStatus: ClientStatus;
  revenue: number;
};

type TopCustomerRow = {
  client_id: string;
  client_name: string;
  client_status: ClientStatus;
  revenue: string;
};

export async function getTopCustomers(
  filters: {
    year?: number;
    ownerId?: string;
    limit?: number;
    clientId?: string;
    taxType?: string;
    soType?: string;
    source?: string;
  } = {},
): Promise<TopCustomer[]> {
  const source =
    !filters.source || filters.source === "all" ? null : filters.source;
  const { data, error } = await supabase.rpc("sales_orders_top_customers", {
    p_year: filters.year ?? null,
    p_owner_id:
      !filters.ownerId || filters.ownerId === "all" ? null : filters.ownerId,
    p_limit: filters.limit ?? 5,
    p_client_id:
      !filters.clientId || filters.clientId === "all" ? null : filters.clientId,
    p_tax_type:
      !filters.taxType || filters.taxType === "all" ? null : filters.taxType,
    p_so_type:
      !filters.soType || filters.soType === "all" ? null : filters.soType,
    p_source: source === "New Product" ? "RFQ / New Product" : source,
  });
  if (error) throw error;
  return ((data ?? []) as TopCustomerRow[]).map((row) => ({
    clientId: row.client_id,
    clientName: row.client_name,
    clientStatus: row.client_status,
    revenue: Number(row.revenue),
  }));
}

export type RiskAlertCounts = {
  overdueTaskCount: number;
  bigPendingCommitCount: number;
  bigPendingCommitValue: number;
  dormantHighValueClientCount: number;
};

type RiskAlertCountsRow = {
  overdue_task_count: string;
  big_pending_commit_count: string;
  big_pending_commit_value: string;
  dormant_high_value_client_count: string;
};

export async function getRiskAlertCounts(
  filters: { ownerId?: string } = {},
): Promise<RiskAlertCounts> {
  const { data, error } = await supabase.rpc("dashboard_risk_alert_counts", {
    p_owner_id: filters.ownerId ?? null,
  });
  if (error) throw error;
  const [row] = (data ?? []) as RiskAlertCountsRow[];
  return {
    overdueTaskCount: Number(row?.overdue_task_count ?? 0),
    bigPendingCommitCount: Number(row?.big_pending_commit_count ?? 0),
    bigPendingCommitValue: Number(row?.big_pending_commit_value ?? 0),
    dormantHighValueClientCount: Number(
      row?.dormant_high_value_client_count ?? 0,
    ),
  };
}
