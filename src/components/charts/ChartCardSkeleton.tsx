import { Skeleton } from "@/components/ui/skeleton";

// Placeholder for a chart section while recharts loads. Recharts is ~412 KB,
// so every chart is behind React.lazy and this holds its slot to keep the
// surrounding layout from shifting when the chart arrives.
export function ChartCardSkeleton({
  count = 1,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Memuat grafik…"
      aria-busy="true"
      className={className ?? "grid gap-4"}
    >
      <span className="sr-only">Memuat grafik…</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[340px] w-full rounded-xl" />
      ))}
    </div>
  );
}
