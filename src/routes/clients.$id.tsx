import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge, StageBadge } from "@/components/app/badges";
import { KpiCard } from "@/components/app/kpi-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  clients,
  commercialItems,
  findUser,
  formatIDR,
  revenue,
  tasks,
} from "@/lib/mock-data";
import { CalendarPlus, ArrowLeft, MapPin, Building2 } from "lucide-react";

export const Route = createFileRoute("/clients/$id")({
  head: ({ params }) => {
    const c = clients.find((x) => x.id === params.id);
    return { meta: [{ title: c ? `${c.name} · Clients` : "Client not found" }] };
  },
  loader: ({ params }) => {
    const c = clients.find((x) => x.id === params.id);
    if (!c) throw notFound();
    return { client: c };
  },
  component: ClientProfile,
});

function ClientProfile() {
  const { client } = Route.useLoaderData();
  const owner = findUser(client.ownerId);
  const items = commercialItems.filter((c) => c.clientId === client.id);
  const active = items.filter(
    (c) => !["Revenue Recorded", "Closed Lost"].includes(c.stage),
  );
  const clientTasks = tasks.filter((t) => t.clientId === client.id);
  const clientRevenue = revenue.filter((r) => r.clientId === client.id);

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <span className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {client.industry}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {client.city}
            </span>
            <StatusBadge status={client.status} />
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/clients">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Link>
            </Button>
            <Button size="sm">
              <CalendarPlus className="mr-1.5 h-4 w-4" /> Log Follow-Up
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="flex items-center gap-3 p-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-navy text-navy-foreground text-sm font-semibold">
              {owner?.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Sales Owner
            </p>
            <p className="text-sm font-medium truncate">{owner?.name}</p>
          </div>
        </Card>
        <KpiCard label="Spending YTD" value={formatIDR(client.spendingYTD)} accent="primary" />
        <KpiCard label="Revenue PPN" value={formatIDR(client.revenuePPN)} accent="info" />
        <KpiCard label="Revenue Non-PPN" value={formatIDR(client.revenueNonPPN)} accent="teal" />
        <KpiCard
          label="Next Follow-Up"
          value={client.nextFU}
          hint={`Last FU: ${client.lastFU}`}
          accent="warning"
        />
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Active Commercial Items ({active.length})</TabsTrigger>
          <TabsTrigger value="timeline">Follow-Up Timeline ({clientTasks.length})</TabsTrigger>
          <TabsTrigger value="revenue">Revenue ({clientRevenue.length})</TabsTrigger>
          <TabsTrigger value="all">All Items ({items.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Flow</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Next FU</TableHead>
                    <TableHead>Aging</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.type}</TableCell>
                      <TableCell className="text-sm">{c.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.flow}</TableCell>
                      <TableCell>
                        <StageBadge stage={c.stage} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIDR(c.amount)}
                      </TableCell>
                      <TableCell className="text-xs">{c.nextFUDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.agingDays}d
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Follow-Up History</CardTitle>
              <CardDescription>All logged customer interactions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {clientTasks.map((t) => (
                <div key={t.id} className="flex gap-3 border-l-2 border-primary/40 pl-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{t.nextAction}</p>
                      <span className="text-xs text-muted-foreground">{t.tanggalFU}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.metodeFU} · Hasil: <span className="font-medium">{t.hasilFU}</span> · Next
                      FU: {t.tanggalNextFU}
                    </p>
                    <p className="mt-1 text-xs">{t.catatan}</p>
                  </div>
                </div>
              ))}
              {clientTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-ups logged yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>SO No</TableHead>
                    <TableHead>PO No</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>PPN</TableHead>
                    <TableHead>Flow</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientRevenue.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.month}</TableCell>
                      <TableCell className="text-xs font-mono">{r.soNo}</TableCell>
                      <TableCell className="text-xs font-mono">{r.poNo}</TableCell>
                      <TableCell className="text-sm">{r.description}</TableCell>
                      <TableCell className="text-right text-xs">{r.qty}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIDR(r.total)}
                      </TableCell>
                      <TableCell className="text-xs">{r.ppn ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.flow}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Quotation No</TableHead>
                    <TableHead>PO No</TableHead>
                    <TableHead>SO No</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.type}</TableCell>
                      <TableCell className="text-sm">{c.description}</TableCell>
                      <TableCell>
                        <StageBadge stage={c.stage} />
                      </TableCell>
                      <TableCell className="text-xs font-mono">{c.quotationNo ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{c.poNo ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{c.soNo ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIDR(c.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
