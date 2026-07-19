import type {
  ClientStatus,
  PrototypeStage,
  RepeatStage,
  RfqStage,
  SourceFlow,
} from "@/lib/domain";

export const RFQ_STAGES: RfqStage[] = [
  "RFQ Received",
  "Quotation in Progress",
  "Quotation Sent",
  "Waiting Client PO",
  "PO Received",
  "Sales Order Released",
  "Revenue Recorded",
  "Closed Lost",
];

export const REPEAT_STAGES: RepeatStage[] = [
  "Timeplan/Price Update Requested",
  "Waiting Client PO",
  "PO Received",
  "Sales Order Released",
  "Revenue Recorded",
];

export const PROTOTYPE_STAGES: PrototypeStage[] = [
  "Prototype Requested",
  "Requirement/Feasibility Review",
  "Prototype in Progress",
  "SO Prototype Released",
  "Delivered",
  "Closed",
];

export const CLIENT_STATUSES: ClientStatus[] = [
  "Prospect",
  "Active Customer",
  "Dormant",
  "Lost",
  "Repeat Order",
];

export function stagesForFlow(flow: SourceFlow): string[] {
  if (flow === "Prototype") return PROTOTYPE_STAGES;
  if (flow === "Existing / Repeat Order") return REPEAT_STAGES;
  return RFQ_STAGES;
}
