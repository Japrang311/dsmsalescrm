import { supabase } from "@/lib/supabase";
import {
  toLocalIsoDate,
  type PrototypeStatus,
  type RevenueSource,
  type SoType,
  type TaxType,
} from "@/lib/domain";
import type { LineItemInput } from "./commercial-documents";
import type { Uom } from "./document-numbering";
import {
  encodePageCursor,
  normalizeListPageInput,
  type ListPageInput,
} from "@/lib/pagination-contracts";

export type SalesOrderLineItem = {
  id: string;
  salesOrderId: string;
  productName: string | null;
  description: string | null;
  qty: number | null;
  uom: Uom | null;
  unitPrice: number | null;
  lineTotal: number | null;
  linePosition: number;
};

export type SalesOrderDocument = {
  id: string;
  soNumber: string;
  customerPoNumber: string | null;
  customerPoDate: string | null;
  date: string;
  clientId: string;
  ownerId: string;
  type: SoType;
  taxType?: TaxType;
  prototypeStatus?: PrototypeStatus;
  source: RevenueSource | "Prototype FOC";
  numberMode: "Auto" | "Manual" | "Imported" | "Hariff Backdate";
  backdateReason?: string;
  totalValue: number | null;
  value: number | null;
  qty?: number;
  unitPrice?: number;
  sourceCommercialDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  items: SalesOrderLineItem[];
};

type SalesOrderItemRow = {
  id: string;
  sales_order_id: string;
  product_name: string | null;
  description: string | null;
  qty: number | null;
  uom: Uom | null;
  unit_price: number | null;
  line_total: number | null;
  line_position: number;
};

type SalesOrderRow = {
  id: string;
  so_number: string;
  customer_po_number: string | null;
  customer_po_date: string | null;
  date: string;
  client_id: string;
  owner_id: string;
  type: SoType;
  tax_type: TaxType | null;
  prototype_status: PrototypeStatus | null;
  source: RevenueSource | "Prototype FOC" | "RFQ / New Product";
  number_mode: SalesOrderDocument["numberMode"];
  backdate_reason: string | null;
  total_value: number | null;
  source_commercial_document_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  sales_order_items?: SalesOrderItemRow[];
  items?: SalesOrderItemRow[];
};

const salesOrderNumberCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareSalesOrdersByNewestNumber(
  a: Pick<SalesOrderDocument, "date" | "soNumber" | "createdAt">,
  b: Pick<SalesOrderDocument, "date" | "soNumber" | "createdAt">,
): number {
  const numberOrder = salesOrderNumberCollator.compare(b.soNumber, a.soNumber);
  if (numberOrder !== 0) return numberOrder;

  const dateOrder = b.date.localeCompare(a.date);
  if (dateOrder !== 0) return dateOrder;

  return b.createdAt.localeCompare(a.createdAt);
}

function toLineItem(row: SalesOrderItemRow): SalesOrderLineItem {
  return {
    id: row.id,
    salesOrderId: row.sales_order_id,
    productName: row.product_name,
    description: row.description,
    qty: row.qty,
    uom: row.uom,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    linePosition: row.line_position,
  };
}

function toSalesOrder(row: SalesOrderRow): SalesOrderDocument {
  const items = (row.sales_order_items ?? row.items ?? [])
    .map(toLineItem)
    .sort((a, b) => a.linePosition - b.linePosition);
  return {
    id: row.id,
    soNumber: row.so_number,
    customerPoNumber: row.customer_po_number,
    customerPoDate: row.customer_po_date,
    date: row.date,
    clientId: row.client_id,
    ownerId: row.owner_id,
    type: row.type,
    taxType: row.tax_type ?? undefined,
    prototypeStatus: row.prototype_status ?? undefined,
    source: row.source === "RFQ / New Product" ? "New Product" : row.source,
    numberMode: row.number_mode,
    backdateReason: row.backdate_reason ?? undefined,
    totalValue: row.total_value,
    // Compatibility alias for selectors/routes pending their grouped-view
    // migration. It is the header grand total, never a repeated item value.
    value: row.total_value,
    qty: items.length === 1 ? (items[0].qty ?? undefined) : undefined,
    unitPrice:
      items.length === 1 ? (items[0].unitPrice ?? undefined) : undefined,
    sourceCommercialDocumentId: row.source_commercial_document_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    items,
  };
}

export type SalesOrderQuery = {
  deleted?: boolean;
};

type SalesOrderQueryInput = SalesOrderQuery | { queryKey: readonly unknown[] };

function salesOrderQueryOptions(input: SalesOrderQueryInput): SalesOrderQuery {
  return "queryKey" in input ? {} : input;
}

export async function listSalesOrders(
  input: SalesOrderQueryInput = {},
): Promise<SalesOrderDocument[]> {
  const options = salesOrderQueryOptions(input);
  let query = supabase.from("sales_orders").select("*, sales_order_items(*)");
  query = options.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as SalesOrderRow[])
    .map(toSalesOrder)
    .sort(compareSalesOrdersByNewestNumber);
}

export type SalesOrderListFilters = {
  from?: Date;
  to?: Date;
  ownerId?: string;
  clientId?: string;
  taxType?: string; // "all" | "PPN" | "Non-PPN"
  source?: string; // "all" | RevenueSource | "Prototype FOC"
  soType?: string; // "all" | SoType
  deleted?: boolean;
};

export type SalesOrdersPage = {
  rows: SalesOrderDocument[];
  totalCount: number;
  nextCursor: string | null;
};

// Bounded per-page keyset load, same shape as listClientRowsPage /
// listCommercialDocumentsPage. Ordered by so_number descending: every series
// zero-pads its sequence to three digits (DSM-26SO001 … DSM-26SO160), so a
// plain text sort matches compareSalesOrdersByNewestNumber's natural-number
// order within a series and year. created_at is not usable here — imported
// rows share a handful of bulk-insert timestamps.
export async function listSalesOrdersPage(input: {
  filters?: SalesOrderListFilters;
  page?: ListPageInput;
}): Promise<SalesOrdersPage> {
  const filters = input.filters ?? {};
  const page = normalizeListPageInput(input.page);
  let query = supabase
    .from("sales_orders")
    .select("*, sales_order_items(*)", { count: "exact" })
    .order("so_number", { ascending: false })
    .order("id", { ascending: false })
    .limit(page.pageSize + 1);

  query = filters.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);

  if (filters.from) query = query.gte("date", isoDate(filters.from));
  if (filters.to) query = query.lte("date", isoDate(filters.to));
  if (filters.ownerId && filters.ownerId !== "all")
    query = query.eq("owner_id", filters.ownerId);
  if (filters.clientId && filters.clientId !== "all")
    query = query.eq("client_id", filters.clientId);
  if (filters.taxType && filters.taxType !== "all")
    query = query.eq("tax_type", filters.taxType);
  if (filters.soType && filters.soType !== "all")
    query = query.eq("type", filters.soType);
  if (filters.source && filters.source !== "all") {
    query = query.eq(
      "source",
      filters.source === "New Product" ? "RFQ / New Product" : filters.source,
    );
  }

  if (page.cursor) {
    const sortValue = JSON.stringify(page.cursor.sortValue);
    query = query.or(
      `so_number.lt.${sortValue},and(so_number.eq.${sortValue},id.lt.${page.cursor.id})`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rawRows = (data ?? []) as SalesOrderRow[];
  const pageRows = rawRows.slice(0, page.pageSize);
  const lastRow = pageRows.at(-1);

  return {
    rows: pageRows.map(toSalesOrder),
    totalCount: count ?? pageRows.length,
    nextCursor:
      rawRows.length > page.pageSize && lastRow
        ? encodePageCursor({ sortValue: lastRow.so_number, id: lastRow.id })
        : null,
  };
}

function isoDate(date: Date): string {
  return toLocalIsoDate(date);
}

export async function getSalesOrder(
  id: string,
  options: SalesOrderQuery = {},
): Promise<SalesOrderDocument | null> {
  let query = supabase
    .from("sales_orders")
    .select("*, sales_order_items(*)")
    .eq("id", id);
  query = options.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? toSalesOrder(data as SalesOrderRow) : null;
}

export async function deleteSalesOrder(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_sales_order_deleted", {
    p_sales_order_id: id,
    p_deleted: true,
  });
  if (error) throw error;
}

export async function restoreSalesOrder(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_sales_order_deleted", {
    p_sales_order_id: id,
    p_deleted: false,
  });
  if (error) throw error;
}

export type CreateSalesOrderInput = {
  clientId: string;
  date: string;
  customerPoNumber: string;
  customerPoDate?: string;
  type: SoType;
  taxType?: TaxType;
  prototypeStatus?: PrototypeStatus;
  source: RevenueSource | "Prototype FOC";
  numberMode?: "Manual" | "Hariff Backdate";
  manualSoNumber: string;
  backdateReason?: string;
  items: LineItemInput[];
  sourceCommercialDocumentId?: string;
};

export async function createSalesOrder(
  input: CreateSalesOrderInput,
): Promise<SalesOrderDocument> {
  const manualSoNumber = input.manualSoNumber?.trim();
  const backdateReason = input.backdateReason?.trim();
  const { data, error } = await supabase.rpc("create_sales_order", {
    p_client_id: input.clientId,
    p_date: input.date,
    p_customer_po_number: input.customerPoNumber,
    p_type: input.type,
    p_tax_type: input.taxType ?? null,
    p_prototype_status: input.prototypeStatus ?? null,
    p_source:
      input.source === "New Product" ? "RFQ / New Product" : input.source,
    p_number_mode: input.numberMode ?? "Manual",
    p_manual_so_number: manualSoNumber || null,
    p_backdate_reason: backdateReason || null,
    p_items: input.items,
    p_source_commercial_document_id: input.sourceCommercialDocumentId ?? null,
    p_customer_po_date: input.customerPoDate ?? null,
  });
  if (error) throw error;
  return toSalesOrder(data as SalesOrderRow);
}

export async function updateSalesOrderTax(
  id: string,
  taxType: TaxType,
): Promise<SalesOrderDocument> {
  const { data, error } = await supabase
    .from("sales_orders")
    .update({ tax_type: taxType })
    .eq("id", id)
    .select("*, sales_order_items(*)")
    .single();
  if (error) throw error;
  return toSalesOrder(data as SalesOrderRow);
}

export type UpdateSalesOrderHeaderInput = Partial<{
  soNumber: string;
  clientId: string;
  ownerId: string;
  customerPoNumber: string;
  customerPoDate: string | null;
  date: string;
}>;

// client_id/owner_id are correction-only fields for fixing imported/mistyped
// records — RLS (sales_orders_update) is the real boundary on who may set
// them to what: a sales-role caller may only keep owner_id equal to their
// own auth.uid(), manager/super_admin are unrestricted. See
// supabase/migrations/20260720000000_add_sales_order_edit_support.sql.
export async function updateSalesOrderHeader(
  id: string,
  patch: UpdateSalesOrderHeaderInput,
): Promise<SalesOrderDocument> {
  const row: Record<string, string | null> = {};
  if (patch.soNumber !== undefined) row.so_number = patch.soNumber.trim();
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.ownerId !== undefined) row.owner_id = patch.ownerId;
  if (patch.customerPoNumber !== undefined)
    row.customer_po_number = patch.customerPoNumber;
  if (patch.customerPoDate !== undefined)
    row.customer_po_date = patch.customerPoDate;
  if (patch.date !== undefined) row.date = patch.date;

  const { data, error } = await supabase
    .from("sales_orders")
    .update(row)
    .eq("id", id)
    .select("*, sales_order_items(*)")
    .single();
  if (error) throw error;
  return toSalesOrder(data as SalesOrderRow);
}

export type UpdateSalesOrderItemInput = {
  productName: string | null;
  description: string | null;
  qty: number;
  uom: Uom;
  // null for Prototype FOC items, which never carry money — matches the
  // sales_order_items check constraint (unit_price/line_total must be null
  // or a positive/non-negative number, never a bare 0 standing in for FOC).
  unitPrice: number | null;
};

export type AddSalesOrderItemInput = UpdateSalesOrderItemInput & {
  salesOrderId: string;
  linePosition: number;
};

// line_total is always derived as qty * unitPrice here, never taken as a
// separate input — same "value is always Qty × Unit Price, never manually
// overridable" rule the Create dialogs already use. The parent
// sales_orders.total_value recomputes automatically via the
// sales_order_items_recompute_total trigger.
export async function updateSalesOrderItem(
  itemId: string,
  input: UpdateSalesOrderItemInput,
): Promise<void> {
  const { error } = await supabase
    .from("sales_order_items")
    .update({
      product_name: input.productName,
      description: input.description,
      qty: input.qty,
      uom: input.uom,
      unit_price: input.unitPrice,
      line_total: input.unitPrice === null ? null : input.qty * input.unitPrice,
    })
    .eq("id", itemId);
  if (error) throw error;
}

export async function addSalesOrderItem(
  input: AddSalesOrderItemInput,
): Promise<SalesOrderLineItem> {
  const { data, error } = await supabase
    .from("sales_order_items")
    .insert({
      sales_order_id: input.salesOrderId,
      product_name: input.productName,
      description: input.description,
      qty: input.qty,
      uom: input.uom,
      unit_price: input.unitPrice,
      line_total: input.unitPrice === null ? null : input.qty * input.unitPrice,
      line_position: input.linePosition,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toLineItem(data as SalesOrderItemRow);
}
