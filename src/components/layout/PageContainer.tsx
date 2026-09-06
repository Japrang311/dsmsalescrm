import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  size?: "default" | "wide" | "full";
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4 p-4 md:gap-5 md:p-6",
        size === "default" && "max-w-[1440px]",
        size === "wide" && "max-w-[1600px]",
        size === "full" && "max-w-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
