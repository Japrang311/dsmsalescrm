import { cn } from "@/lib/utils";
import type { ClientStatus, Stage } from "@/lib/mock-data";

const statusStyles: Record<ClientStatus, string> = {
  Prospect: "bg-info/15 text-info border-info/30",
  "Active Customer": "bg-success/15 text-success border-success/30",
  "Repeat Order": "bg-teal/15 text-teal border-teal/30",
  Dormant: "bg-warning/20 text-[oklch(0.4_0.1_75)] border-warning/40",
  Lost: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
      )}
    >
      {status}
    </span>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const color =
    stage === "Closed Lost"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : stage === "Revenue Recorded"
        ? "bg-success/15 text-success border-success/30"
        : stage.includes("PO") || stage.includes("Sales Order")
          ? "bg-teal/15 text-teal border-teal/30"
          : "bg-info/15 text-info border-info/30";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs", color)}>
      {stage}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: "Open" | "Done" | "Overdue" | "Archived" }) {
  const color =
    status === "Overdue"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : status === "Done"
        ? "bg-success/15 text-success border-success/30"
        : status === "Archived"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-info/15 text-info border-info/30";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", color)}>
      {status}
    </span>
  );
}
