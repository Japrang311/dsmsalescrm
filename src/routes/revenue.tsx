import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/app/page-header";
import { KpiCard } from "@/components/app/kpi-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  findClient,
  findUser,
  formatIDR,
  monthlyTargets,
  ppnBreakdown,
  revenue,
  ytdAchievement,
  ytdTarget,
} from "@/lib/mock-data";

export const Route = createFileRoute("/revenue")({
  head: () => ({ meta: [{ title: "Revenue · DSM Sales Execution" }] }),
  component: RevenuePage,
});

function RevenuePage() {
  const ytdAch = ytdAchievement();
  const ytdTgt = ytdTarget();
  const { ppn, non } = ppnBreakdown();
  const trend = monthlyTargets.map((m) => ({
    month: m.month.slice(5),
    Achievement: Math.round(m.achievement / 1_000_000),
    Target: Math.round(m.target / 1_000_000),
  }));

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Sales Order revenue rows, monthly achievement vs target, and PPN classification."
      />
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="YTD Achievement" value={formatIDR(ytdAch)} accent="primary" progress={ytdAch / ytdTgt} />
        <KpiCard label="YTD Target" value={formatIDR(ytdTgt)} accent="info" />
        <KpiCard label="Revenue PPN" value={formatIDR(ppn)} accent="teal" />
        <KpiCard label="Revenue Non-PPN" value={formatIDR(non)} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Achievement vs Target</CardTitle>
            <CardDescription>Values in Rp Juta.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Target" fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Achievement" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
            <CardDescription>Cumulative monthly achievement.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="Achievement"
                  stroke="var(--color-teal)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue Rows</CardTitle>
          <CardDescription>
            Sourced from SO 2026. Field names match the source Google Sheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>SO No</TableHead>
                <TableHead>PO No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>PPN</TableHead>
                <TableHead>Flow</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenue.slice(0, 40).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.month}</TableCell>
                  <TableCell className="text-xs">W{r.week}</TableCell>
                  <TableCell className="text-xs font-mono">{r.soNo}</TableCell>
                  <TableCell className="text-xs font-mono">{r.poNo}</TableCell>
                  <TableCell className="text-sm font-medium">{findClient(r.clientId)?.name}</TableCell>
                  <TableCell className="text-xs">{findUser(r.ownerId)?.name}</TableCell>
                  <TableCell className="text-sm">{r.description}</TableCell>
                  <TableCell className="text-right text-xs">{r.qty}</TableCell>
                  <TableCell className="text-right text-xs">{formatIDR(r.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium">{formatIDR(r.total)}</TableCell>
                  <TableCell className="text-xs">{r.ppn ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.flow}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
