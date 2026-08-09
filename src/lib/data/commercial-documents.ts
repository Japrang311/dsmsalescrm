import { supabase } from "@/lib/supabase";
import type {
  CommercialType,
  QuotationLostReason,
  SourceFlow,
  TaskDueState,
  TaskWorkflowStatus,
} from "@/lib/domain";
import type { FollowUpResult } from "@/lib/data/follow-ups";
import type { Uom } from "./document-numbering";
import {
  encodePageCursor,
  normalizeListPageInput,
  type ListPageInput,
} from "@/lib/pagination-contracts";

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

// ---------------------------------------------------------------------------
// Stage 3 pagination: bounded per-stage keyset query + aggregate RPC wrapper
// ---------------------------------------------------------------------------

export type CommercialDocumentPageFilters = {
  stage?: string;
  ownerId?: string;
  clientStatus?: string;
};

export type CommercialDocumentPage = {
  rows: CommercialDocumentWithItems[];
  totalCount: number;
  nextCursor: string | null;
};

/**
 * Bounded keyset-paginated query for Pipeline kanban columns.
 * Only returns current Quotation revisions (is_current_revision = true) —
 * the Pipeline bug fix for superseded revisions appearing as duplicate cards.
 */
export async function listCommercialDocumentsPage(input: {
  filters?: CommercialDocumentPageFilters;
  page?: ListPageInput;
}): Promise<CommercialDocumentPage> {
  const filters = input.filters ?? {};
  const page = normalizeListPageInput(input.page);

  let query = supabase
    .from("commercial_documents")
    // clients!inner(status) is required for the .eq("clients.status", ...)
    // filter below to work at all -- PostgREST 400s on a filter referencing
    // an embedded resource that wasn't actually selected/joined. client_id
    // is NOT NULL with an FK to clients, so the inner join never excludes a
    // row that a plain select wouldn't have already included.
    .select("*, commercial_document_items(*), clients!inner(status)", {
      count: "exact",
    })
    .neq("type", "RFQ")
    .is("deleted_at", null)
    // Bug fix: only current Quotation revisions on the Pipeline board
    .or("type.neq.Quotation,is_current_revision.eq.true")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(page.pageSize + 1);

  if (filters.stage) {
    query = query.eq("stage", filters.stage);
  }
  if (filters.ownerId && filters.ownerId !== "all") {
    query = query.eq("owner_id", filters.ownerId);
  }
  if (filters.clientStatus && filters.clientStatus !== "all") {
    // Filter by client status via embedded resource join
    query = query.eq("clients.status", filters.clientStatus);
  }

  if (page.cursor) {
    query = query.or(
      `updated_at.lt.${page.cursor.sortValue},and(updated_at.eq.${page.cursor.sortValue},id.lt.${page.cursor.id})`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rawRows = (data ?? []) as CommercialDocumentRow[];
  const pageRows = rawRows.slice(0, page.pageSize);
  const lastRow = pageRows.at(-1);

  return {
    rows: pageRows.map(toDocument),
    totalCount: count ?? pageRows.length,
    nextCursor:
      rawRows.length > page.pageSize && lastRow
        ? encodePageCursor({
            sortValue: lastRow.updated_at,
            id: lastRow.id,
          })
        : null,
  };
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

export type TransitionCommercialStageInput = {
  commercialDocumentId: string;
  expectedFromStage: string;
  toStage: string;
  taskId?: string;
  createTaskTitle?: string;
  taskDueDate?: string;
  nextAction: string | null;
  nextActionDate: string | null;
  note?: string;
  method?: "Phone" | "Email" | "Visit" | "WhatsApp" | "Meeting";
  result?: FollowUpResult;
  fuDate?: string;
  workflowStatusTarget?: TaskWorkflowStatus;
  lostReason?: QuotationLostReason | null;
  lostReasonDetail?: string | null;
};

export type TransitionCommercialStageResult = {
  commercialDocumentId: string;
  fromStage: string;
  toStage: string;
  stageActivityLogId: string;
  taskId: string;
  followUpLogId: string;
  taskActivityLogId: string;
  createdTask: boolean;
  workflowStatus: TaskWorkflowStatus;
  dueState: TaskDueState;
  calendarIncomplete: boolean;
};

type TransitionCommercialStageRow = {
  commercial_document_id: string;
  from_stage: string;
  to_stage: string;
  stage_activity_log_id: string;
  task_id: string;
  follow_up_log_id: string;
  task_activity_log_id: string;
  created_task: boolean;
  workflow_status: TaskWorkflowStatus;
  due_state: TaskDueState;
  calendar_incomplete: boolean;
};

export async function transitionCommercialStage(
  input: TransitionCommercialStageInput,
): Promise<TransitionCommercialStageResult> {
  const { data, error } = await supabase.rpc("transition_commercial_stage", {
    p_commercial_document_id: input.commercialDocumentId,
    p_expected_from_stage: input.expectedFromStage,
    p_to_stage: input.toStage,
    p_task_id: input.taskId ?? null,
    p_create_task_title: input.createTaskTitle ?? null,
    p_task_due_date: input.taskDueDate ?? null,
    p_next_action: input.nextAction,
    p_next_action_date: input.nextActionDate,
    p_note: input.note ?? null,
    p_method: input.method ?? "Phone",
    p_result: input.result ?? "Progress Update",
    p_fu_date: input.fuDate ?? null,
    p_workflow_status_target: input.workflowStatusTarget ?? "In Progress",
    p_lost_reason: input.lostReason ?? null,
    p_lost_reason_detail: input.lostReasonDetail ?? null,
  });
  if (error) throw error;
  const row = data![0] as TransitionCommercialStageRow;
  return {
    commercialDocumentId: row.commercial_document_id,
    fromStage: row.from_stage,
    toStage: row.to_stage,
    stageActivityLogId: row.stage_activity_log_id,
    taskId: row.task_id,
    followUpLogId: row.follow_up_log_id,
    taskActivityLogId: row.task_activity_log_id,
    createdTask: row.created_task,
    workflowStatus: row.workflow_status,
    dueState: row.due_state,
    calendarIncomplete: row.calendar_incomplete,
  };
}
