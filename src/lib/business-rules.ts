import type {
  ClientStatus,
  PrototypeStage,
  RepeatStage,
  RfqStage,
  SourceFlow,
} from "@/lib/domain";

// The seven exact weighted stages (PRD §7) — see
// src/lib/data/commercial-stages.ts's COMMERCIAL_STAGE_WEIGHTS for the
// forecast weights these same names carry.
export const RFQ_STAGES: RfqStage[] = [
  "Client Request for Quotes",
  "Quotes Sent",
  "Negotiation",
  "Hot Prospect",
  "Commit",
  "Closed Won",
  "Closed Lost",
];

// RFQ is the client's request for pricing/specification. Once DSM has
// calculated it into an offer, the work belongs to the quotation stages below.
export const RFQ_INTAKE_STAGES: RfqStage[] = ["Client Request for Quotes"];

// Quotation stages cover the offer workflow after RFQ intake. Some historical
// RFQ documents can already be here because the stage was advanced before a
// separate Quotation document existed.
export const QUOTATION_STAGES: RfqStage[] = [
  "Quotes Sent",
  "Negotiation",
  "Hot Prospect",
  "Commit",
  "Closed Won",
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
