import { PageContainer } from "./PageContainer";
import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton({ label }: { label: string }) {
  return (
    <PageContainer>
      <div
        role="status"
        aria-label={label}
        aria-busy="true"
        className="space-y-5"
      >
        <span className="sr-only">{label}</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </PageContainer>
  );
}
