import { FileText } from "lucide-react";

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
import { formatRupiahShort } from "@/lib/format";
import type { CommercialItem } from "@/lib/domain";

export function ClientQuotationsTab({
  clientQuotations,
}: {
  clientQuotations: CommercialItem[];
}) {
  return (
    <div className="mt-4">
      <Card>
        <CardContent className="p-4">
          <SectionTitle icon={FileText} title="Quotations" />
          {clientQuotations.length === 0 ? (
            <EmptyState
              className="mt-3"
              description="Belum ada Quotation untuk klien ini."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Nama Product</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Est. Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientQuotations.map((ci) => {
                    const items = ci.lineItems ?? [];
                    return (
                      <TableRow key={ci.id}>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {ci.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {ci.quotationNumber ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {items.length === 0
                            ? "—"
                            : items.length === 1
                              ? (items[0].productName ?? "—")
                              : `${items[0].productName ?? "—"} +${items.length - 1} lainnya`}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {ci.description || ci.projectName || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {ci.stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ci.estimatedValue > 0
                            ? formatRupiahShort(ci.estimatedValue)
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
