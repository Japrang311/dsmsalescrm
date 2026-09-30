import { PageContainer } from "./PageContainer";
import { Skeleton } from "@/components/ui/skeleton";

// Just the table block. Pages that already rendered their header and filters
// swap only this in, so those controls stay usable while rows load.
export function TableRowsSkeleton({
  label,
  rows = 8,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="space-y-2 rounded-xl border p-4"
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

// Whole-page placeholder for routes that have nothing to show yet. Two shapes
// cover every route: "detail" (header + hero block + a pair of cards) and
// "table" (header + filter row + metric tiles + rows). Matching the real layout
// keeps content from jumping when it replaces the skeleton.
export function PageSkeleton({
  label,
  variant = "detail",
}: {
  label: string;
  variant?: "detail" | "table";
}) {
  return (
    <PageContainer size={variant === "table" ? "wide" : "default"}>
      <div
        role="status"
        aria-label={label}
        aria-busy="true"
        className="space-y-5"
      >
        <span className="sr-only">{label}</span>
        <Skeleton className="h-8 w-48" />
        {variant === "table" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-32 rounded-md" />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <TableRowsSkeleton label={label} />
          </>
        ) : (
          <>
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
