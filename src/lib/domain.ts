export type Role = "sales" | "manager" | "executive" | "super_admin";

export type DateRange = { from: Date; to: Date };

export type ClientStatus =
  | "Prospect"
  | "Active Customer"
  | "Dormant"
  | "Lost"
  | "Repeat Order";

export type ClientSource =
  | "Referral"
  | "Website Inquiry"
  | "Business Relationship"
  | "Repeat";

export type ClientContact = {
  name?: string;
  position?: string;
  email?: string;
  phone?: string;
  mobile?: string;
};

export type Client = {
  id: string;
  name: string;
  status: ClientStatus;
  source: ClientSource;
  ownerId: string;
  spendingYtd: number;
  lastFu?: string;
  nextFu?: string;
  address?: string;
  province?: string;
  city?: string;
  industry?: string;
  website?: string;
  notes?: string;
  contacts: [ClientContact, ClientContact, ClientContact];
};

export type CommercialType =
  | "Quotation"
  | "Direct Order"
  | "Prototype"
  | "Customer PO"
  | "Sales Order";

export type SourceFlow =
  | "New Product"
  | "Existing / Repeat Order"
  | "Prototype";

// The seven exact weighted stages (PRD §7) — see
// src/lib/data/commercial-stages.ts's COMMERCIAL_STAGE_WEIGHTS, the actual
// source of truth. Kept as a separate type alias here (not re-exported from
// commercial-stages.ts) only because domain.ts has no data-layer imports.
export type QuotationStage =
  | "Quotes Sent"
  | "Negotiation"
  | "Hot Prospect"
  | "Commit"
  | "Closed Won"
  | "Closed Lost";

export type QuotationLostReason =
  | "Harga tidak kompetitif"
  | "Kalah tender/kompetitor"
  | "Spesifikasi tidak sesuai"
  | "Project ditunda/dibatalkan"
  | "Tidak ada respons"
  | "Lead time"
  | "Anggaran"
  | "Lainnya"
  | "Belum diklasifikasi";

export type RepeatStage =
  | "Timeplan/Price Update Requested"
  | "Waiting Client PO"
  | "PO Received"
  | "Sales Order Released"
  | "Revenue Recorded";

export type PrototypeStage =
  | "Prototype Requested"
  | "Requirement/Feasibility Review"
  | "Prototype in Progress"
  | "SO Prototype Released"
  | "Delivered"
  | "Closed";

export type CommercialItem = {
  id: string;
  clientId: string;
  ownerId: string;
  type: CommercialType;
  sourceFlow: SourceFlow;
  stage: string;
  description: string;
  projectName?: string;
  estimatedValue: number;
  updatedAt: string;
  quotationNumber?: string;
  quotationBaseNumber?: string;
  quotationRevision?: number;
  quotationExpiredDate?: string;
  clientAddress?: string;
  note?: string;
  lostReason?: QuotationLostReason;
  lostReasonDetail?: string;
  customerPoNumber?: string;
  soNumber?: string;
  qty?: number;
  unitPrice?: number;
  taxType?: "PPN" | "Non-PPN";
  prototypeStatus?: "Paid" | "FOC";
  nextActionDate?: string;
  documentDate?: string;
  itemCount?: number;
  forecastValue?: number | null;
  isCurrentRevision?: boolean;
  supersedesDocumentId?: string;
  lineItems?: {
    id: string;
    productName: string | null;
    description: string | null;
    qty: number | null;
    uom: "Unit" | "Pcs" | "Set" | "Lot" | null;
    unitPrice: number | null;
    lineTotal: number | null;
    linePosition: number;
  }[];
};

export type SoType = "Regular" | "Prototype";
export type TaxType = "PPN" | "Non-PPN";
export type PrototypeStatus = "Paid" | "FOC";
export type RevenueSource =
  | "New Product"
  | "Existing / Repeat Order"
  | "Prototype Paid";

export type SalesOrder = {
  id: string;
  soNumber: string;
  clientId: string;
  ownerId: string;
  type: SoType;
  taxType?: TaxType;
  prototypeStatus?: PrototypeStatus;
  source: RevenueSource | "Prototype FOC";
  value: number | null;
  date: string;
  qty?: number;
  unitPrice?: number;
};

export type MonthlyTarget = { month: number; target: number };

// Legacy due-state-shaped status, dual-read alongside workflowStatus/dueState
// until Task 16/61 retires it (spec §6.1, §6.6). Every consumer still
// reading `.status` directly is inventoried in
// .superpowers/sdd/sales-task-control-loop-task-2-report.md.
export type TaskStatus = "Today" | "Overdue" | "Upcoming" | "Done";

// Workflow status the user chooses (Sales Task Control Loop spec §2.1) --
// never derived from a date, unlike TaskDueState below.
export type TaskWorkflowStatus =
  | "Open"
  | "In Progress"
  | "Waiting External"
  | "Done"
  | "Cancelled";

// Derived, not stored (spec §2.2): computed by
// public.compute_task_due_state / src/lib/data/business-calendar.ts's
// computeTaskDueState() for the same due_date/workflowStatus, never
// written directly. null for Done/Cancelled Tasks, which have no active
// due state.
export type TaskDueState =
  | "Upcoming"
  | "Today"
  | "Overdue"
  | "Escalated"
  | null;

export type TaskCategory =
  | "Project/Opportunity Planning"
  | "Client Meeting/Visit"
  | "Follow-Up"
  | "Quotation"
  | "Sales Order"
  | "Internal/Admin"
  | "Other";

export type Task = {
  id: string;
  // Optional end-to-end (spec §2.1, Task 7/52) -- a Task may now omit
  // Client. Task 6/51 deliberately kept this required to avoid breaking
  // tsc in files outside its own scope; Task 7/52 is where "may omit
  // Client" is an actual acceptance criterion, so the ripple (TopBar.tsx,
  // LogFollowUpDialog.tsx, _app.tasks.tsx) is fixed here instead.
  clientId?: string;
  ownerId: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  title: string;
  dueDate: string;
  method: "Phone" | "Email" | "Visit" | "WhatsApp" | "Meeting";
  status: TaskStatus;
  workflowStatus: TaskWorkflowStatus;
  dueState: TaskDueState;
  calendarIncomplete: boolean;
  category: TaskCategory;
  nextAction?: string;
  nextActionDate?: string;
  cancellationReason?: string;
  priority: "High" | "Normal" | "Low";
  archived?: boolean;
};

export { CURRENT_MONTH, CURRENT_YEAR, NOW, PINNED_TODAY } from "@/lib/app-time";
