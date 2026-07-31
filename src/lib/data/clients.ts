import { supabase } from "@/lib/supabase";
import type {
  Client,
  ClientContact,
  ClientSource,
  ClientStatus,
} from "@/lib/domain";

type ClientRow = {
  id: string;
  name: string;
  status: ClientStatus;
  source: ClientSource;
  owner_id: string;
  spending_ytd: number;
  last_fu: string | null;
  next_fu: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  industry: string | null;
  website: string | null;
  notes: string | null;
  cp1_name: string | null;
  cp1_position: string | null;
  cp1_email: string | null;
  cp1_phone: string | null;
  cp1_mobile: string | null;
  cp2_name: string | null;
  cp2_position: string | null;
  cp2_email: string | null;
  cp2_phone: string | null;
  cp2_mobile: string | null;
  cp3_name: string | null;
  cp3_position: string | null;
  cp3_email: string | null;
  cp3_phone: string | null;
  cp3_mobile: string | null;
};

const DUPLICATE_CLIENT_NAME_MESSAGE =
  "Nama client sudah ada. Gunakan record client yang sudah tersedia, jangan buat duplikat.";

export function clientDataErrorMessage(error: unknown): string {
  const isDuplicateClientNameError =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    (error.message.includes("Client name already exists") ||
      error.message.includes("clients_name_normalized_unique") ||
      ("details" in error &&
        typeof error.details === "string" &&
        error.details.includes("CLIENT_NAME_DUPLICATE")));

  if (isDuplicateClientNameError) {
    return DUPLICATE_CLIENT_NAME_MESSAGE;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

function throwClientDataError(error: unknown): never {
  throw new Error(clientDataErrorMessage(error));
}

function toContact(row: ClientRow, position: 1 | 2 | 3): ClientContact {
  const name = row[`cp${position}_name`] ?? undefined;
  const jabatan = row[`cp${position}_position`] ?? undefined;
  const email = row[`cp${position}_email`] ?? undefined;
  const phone = row[`cp${position}_phone`] ?? undefined;
  const mobile = row[`cp${position}_mobile`] ?? undefined;
  return { name, position: jabatan, email, phone, mobile };
}

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
    address: row.address ?? undefined,
    province: row.province ?? undefined,
    city: row.city ?? undefined,
    industry: row.industry ?? undefined,
    website: row.website ?? undefined,
    notes: row.notes ?? undefined,
    contacts: [toContact(row, 1), toContact(row, 2), toContact(row, 3)],
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
  address?: string;
  contacts?: [ClientContact, ClientContact, ClientContact];
}): Promise<Client> {
  const blank = (v?: string) => (v && v.trim() ? v.trim() : null);
  const [cp1, cp2, cp3] = input.contacts ?? [{}, {}, {}];
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      source: input.source,
      owner_id: input.ownerId,
      status: input.status ?? "Prospect",
      address: blank(input.address),
      cp1_name: blank(cp1.name),
      cp2_name: blank(cp2.name),
      cp3_name: blank(cp3.name),
    })
    .select("*")
    .single();
  if (error) throwClientDataError(error);
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
  if (error) throwClientDataError(error);
  return toClient(data);
}

export type UpdateClientDetailsInput = {
  name: string;
  address?: string;
  province?: string;
  city?: string;
  industry?: string;
  website?: string;
  notes?: string;
  contacts: [ClientContact, ClientContact, ClientContact];
};

// All fields are nullable columns — an empty string from the form is written
// as null so cleared fields actually clear, matching the "—" empty-state
// rendering on the Client Detail page.
export async function updateClientDetails(
  id: string,
  patch: UpdateClientDetailsInput,
): Promise<Client> {
  const blank = (v?: string) => (v && v.trim() ? v.trim() : null);
  const [cp1, cp2, cp3] = patch.contacts;
  const { data, error } = await supabase
    .from("clients")
    .update({
      name: patch.name.trim(),
      address: blank(patch.address),
      province: blank(patch.province),
      city: blank(patch.city),
      industry: blank(patch.industry),
      website: blank(patch.website),
      notes: blank(patch.notes),
      cp1_name: blank(cp1.name),
      cp1_position: blank(cp1.position),
      cp1_email: blank(cp1.email),
      cp1_phone: blank(cp1.phone),
      cp1_mobile: blank(cp1.mobile),
      cp2_name: blank(cp2.name),
      cp2_position: blank(cp2.position),
      cp2_email: blank(cp2.email),
      cp2_phone: blank(cp2.phone),
      cp2_mobile: blank(cp2.mobile),
      cp3_name: blank(cp3.name),
      cp3_position: blank(cp3.position),
      cp3_email: blank(cp3.email),
      cp3_phone: blank(cp3.phone),
      cp3_mobile: blank(cp3.mobile),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throwClientDataError(error);
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

// Managers who personally own clients despite profiles.role = 'manager', not
// 'sales' — Adhitya Wirambara and Leli Al both have a real book of business
// (e.g. PT. Putra Arga Binangun, PT. Symphos Electric under Adhitya). They're
// included here so owner filter/selector dropdowns can find their clients
// too, same as any Sales rep. This is a display-layer inclusion only — it
// does not touch RLS or their actual manager role/permissions. Per owner
// decision 2026-07-20.
const SALES_TEAM_INCLUDE_MANAGERS = new Set(["Adhitya Wirambara", "Leli Al"]);

// Used by the "Sales"/"Owner" filter on the Client List, Pipeline, Tasks,
// Sales Orders, and Reports pages, plus owner-assignment dropdowns — RLS
// lets managers/executives read every profile. The .in("role", [...])
// filter is also the app's one enforcement point keeping Super Admin out of
// every owner/target/performance selector built from this function's output
// (Settings' target assignment dropdown, dashboard and report "sales team"
// collections) — Super Admin is not a Sales owner and must never appear
// there (Phase 12 plan, Global Constraints).
//
// Deactivated (account_status = 'inactive') sales/manager profiles are
// excluded here too, so a deactivated rep's name stops appearing in any
// active-roster UI (dashboards, target charts, owner/assignee dropdowns,
// filters). Their name still shows up on Sales Orders, Commercial Items,
// and Client records already attributed to them, because those resolve
// owner names via listOwners() below, which is intentionally unfiltered —
// deactivation must not rewrite history. Per owner decision 2026-07-28.
export async function listSalesTeamProfiles(): Promise<
  { id: string; name: string; initials: string; email: string }[]
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, initials, email, role, account_status")
    .in("role", ["sales", "manager"])
    .eq("account_status", "active");
  if (error) throw error;
  return (data ?? [])
    .filter(
      (p) => p.role === "sales" || SALES_TEAM_INCLUDE_MANAGERS.has(p.name),
    )
    .map(({ id, name, initials, email }) => ({ id, name, initials, email }));
}

// Reads public.client_search_index (id + name + owner_id), not the clients
// table directly — clients_select's RLS restricts a client row to its own
// owner plus manager/executive/super_admin, but the client picker in Create
// dialogs and SO edit form need to find a client regardless of who owns it.
// See supabase/migrations/20260720000000_add_sales_order_edit_support.sql
// and 20260721000000_expand_client_search_index.sql.
export async function searchClients(): Promise<
  { id: string; name: string; ownerId: string }[]
> {
  const { data, error } = await supabase
    .from("client_search_index")
    .select("id, name, owner_id");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
  }));
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
