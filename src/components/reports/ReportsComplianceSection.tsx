import {
  Activity as ActivityIcon,
  AlertTriangle,
  FlaskConical,
  Info,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatPercent, formatRupiahShort } from "@/lib/format";
import type { riskAlerts } from "@/lib/data/dashboard-selectors";
import { StatBlock } from "./ReportPrimitives";

export function ReportsComplianceSection({
  compliance,
  totals,
  alerts,
}: {
  compliance: number;
  totals: { protoPaid: number; protoFocCount: number; protoPaidCount: number };
  alerts: ReturnType<typeof riskAlerts>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ActivityIcon className="h-4 w-4 text-primary" /> Activity
            Compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-2xl font-semibold tabular-nums">
            {formatPercent(compliance)}
          </p>
          <Progress value={compliance * 100} />
          <p className="text-[11px] text-muted-foreground">
            Persentase akun aktif dengan next follow-up terjadwal. Threshold
            sehat ≥ 80%.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="h-4 w-4 text-primary" /> Prototype Report
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-xs">
          <StatBlock
            label="Paid value"
            value={formatRupiahShort(totals.protoPaid)}
            tone="primary"
          />
          <StatBlock
            label="Paid count"
            value={`${totals.protoPaidCount} SO`}
            tone="emerald"
          />
          <StatBlock
            label="FOC count"
            value={`${totals.protoFocCount} SO`}
            tone="amber"
          />
          <StatBlock
            label="Support activity"
            value={`${totals.protoPaidCount + totals.protoFocCount} total`}
            tone="muted"
          />
          <p className="col-span-2 text-[11px] text-muted-foreground">
            <Info className="mr-1 inline h-3 w-3" /> Prototype FOC tidak pernah
            masuk ke chart revenue.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Risk Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Tidak ada risiko teridentifikasi.
            </p>
          ) : (
            alerts.map((a) => (
              <Alert
                key={a.id}
                variant={a.severity === "high" ? "destructive" : "default"}
                className="py-2"
              >
                <AlertTitle className="text-xs">{a.title}</AlertTitle>
                <AlertDescription className="text-[11px]">
                  {a.detail}
                </AlertDescription>
              </Alert>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
