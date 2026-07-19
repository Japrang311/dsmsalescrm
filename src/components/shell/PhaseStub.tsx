import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PhaseStub({
  title,
  phase,
  description,
  children,
}: {
  title: string;
  phase: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Modul ini akan aktif pada phase berikutnya.
        </p>
      </div>
      <Card className="border-dashed border-border shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Construction className="h-5 w-5" />
          </div>
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary-soft text-primary"
          >
            {phase}
          </Badge>
          <p className="max-w-md text-sm text-muted-foreground">
            {description}
          </p>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
