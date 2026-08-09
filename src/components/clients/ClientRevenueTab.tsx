import { ReceiptText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionTitle } from "@/components/clients/ClientPrimitives";
import { formatDateShort, formatRupiahShort } from "@/lib/format";
import type { SalesOrderDocument } from "@/lib/data/sales-orders";

export function ClientRevenueTab({
  clientOrders,
}: {
  clientOrders: SalesOrderDocument[];
}) {
  return (
    <div className="mt-4">
      <Card>
        <CardContent className="p-4">
          <SectionTitle icon={ReceiptText} title="Revenue History" />
          {clientOrders.length === 0 ? (
            <EmptyState
              className="mt-3"
              description="Belum ada revenue tercatat untuk klien ini."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO Number</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Prototype</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientOrders
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((so) => (
                      <TableRow key={so.id}>
                        <TableCell className="font-medium">
                          {so.soNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {so.source}
                        </TableCell>
                        <TableCell>{so.taxType ?? "—"}</TableCell>
                        <TableCell>
                          {so.type === "Prototype" && so.prototypeStatus ? (
                            <Badge
                              variant={
                                so.prototypeStatus === "Paid"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {so.prototypeStatus}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateShort(so.date)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {so.value != null && so.value > 0
                            ? formatRupiahShort(so.value)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
