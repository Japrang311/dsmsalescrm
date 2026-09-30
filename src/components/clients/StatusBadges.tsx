import { cn } from "@/lib/utils";
import type { ClientStatus } from "@/lib/domain";

const STATUS_STYLES: Record<ClientStatus, string> = {
  // Prospect keeps a raw hue: "new, not yet judged" has no semantic token,
  // and muted/primary are already taken by Lost and Repeat Order.
  Prospect: "bg-sky-100 text-sky-800 border-sky-200",
  "Active Customer": "bg-success/10 text-success border-success/30",
  "Repeat Order": "bg-primary-soft text-primary border-primary/20",
  Dormant: "bg-warning/10 text-warning border-warning/30",
  Lost: "bg-muted text-muted-foreground border-border",
};

const STATUS_DOT: Record<ClientStatus, string> = {
  Prospect: "bg-sky-500",
  "Active Customer": "bg-success",
  "Repeat Order": "bg-primary",
  Dormant: "bg-warning",
  Lost: "bg-muted-foreground",
};

export function StatusBadge({
  status,
  className,
  variant = "pill",
}: {
  status: ClientStatus;
  className?: string;
  // "pill" — filled, for a single prominent placement (detail headers, dialogs).
  // "inline" — a quiet dot + label, for list rows where a wall of filled pills
  //   would drown out the row's real status (pipeline stage, task urgency).
  variant?: "pill" | "inline";
}) {
  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            STATUS_DOT[status],
          )}
        />
        {status}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

const RISK_STYLES = {
  Low: "bg-success/10 text-success border-success/30",
  Medium: "bg-warning/10 text-warning border-warning/30",
  High: "bg-destructive/10 text-destructive border-destructive/30",
  // Risk needs commercial-item/advisory data that doesn't exist yet in the
  // real backend (Phase 4+) — this is an honest "not computed", not a
  // fourth real risk tier.
  Unknown: "bg-muted text-muted-foreground border-border",
} as const;

export function RiskDot({
  risk,
}: {
  risk: "Low" | "Medium" | "High" | "Unknown";
}) {
  const color =
    risk === "Low"
      ? "bg-success"
      : risk === "Medium"
        ? "bg-warning"
        : risk === "High"
          ? "bg-destructive"
          : "bg-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        RISK_STYLES[risk],
      )}
      title={risk === "Unknown" ? "Risk: not available yet" : `Risk: ${risk}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {risk === "Unknown" ? "—" : risk}
    </span>
  );
}
