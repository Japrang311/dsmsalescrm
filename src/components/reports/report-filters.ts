import type { PeriodRange } from "@/components/dashboard/DateRangePicker";

export type ReportFilters = {
  range: PeriodRange;
  ownerId: string; // "all" or user id
  clientId: string; // "all" or client id
  taxType: string; // "all" | "PPN" | "Non-PPN"
  source: string; // "all" | "New Product" | "Existing / Repeat Order" | "Prototype Paid" | "Prototype FOC"
  soType: string; // "all" | "Regular" | "Prototype"
};

export function defaultReportFilters(range: PeriodRange): ReportFilters {
  return {
    range,
    ownerId: "all",
    clientId: "all",
    taxType: "all",
    source: "all",
    soType: "all",
  };
}
