import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description: string;
  className?: string;
}

// The one canonical "no data yet" treatment for the app — a dashed box,
// optional icon, optional title, required description. Section-level uses
// keep the default py-6; page/list-level uses (replacing a whole table or
// inbox) can pass a taller `className` (e.g. "py-12") without changing the
// visual language itself.
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-6 text-center text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="h-6 w-6 text-muted-foreground/60" />}
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      <p className="text-xs">{description}</p>
    </div>
  );
}
