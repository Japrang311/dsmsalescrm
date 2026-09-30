import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type OperationalStat = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "destructive";
};

/**
 * The secondary metric strip. These are context, not the headline, so they get
 * a rule-and-type treatment instead of the bordered cards they used to use —
 * five white cards read as peers of the hero block above them.
 */
export function OperationalStats({ stats }: { stats: OperationalStat[] }) {
  return (
    <section
      aria-label="Ringkasan operasional"
      className="precision-stagger grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-5"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="border-t-2 border-border pt-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </p>
          <p
            className={cn(
              "num mt-1 text-lg font-semibold leading-tight text-foreground",
              stat.tone === "destructive" && "text-destructive",
            )}
          >
            {stat.value}
          </p>
          {stat.sub ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
