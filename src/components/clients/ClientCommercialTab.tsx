import { Package } from "lucide-react";

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
import type { CommercialItem } from "@/lib/domain";

export function ClientCommercialTab({
  clientCommercial,
}: {
  clientCommercial: CommercialItem[];
}) {
  return (
    <div className="mt-4">
      <Card>
        <CardContent className="p-4">
          <SectionTitle icon={Package} title="Commercial Items" />
          {clientCommercial.length === 0 ? (
            <EmptyState
              className="mt-3"
              description="Belum ada commercial item untuk klien ini."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Est. Value</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientCommercial.map((ci) => (
                    <TableRow key={ci.id}>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {ci.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium">
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
                      <TableCell className="text-muted-foreground">
                        {formatDateShort(ci.updatedAt)}
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
