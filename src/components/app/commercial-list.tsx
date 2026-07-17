import { PageHeader } from "@/components/app/page-header";
import { StageBadge } from "@/components/app/badges";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { commercialItems, findClient, findUser, formatIDR, type CommercialType } from "@/lib/mock-data";

export function CommercialList({
  title,
  description,
  types,
}: {
  title: string;
  description: string;
  types: CommercialType[];
}) {
  const rows = commercialItems.filter((c) => types.includes(c.type));
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference No</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Aging</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    {c.soNo ?? c.poNo ?? c.quotationNo}
                  </TableCell>
                  <TableCell className="font-medium">{findClient(c.clientId)?.name}</TableCell>
                  <TableCell className="text-sm">{c.description}</TableCell>
                  <TableCell className="text-xs">{c.type}</TableCell>
                  <TableCell>
                    <StageBadge stage={c.stage} />
                  </TableCell>
                  <TableCell className="text-sm">{findUser(c.ownerId)?.name}</TableCell>
                  <TableCell className="text-right font-medium">{formatIDR(c.amount)}</TableCell>
                  <TableCell className="text-xs">{c.agingDays}d</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
