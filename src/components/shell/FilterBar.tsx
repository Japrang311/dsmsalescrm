import type { ReactNode } from "react";
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
}: {
  children: ReactNode;
  label?: boolean;
  className?: string;
}) {
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
