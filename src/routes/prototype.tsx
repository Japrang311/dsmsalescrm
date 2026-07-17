import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prototypes, findClient, findUser, formatIDR } from "@/lib/mock-data";

export const Route = createFileRoute("/prototype")({
  head: () => ({ meta: [{ title: "Prototype · DSM" }] }),
  component: PrototypePage,
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

function todayISO() {
  return today.toISOString().slice(0, 10);
}

function PrototypePage() {
  const [delivered, setDelivered] = useState<Record<string, string>>({});

  const markDelivered = (id: string) =>
    setDelivered((prev) => ({ ...prev, [id]: todayISO() }));

  return (
    <>
      <PageHeader
        title="Prototype"
        description="Pengiriman prototype ke customer. Nilai opsional — bila diisi akan masuk ke Revenue."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prototype No</TableHead>
                <TableHead>Ref No</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Target Kirim / Delivered</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prototypes.map((pt) => {
                const deliveredAt = delivered[pt.id];
                const isDone = Boolean(deliveredAt);
                const remaining = daysUntil(pt.expectedDeliveryDate);
                const overdue = remaining < 0;
                return (
                  <Fragment key={pt.id}>
                    <TableRow className="bg-muted/40 hover:bg-muted/50">
                      <TableCell className="font-mono text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          {pt.protoNo}
                          {pt.chargeable ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Chargeable
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Free sample
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {pt.refNo ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {findClient(pt.clientId)?.name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {findUser(pt.ownerId)?.name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(pt.releaseDate)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {isDone ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-emerald-600">
                              Delivered to customer
                            </span>
                            <span className="text-muted-foreground">
                              {formatDate(deliveredAt!)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span>{formatDate(pt.expectedDeliveryDate)}</span>
                            <span
                              className={
                                overdue ? "text-destructive" : "text-muted-foreground"
                              }
                            >
                              {overdue
                                ? `${Math.abs(remaining)}d overdue`
                                : `${remaining}d left`}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        colSpan={2}
                        className="text-right text-xs text-muted-foreground"
                      >
                        {pt.lines.length} item{pt.lines.length > 1 ? "s" : ""} · Total
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {pt.chargeable ? formatIDR(pt.totalAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <Check className="h-3.5 w-3.5" /> Selesai
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markDelivered(pt.id)}
                          >
                            Selesai
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {pt.lines.map((l) => (
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
                          {l.unitPrice ? formatIDR(l.unitPrice) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {l.total ? formatIDR(l.total) : "—"}
                        </TableCell>
                        <TableCell />
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
