import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
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
  commercialItems,
  formatIDR,
  monthlyTargets,
  salesPerformance,
  tasks,
  topCustomers,
} from "@/lib/mock-data";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports · DSM Sales Execution" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const funnelStages = [
    "RFQ Received",
    "Quotation in Progress",
    "Quotation Sent",
    "Waiting Client PO",
    "PO Received",
    "Sales Order Released",
  ];
  const funnelData = funnelStages.map((s, i) => ({
    name: s,
    value: commercialItems.filter((c) => c.stage === s).length,
    fill: [
      "var(--color-primary)",
      "var(--color-info)",
      "var(--color-teal)",
      "var(--color-warning)",
      "var(--color-success)",
      "var(--color-navy)",
    ][i],
  }));

  const trend = monthlyTargets.map((m) => ({
    month: m.month.slice(5),
    Achievement: Math.round(m.achievement / 1_000_000),
    Target: Math.round(m.target / 1_000_000),
  }));

  const perf = salesPerformance().filter((p) => p.user.role === "sales");
  const top = topCustomers(5);

  const totalActivity = tasks.length;
  const done = tasks.filter((t) => t.status === "Done").length;
  const overdue = tasks.filter((t) => t.status === "Overdue").length;

  return (
    <>
      <PageHeader
        title="Executive Reports"
        description="Company-wide performance, quotation funnel, top customers, and activity compliance."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quotation Funnel</CardTitle>
            <CardDescription>Count of active items at each stage.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer>
              <FunnelChart>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList
                    position="right"
                    fill="var(--color-foreground)"
                    stroke="none"
                    dataKey="name"
                    fontSize={11}
                  />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Achievement vs Target (Monthly)</CardTitle>
            <CardDescription>Values in Rp Juta.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
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
                <Bar dataKey="Target" fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Achievement" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sales Performance Comparison</CardTitle>
            <CardDescription>YTD revenue, open tasks, and activity by sales.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Revenue YTD</TableHead>
                  <TableHead className="text-right">Open Tasks</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Active Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.map((p) => (
                  <TableRow key={p.user.id}>
                    <TableCell className="font-medium">{p.user.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatIDR(p.revenue)}
                    </TableCell>
                    <TableCell className="text-right">{p.openTasks}</TableCell>
                    <TableCell className="text-right text-destructive">{p.overdue}</TableCell>
                    <TableCell className="text-right">{p.activeCI}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 Customers YTD</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top.map((t, i) => (
              <div
                key={t.client.id}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <span className="text-sm font-medium truncate">
                  {i + 1}. {t.client.name}
                </span>
                <span className="text-sm text-primary font-semibold">{formatIDR(t.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Compliance Summary</CardTitle>
          <CardDescription>Follow-up activity across the team.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Metric label="Total Activities" value={totalActivity} />
          <Metric label="Completed" value={done} accent="text-success" />
          <Metric label="Overdue" value={overdue} accent="text-destructive" />
          <Metric
            label="Completion %"
            value={`${Math.round((done / totalActivity) * 100)}%`}
            accent="text-primary"
          />
        </CardContent>
      </Card>
    </>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
