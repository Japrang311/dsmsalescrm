import { cn } from "@/lib/utils";
import type { ClientStatus } from "@/lib/domain";

const STATUS_STYLES: Record<ClientStatus, string> = {
  Prospect: "bg-sky-100 text-sky-800 border-sky-200",
  "Active Customer": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Repeat Order": "bg-primary-soft text-primary border-primary/20",
  Dormant: "bg-amber-100 text-amber-800 border-amber-200",
  Lost: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ClientStatus;
  className?: string;
}) {
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
  Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  High: "bg-rose-50 text-rose-700 border-rose-200",
  // Risk needs commercial-item/advisory data that doesn't exist yet in the
  // real backend (Phase 4+) — this is an honest "not computed", not a
  // fourth real risk tier.
  Unknown: "bg-zinc-50 text-zinc-500 border-zinc-200",
} as const;

export function RiskDot({
  risk,
}: {
  risk: "Low" | "Medium" | "High" | "Unknown";
}) {
  const color =
    risk === "Low"
      ? "bg-emerald-500"
      : risk === "Medium"
        ? "bg-amber-500"
        : risk === "High"
          ? "bg-rose-500"
          : "bg-zinc-400";
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
