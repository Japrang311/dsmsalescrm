import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MiniStat({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        onClick &&
          "cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "danger" ? "text-rose-600" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "shadow-sm",
        onClick && "cursor-pointer transition-colors hover:bg-muted/50",
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4 text-primary" /> {title}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
