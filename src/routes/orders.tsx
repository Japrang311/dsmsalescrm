import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { salesOrders, findClient, findUser, formatIDR } from "@/lib/mock-data";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Sales Order · DSM" }] }),
  component: OrdersPage,
});

const today = new Date("2026-07-17");

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(iso: string) {
  const d = new Date(iso);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Sales Order"
        description="Released Sales Orders — the immediate precursor to revenue."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO No</TableHead>
                <TableHead>PO No</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>PO Release</TableHead>
                <TableHead>Target Kirim</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesOrders.map((so) => {
                const remaining = daysUntil(so.expectedDeliveryDate);
                const overdue = remaining < 0;
                return (
                  <Fragment key={so.id}>
                    <TableRow className="bg-muted/40 hover:bg-muted/50">
                      <TableCell className="font-mono text-xs font-semibold">
                        {so.soNo}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{so.poNo}</TableCell>
                      <TableCell className="font-medium">
                        {findClient(so.clientId)?.name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {findUser(so.ownerId)?.name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(so.poReleaseDate)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          <span>{formatDate(so.expectedDeliveryDate)}</span>
                          <span
                            className={
                              overdue
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {overdue
                              ? `${Math.abs(remaining)}d overdue`
                              : `${remaining}d left`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        colSpan={2}
                        className="text-right text-xs text-muted-foreground"
                      >
                        {so.lines.length} item{so.lines.length > 1 ? "s" : ""} · Total
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatIDR(so.totalAmount)}
                      </TableCell>
                    </TableRow>
                    {so.lines.map((l) => (
                      <TableRow key={l.id} className="hover:bg-muted/20">
                        <TableCell />
                        <TableCell />
                        <TableCell
                          colSpan={4}
                          className="pl-8 text-sm text-muted-foreground"
                        >
                          • {l.description}
                        </TableCell>
                        <TableCell className="text-right text-xs">{l.qty}</TableCell>
                        <TableCell className="text-right text-xs">
                          {formatIDR(l.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatIDR(l.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
