import { supabase } from "@/lib/supabase";
import type {
  CommercialType,
  QuotationLostReason,
  SourceFlow,
} from "@/lib/domain";
import type { Uom } from "./document-numbering";

export type LineItemInput = {
  productName: string;
  description?: string;
  qty: number;
  uom: Uom;
  unitPrice?: number;
};

export type CommercialDocumentLineItem = {
  id: string;
  commercialDocumentId: string;
  productName: string | null;
  description: string | null;
  qty: number | null;
  uom: Uom | null;
  unitPrice: number | null;
  lineTotal: number | null;
  linePosition: number;
};

export type CommercialDocumentWithItems = {
  id: string;
  clientId: string;
  ownerId: string;
  type: CommercialType;
  sourceFlow: SourceFlow;
  documentDate: string;
  quotationNumber: string | null;
  quotationBaseNumber: string | null;
  quotationRevision: number;
  isCurrentRevision: boolean;
  supersedesDocumentId: string | null;
  quotationExpiredDate: string | null;
  stage: string;
  clientAddress: string | null;
  soNumber: string | null;
  note: string | null;
  lostReason: QuotationLostReason | null;
  lostReasonDetail: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  totalValue: number;
  items: CommercialDocumentLineItem[];
};

type LineItemRow = {
  id: string;
  commercial_document_id: string;
  product_name: string | null;
  description: string | null;
  qty: number | null;
  uom: Uom | null;
  unit_price: number | null;
  line_total: number | null;
  line_position: number;
};

type CommercialDocumentRow = {
  id: string;
  client_id: string;
  owner_id: string;
  type: CommercialType | "RFQ";
  source_flow: SourceFlow | "RFQ / New Product";
  document_date: string;
  quotation_number: string | null;
  quotation_base_number: string | null;
  quotation_revision: number;
  is_current_revision: boolean;
  supersedes_document_id: string | null;
  quotation_expired_date: string | null;
  stage: string;
  client_address: string | null;
  so_number: string | null;
  note: string | null;
  lost_reason: QuotationLostReason | null;
  lost_reason_detail: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  commercial_document_items?: LineItemRow[];
  items?: LineItemRow[];
};

function toLineItem(row: LineItemRow): CommercialDocumentLineItem {
  return {
    id: row.id,
    commercialDocumentId: row.commercial_document_id,
    productName: row.product_name,
    description: row.description,
    qty: row.qty,
    uom: row.uom,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    linePosition: row.line_position,
  };
}

function toDocument(row: CommercialDocumentRow): CommercialDocumentWithItems {
  if (row.type === "RFQ") {
    throw new Error("RETIRED_RFQ_DOCUMENT");
  }
  const items = (row.commercial_document_items ?? row.items ?? [])
    .map(toLineItem)
    .sort((a, b) => a.linePosition - b.linePosition);
  return {
    id: row.id,
    clientId: row.client_id,
    ownerId: row.owner_id,
    type: row.type,
    sourceFlow:
      row.source_flow === "RFQ / New Product" ? "New Product" : row.source_flow,
    documentDate: row.document_date,
    quotationNumber: row.quotation_number,
    quotationBaseNumber: row.quotation_base_number,
    quotationRevision: row.quotation_revision,
    isCurrentRevision: row.is_current_revision,
    supersedesDocumentId: row.supersedes_document_id,
    quotationExpiredDate: row.quotation_expired_date,
    stage: row.stage,
    clientAddress: row.client_address,
    soNumber: row.so_number,
    note: row.note,
    lostReason: row.lost_reason,
    lostReasonDetail: row.lost_reason_detail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    totalValue: items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0),
    items,
  };
}

export type CommercialDocumentQuery = {
  deleted?: boolean;
};

export async function listCommercialDocuments(
  options: CommercialDocumentQuery = {},
): Promise<CommercialDocumentWithItems[]> {
  let query = supabase
    .from("commercial_documents")
    .select("*, commercial_document_items(*)")
    .neq("type", "RFQ");
  query = options.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CommercialDocumentRow[]).map(toDocument);
}

export async function getCommercialDocument(
  id: string,
  options: CommercialDocumentQuery = {},
): Promise<CommercialDocumentWithItems | null> {
  let query = supabase
    .from("commercial_documents")
    .select("*, commercial_document_items(*)")
    .eq("id", id)
    .neq("type", "RFQ");
  query = options.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? toDocument(data as CommercialDocumentRow) : null;
}

export async function deleteCommercialDocument(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_commercial_document_deleted", {
    p_document_id: id,
    p_deleted: true,
  });
  if (error) throw error;
}

export async function restoreCommercialDocument(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_commercial_document_deleted", {
    p_document_id: id,
    p_deleted: false,
  });
  if (error) throw error;
}

export async function createPrototypeRequest(input: {
  clientId: string;
  documentDate: string;
  items: LineItemInput[];
}): Promise<CommercialDocumentWithItems> {
  const { data, error } = await supabase.rpc("create_prototype_request", {
    p_client_id: input.clientId,
    p_document_date: input.documentDate,
    p_items: input.items,
  });
  if (error) throw error;
  return toDocument(data as CommercialDocumentRow);
}

export type CreateQuotationInput = {
  clientId: string;
  documentDate: string;
  clientAddress?: string;
  stage?: string;
  soNumber?: string;
  note?: string;
  items: LineItemInput[];
  nextAction: string;
  nextActionDate: string;
};

export async function createQuotation(
  input: CreateQuotationInput,
): Promise<CommercialDocumentWithItems> {
  const { data, error } = await supabase.rpc("create_quotation", {
    p_client_id: input.clientId,
    p_document_date: input.documentDate,
    p_client_address: input.clientAddress ?? null,
    p_stage: input.stage ?? "Quotes Sent",
    p_so_number: input.soNumber ?? null,
    p_note: input.note ?? null,
    p_items: input.items,
    p_next_action: input.nextAction,
    p_next_action_date: input.nextActionDate,
  });
  if (error) throw error;
  return toDocument(data as CommercialDocumentRow);
}

export type ReviseQuotationInput = {
  documentDate: string;
  clientAddress?: string;
  soNumber?: string;
  note?: string;
  items: LineItemInput[];
  nextAction: string;
  nextActionDate: string;
};

export async function reviseQuotation(
  documentId: string,
  input: ReviseQuotationInput,
): Promise<CommercialDocumentWithItems> {
  const { data, error } = await supabase.rpc("revise_quotation", {
    p_document_id: documentId,
    p_document_date: input.documentDate,
    p_client_address: input.clientAddress ?? null,
    p_so_number: input.soNumber ?? null,
    p_note: input.note ?? null,
    p_items: input.items,
    p_next_action: input.nextAction,
    p_next_action_date: input.nextActionDate,
  });
  if (error) throw error;
  return toDocument(data as CommercialDocumentRow);
}

export type CommercialDocumentPatch = Partial<{
  quotationNumber: string | null;
  quotationBaseNumber: string | null;
  documentDate: string;
  quotationExpiredDate: string | null;
  stage: string;
  ownerId: string;
  soNumber: string | null;
  note: string | null;
  clientAddress: string | null;
  lostReason: QuotationLostReason | null;
  lostReasonDetail: string | null;
}>;

export async function updateCommercialDocument(
  id: string,
  patch: CommercialDocumentPatch,
): Promise<CommercialDocumentWithItems> {
  const update: Record<string, unknown> = {};
  if (patch.quotationNumber !== undefined)
    update.quotation_number = patch.quotationNumber || null;
  if (patch.quotationBaseNumber !== undefined)
    update.quotation_base_number = patch.quotationBaseNumber || null;
  if (patch.documentDate !== undefined)
    update.document_date = patch.documentDate;
  if (patch.quotationExpiredDate !== undefined)
    update.quotation_expired_date = patch.quotationExpiredDate || null;
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.ownerId !== undefined) update.owner_id = patch.ownerId;
  if (patch.soNumber !== undefined) update.so_number = patch.soNumber || null;
  if (patch.note !== undefined) update.note = patch.note || null;
  if (patch.lostReason !== undefined)
    update.lost_reason = patch.lostReason || null;
  if (patch.lostReasonDetail !== undefined)
    update.lost_reason_detail = patch.lostReasonDetail?.trim() || null;
  if (patch.clientAddress !== undefined)
    update.client_address = patch.clientAddress || null;

  const { data, error } = await supabase
    .from("commercial_documents")
    .update(update)
    .eq("id", id)
    .select("*, commercial_document_items(*)")
    .single();
  if (error) throw error;
  return toDocument(data as CommercialDocumentRow);
}

export type CommercialDocumentLineItemPatch = Partial<{
  productName: string | null;
  description: string | null;
  qty: number;
  uom: Uom;
  unitPrice: number | null;
  lineTotal: number | null;
}>;

export async function updateCommercialDocumentLineItem(
  id: string,
  patch: CommercialDocumentLineItemPatch,
): Promise<CommercialDocumentLineItem> {
  const update: Record<string, unknown> = {};
  if (patch.productName !== undefined)
    update.product_name = patch.productName || null;
  if (patch.description !== undefined)
    update.description = patch.description || null;
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.uom !== undefined) update.uom = patch.uom;
  if (patch.unitPrice !== undefined) update.unit_price = patch.unitPrice;
  if (patch.lineTotal !== undefined) update.line_total = patch.lineTotal;

  const { data, error } = await supabase
    .from("commercial_document_items")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toLineItem(data as LineItemRow);
}
