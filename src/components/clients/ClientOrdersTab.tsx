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

export function ClientOrdersTab({
  clientOrders,
}: {
  clientOrders: SalesOrderDocument[];
}) {
  return (
    <div className="mt-4 space-y-3">
      <Card>
        <CardContent className="p-4">
          <SectionTitle icon={ReceiptText} title="Sales Orders" />
          {clientOrders.length === 0 ? (
            <EmptyState
              className="mt-3"
              description="Belum ada Sales Order untuk klien ini."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO Number</TableHead>
                    <TableHead>Nama Product</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientOrders
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((so) => {
                      const items = so.items ?? [];
                      return (
                        <TableRow key={so.id}>
                          <TableCell className="font-medium">
                            {so.soNumber}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {items.length === 0
                              ? "—"
                              : items.length === 1
                                ? (items[0].productName ?? "—")
                                : `${items[0].productName ?? "—"} +${items.length - 1} lainnya`}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {items.length === 0
                              ? "—"
                              : items.length === 1
                                ? (items[0].description ?? "—")
                                : `${items[0].description ?? "—"} +${items.length - 1} lainnya`}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {so.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{so.taxType ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateShort(so.date)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {so.value != null && so.value > 0
                              ? formatRupiahShort(so.value)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
