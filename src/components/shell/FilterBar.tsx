import { useState, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared trigger sizing for every filter control (Select triggers, combobox
// buttons) so the app's filter bars read as one system: one height, and
// full-width stacked on mobile / auto-width wrapped on desktop.
export const FILTER_TRIGGER_CLASS =
  "h-9 w-full justify-between text-xs sm:w-auto sm:min-w-[9.5rem]";

// Container: a labelled card that stacks its controls on mobile and wraps
// them into a row on >= sm. Pass `label={false}` to hide the "Filter" tag.
export function FilterBar({
  children,
  label = true,
  className,
  collapsible = false,
  activeCount = 0,
  onReset,
}: {
  children: ReactNode;
  label?: boolean;
  className?: string;
  collapsible?: boolean;
  activeCount?: number;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (collapsible) {
    return (
      <div className={cn("rounded-lg border bg-card", className)}>
        <div className="flex items-center justify-between gap-3 px-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex min-h-11 items-center gap-2 text-sm font-medium text-foreground"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filter{activeCount > 0 ? ` (${activeCount} aktif)` : ""}
            <span className="text-xs font-normal text-muted-foreground">
              {open ? "Tutup" : "Tampilkan"}
            </span>
          </button>
          {activeCount > 0 && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="min-h-11 text-xs font-medium text-primary"
            >
              Reset filter
            </button>
          )}
        </div>
        {open && (
          <div className="precision-enter flex flex-col gap-2 border-t p-3 sm:flex-row sm:flex-wrap sm:items-center">
            {children}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-2.5 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {label ? (
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground sm:pl-1 sm:pr-1">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>
      ) : null}
      {children}
    </div>
  );
}
