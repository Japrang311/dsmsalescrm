import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiahShort } from "@/lib/format";
import type { CommercialItem } from "@/lib/domain";
import type { OwnerLookup } from "@/lib/data/clients";
import type {
  quotationFunnel,
  taskCounts,
} from "@/lib/data/dashboard-selectors";
import { StatBlock } from "./ReportPrimitives";
import { CHART_COLORS } from "./chart-colors";

export function ReportsFunnelSection({
  funnel,
  openQuotationValue,
  taskSummary,
  role,
  waitingPoRows,
  waitingPoTotal,
  clientsById,
  owners,
}: {
  funnel: ReturnType<typeof quotationFunnel>;
  openQuotationValue: number;
  taskSummary: ReturnType<typeof taskCounts>;
  role: string;
  waitingPoRows: { item: CommercialItem; aging: string }[];
  waitingPoTotal: number;
  clientsById: Record<string, { name: string }>;
  owners: OwnerLookup;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-sm font-semibold">
            Quotation Funnel dan Open Pipeline
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Open Quotation Sent:{" "}
            <span className="font-semibold text-foreground">
              {formatRupiahShort(openQuotationValue)}
            </span>
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          {funnel.map((s, i) => {
            const max = Math.max(...funnel.map((x) => x.value), 1);
            const pct = (s.value / max) * 100;
            return (
              <div key={s.stage} className="flex items-center gap-2 text-xs">
                <div className="w-40 truncate text-muted-foreground">
                  {s.stage}
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/60">
                    <div
                      className="h-full rounded-md"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="w-28 shrink-0 whitespace-nowrap text-right text-[10px] font-medium tabular-nums text-foreground">
                    {s.count} · {formatRupiahShort(s.value)}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle
            as="h2"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Target className="h-4 w-4 text-primary" /> Task Control
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-xs">
          <StatBlock
            label="Open"
            value={`${taskSummary.open}`}
            tone="primary"
          />
          <StatBlock
            label="Overdue"
            value={`${taskSummary.overdue}`}
            tone="amber"
          />
          <StatBlock
            label="Escalated"
            value={`${taskSummary.escalated}`}
            tone="muted"
          />
          <StatBlock
            label="Done dan Cancelled"
            value={`${taskSummary.done} · ${taskSummary.cancelled}`}
            tone="emerald"
          />
          {role === "executive" ? (
            <p className="col-span-2 text-[11px] text-muted-foreground">
              Aggregate-only; detail Task rows follow Executive exception
              boundary.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-sm font-semibold">
            Waiting PO — Nilai dan Aging
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Total nilai menunggu PO:{" "}
            <span className="font-semibold text-foreground">
              {formatRupiahShort(waitingPoTotal)}
            </span>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {waitingPoRows.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Tidak ada item menunggu PO pada scope filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Klien dan Project</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs">Aging</TableHead>
                  <TableHead className="text-right text-xs">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitingPoRows.slice(0, 6).map(({ item, aging }) => (
                  <TableRow key={item.id} className="text-xs">
                    <TableCell className="max-w-[220px] truncate">
                      <div className="font-medium">
                        {clientsById[item.clientId]?.name ?? "-"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.projectName ?? item.description}
                      </div>
                    </TableCell>
                    <TableCell>{owners[item.ownerId]?.name ?? "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          aging.startsWith(">") ? "destructive" : "outline"
                        }
                        className="text-[10px]"
                      >
                        {aging}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatRupiahShort(item.estimatedValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
