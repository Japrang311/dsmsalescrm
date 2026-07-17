import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StageBadge } from "@/components/app/badges";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  commercialItems,
  findClient,
  findUser,
  formatIDR,
  type NewRfqStage,
  type RepeatStage,
} from "@/lib/mock-data";
import { KanbanSquare, Table as TableIcon } from "lucide-react";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Commercial Pipeline · DSM" }] }),
  component: PipelinePage,
});

const newRfqStages: NewRfqStage[] = [
  "RFQ Received",
  "Quotation in Progress",
  "Quotation Sent",
  "Waiting Client PO",
  "PO Received",
  "Sales Order Released",
  "Revenue Recorded",
  "Closed Lost",
];

const repeatStages: RepeatStage[] = [
  "Timeplan/Price Update Requested",
  "Waiting Client PO",
  "PO Received",
  "Sales Order Released",
  "Revenue Recorded",
];

function PipelinePage() {
  const [view, setView] = useState<"board" | "table">("board");
  const [flow, setFlow] = useState<"new" | "repeat">("new");

  const stages = flow === "new" ? newRfqStages : repeatStages;
  const items = commercialItems.filter((c) =>
    flow === "new" ? c.flow === "New RFQ" : c.flow === "Repeat Order",
  );

  return (
    <>
      <PageHeader
        title="Commercial Pipeline"
        description="Track RFQ, quotation, PO, and Sales Order across the two DSM commercial flows."
        actions={
          <div className="flex gap-2">
            <Tabs value={flow} onValueChange={(v) => setFlow(v as typeof flow)}>
              <TabsList>
                <TabsTrigger value="new">New RFQ Flow</TabsTrigger>
                <TabsTrigger value="repeat">Repeat Order Flow</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex overflow-hidden rounded-md border border-border">
              <Button
                size="sm"
                variant={view === "board" ? "default" : "ghost"}
                className="rounded-none"
                onClick={() => setView("board")}
              >
                <KanbanSquare className="mr-1.5 h-4 w-4" /> Board
              </Button>
              <Button
                size="sm"
                variant={view === "table" ? "default" : "ghost"}
                className="rounded-none"
                onClick={() => setView("table")}
              >
                <TableIcon className="mr-1.5 h-4 w-4" /> Table
              </Button>
            </div>
          </div>
        }
      />
      

      {view === "board" ? (
        <div className="overflow-x-auto">
          <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 pb-2">
            {stages.map((stage) => {
              const stageItems = items.filter((c) => c.stage === stage);
              const total = stageItems.reduce((s, c) => s + c.amount, 0);
              return (
                <div
                  key={stage}
                  className="flex flex-col rounded-lg border border-border bg-muted/30"
                >
                  <div className="border-b border-border p-3">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>{stage}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {stageItems.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatIDR(total)}</p>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {stageItems.map((c) => {
                      const client = findClient(c.clientId);
                      const owner = findUser(c.ownerId);
                      return (
                        <div
                          key={c.id}
                          className="rounded-md border border-border bg-card p-2.5 shadow-sm hover:border-primary/40"
                        >
                          <p className="text-sm font-medium leading-tight truncate">
                            {client?.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">
                            {c.description}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-primary">
                              {formatIDR(c.amount)}
                            </span>
                            <span className="text-muted-foreground">{owner?.initials}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Next: {c.nextFUDate}</span>
                            <span>Aging {c.agingDays}d</span>
                          </div>
                        </div>
                      );
                    })}
                    {stageItems.length === 0 ? (
                      <p className="p-2 text-xs italic text-muted-foreground">No items</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Next FU</TableHead>
                  <TableHead>Aging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{findClient(c.clientId)?.name}</TableCell>
                    <TableCell className="text-sm">{c.description}</TableCell>
                    <TableCell className="text-xs">{c.type}</TableCell>
                    <TableCell>
                      <StageBadge stage={c.stage} />
                    </TableCell>
                    <TableCell className="text-sm">{findUser(c.ownerId)?.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatIDR(c.amount)}
                    </TableCell>
                    <TableCell className="text-xs">{c.nextFUDate}</TableCell>
                    <TableCell className="text-xs">{c.agingDays}d</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
