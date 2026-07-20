import { supabase } from "@/lib/supabase";
import type { Client, ClientSource, ClientStatus } from "@/lib/domain";

type ClientRow = {
  id: string;
  name: string;
  status: ClientStatus;
  source: ClientSource;
  owner_id: string;
  spending_ytd: number;
  last_fu: string | null;
  next_fu: string | null;
};

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    source: row.source,
    ownerId: row.owner_id,
    spendingYtd: row.spending_ytd,
    lastFu: row.last_fu ?? undefined,
    nextFu: row.next_fu ?? undefined,
  };
}

// No role/userId parameter needed: RLS scopes the rows to whatever the
// logged-in user is allowed to see (own clients for sales, all for
// manager/executive) — unlike the old mock's scopeClients(role), the
// database itself is the source of truth for scoping here.
export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*");
  if (error) throw error;
  return (data ?? []).map(toClient);
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toClient(data) : null;
}

export async function createClient(input: {
  name: string;
  source: ClientSource;
  ownerId: string;
  status?: ClientStatus;
}): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      source: input.source,
      owner_id: input.ownerId,
      status: input.status ?? "Prospect",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toClient(data);
}

export async function updateClientStatus(
  id: string,
  status: ClientStatus,
): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toClient(data);
}

export type OwnerLookup = Record<
  string,
  {
    name: string;
    initials: string;
    email: string;
    role: "sales" | "manager" | "executive" | "super_admin";
  }
>;

// Client List/Detail need the owner's display name — this replaces the old
// mock's TEAM.find(...) with a real query against profiles.
export async function listOwners(): Promise<OwnerLookup> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, initials, email, role");
  if (error) throw error;
  const lookup: OwnerLookup = {};
  for (const row of data ?? []) {
    lookup[row.id] = {
      name: row.name,
      initials: row.initials,
      email: row.email,
      role: row.role,
    };
  }
  return lookup;
}

// Used by the "Sales" owner filter on the Client List, which only managers
// and executives see — RLS lets them read every profile. The .eq("role",
// "sales") filter is also the app's one enforcement point keeping Super
// Admin out of every owner/target/performance selector that's built from
// this function's output (Settings' target assignment dropdown, dashboard
// and report "sales team" collections) — Super Admin is not a Sales owner
// and must never appear there (Phase 12 plan, Global Constraints).
export async function listSalesTeamProfiles(): Promise<
  { id: string; name: string; initials: string; email: string }[]
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, initials, email")
    .eq("role", "sales");
  if (error) throw error;
  return data ?? [];
}

// Reads public.client_search_index (id + name only), not the clients table
// directly — clients_select's RLS restricts a client row to its own
// owner plus manager/executive/super_admin, but correcting which client a
// Sales Order belongs to needs to find a client regardless of who owns it.
// See supabase/migrations/20260720000000_add_sales_order_edit_support.sql.
export async function searchClients(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("client_search_index")
    .select("id, name");
  if (error) throw error;
  return data ?? [];
}

export type ClientListRow = {
  client: Client;
  ownerName: string;
  spendingYtd: number;
  lastFu?: string;
  nextFu?: string;
  // These four are honestly "not available yet", not real zeros — they
  // depend on commercial_items (Phase 4) and sales_orders (Phase 5), which
  // don't exist yet. Kept in this shape so ClientsTable's existing
  // "value > 0 ? show : —" rendering already displays them correctly as
  // placeholders without needing its own null-handling.
  ppn: number;
  nonPpn: number;
  activeCommercialCount: number;
  activeCommercialTypes: string[];
  risk: "Low" | "Medium" | "High" | "Unknown";
  advisories: number;
};

export async function listClientRows(): Promise<ClientListRow[]> {
  const [clients, owners] = await Promise.all([listClients(), listOwners()]);
  return clients.map((client) => ({
    client,
    ownerName: owners[client.ownerId]?.name ?? "—",
    spendingYtd: client.spendingYtd,
    lastFu: client.lastFu,
    nextFu: client.nextFu,
    ppn: 0,
    nonPpn: 0,
    activeCommercialCount: 0,
    activeCommercialTypes: [],
    risk: "Unknown" as const,
    advisories: 0,
  }));
}
