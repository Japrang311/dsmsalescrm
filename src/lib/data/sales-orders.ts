import { supabase } from "@/lib/supabase";
import type {
  PrototypeStatus,
  RevenueSource,
  SoType,
  TaxType,
} from "@/lib/domain";
import type { LineItemInput } from "./commercial-documents";
import type { Uom } from "./document-numbering";

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
  date: string;
  clientId: string;
  ownerId: string;
  type: SoType;
  taxType?: TaxType;
  prototypeStatus?: PrototypeStatus;
  source: RevenueSource | "Prototype FOC";
  numberMode: "Auto" | "Imported" | "Hariff Backdate";
  backdateReason?: string;
  totalValue: number | null;
  value: number | null;
  qty?: number;
  unitPrice?: number;
  createdAt: string;
  updatedAt: string;
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
  date: string;
  client_id: string;
  owner_id: string;
  type: SoType;
  tax_type: TaxType | null;
  prototype_status: PrototypeStatus | null;
  source: RevenueSource | "Prototype FOC";
  number_mode: SalesOrderDocument["numberMode"];
  backdate_reason: string | null;
  total_value: number | null;
  created_at: string;
  updated_at: string;
  sales_order_items?: SalesOrderItemRow[];
  items?: SalesOrderItemRow[];
};

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
    date: row.date,
    clientId: row.client_id,
    ownerId: row.owner_id,
    type: row.type,
    taxType: row.tax_type ?? undefined,
    prototypeStatus: row.prototype_status ?? undefined,
    source: row.source,
    numberMode: row.number_mode,
    backdateReason: row.backdate_reason ?? undefined,
    totalValue: row.total_value,
    // Compatibility alias for selectors/routes pending their grouped-view
    // migration. It is the header grand total, never a repeated item value.
    value: row.total_value,
    qty: items.length === 1 ? (items[0].qty ?? undefined) : undefined,
    unitPrice:
      items.length === 1 ? (items[0].unitPrice ?? undefined) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

export async function listSalesOrders(): Promise<SalesOrderDocument[]> {
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*, sales_order_items(*)");
  if (error) throw error;
  return ((data ?? []) as SalesOrderRow[]).map(toSalesOrder);
}

export type CreateSalesOrderInput = {
  clientId: string;
  date: string;
  customerPoNumber: string;
  type: SoType;
  taxType?: TaxType;
  prototypeStatus?: PrototypeStatus;
  source: RevenueSource | "Prototype FOC";
  numberMode?: "Auto" | "Hariff Backdate";
  manualSoNumber?: string;
  backdateReason?: string;
  items: LineItemInput[];
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
    p_source: input.source,
    p_number_mode: input.numberMode ?? "Auto",
    p_manual_so_number: manualSoNumber || null,
    p_backdate_reason: backdateReason || null,
    p_items: input.items,
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
  clientId: string;
  ownerId: string;
  customerPoNumber: string;
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
  const row: Record<string, string> = {};
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.ownerId !== undefined) row.owner_id = patch.ownerId;
  if (patch.customerPoNumber !== undefined)
    row.customer_po_number = patch.customerPoNumber;
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
