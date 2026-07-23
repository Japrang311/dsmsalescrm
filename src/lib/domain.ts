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
  | "RFQ"
  | "Quotation"
  | "Direct Order"
  | "Prototype"
  | "Customer PO"
  | "Sales Order";

export type SourceFlow =
  | "RFQ / New Product"
  | "Existing / Repeat Order"
  | "Prototype";

// The seven exact weighted stages (PRD §7) — see
// src/lib/data/commercial-stages.ts's COMMERCIAL_STAGE_WEIGHTS, the actual
// source of truth. Kept as a separate type alias here (not re-exported from
// commercial-stages.ts) only because domain.ts has no data-layer imports.
export type RfqStage =
  | "Client Request for Quotes"
  | "Quotes Sent"
  | "Negotiation"
  | "Hot Prospect"
  | "Commit"
  | "Closed Won"
  | "Closed Lost";

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
  rfqNumber?: string;
  quotationNumber?: string;
  quotationBaseNumber?: string;
  quotationRevision?: number;
  clientAddress?: string;
  note?: string;
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
  | "RFQ / New Product"
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

export type TaskStatus = "Today" | "Overdue" | "Upcoming" | "Done";

export type Task = {
  id: string;
  clientId: string;
  ownerId: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  title: string;
  dueDate: string;
  method: "Phone" | "Email" | "Visit" | "WhatsApp" | "Meeting";
  status: TaskStatus;
  priority: "High" | "Normal" | "Low";
  archived?: boolean;
};

export { CURRENT_MONTH, CURRENT_YEAR, NOW, PINNED_TODAY } from "@/lib/app-time";
