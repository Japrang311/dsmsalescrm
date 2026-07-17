import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TrendingUp,
  Target,
  AlertTriangle,
  ListChecks,
  Users,
  Receipt,
  Percent,
  Clock,
} from "lucide-react";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, StageBadge, TaskStatusBadge } from "@/components/app/badges";
import { useRole } from "@/lib/role-store";
import {
  clients,
  commercialItems,
  formatIDR,
  monthlyTargets,
  ppnBreakdown,
  revenue,
  salesPerformance,
  tasks,
  topCustomers,
  ytdAchievement,
  ytdTarget,
  findClient,
  findUser,
} from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Dashboard · DSM Sales Execution" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { role, user } = useRole();
  const ownerFilter = role === "sales" ? user.id : undefined;

  const ytdAch = ytdAchievement(ownerFilter);
  const ytdTgt = role === "sales" ? ytdTarget() * 0.25 : ytdTarget();
  const currentMonth = monthlyTargets[monthlyTargets.length - 1];
  const monthAch = role === "sales" ? currentMonth.achievement * 0.25 : currentMonth.achievement;
  const monthTgt = role === "sales" ? currentMonth.target * 0.25 : currentMonth.target;

  const { ppn, non } = ppnBreakdown(ownerFilter);

  const scopedTasks = ownerFilter ? tasks.filter((t) => t.ownerId === ownerFilter) : tasks;
  const openTasks = scopedTasks.filter((t) => t.status === "Open").length;
  const overdue = scopedTasks.filter((t) => t.status === "Overdue").length;

  const scopedCI = ownerFilter
    ? commercialItems.filter((c) => c.ownerId === ownerFilter)
    : commercialItems;
  const activeCI = scopedCI.filter(
    (c) => !["Revenue Recorded", "Closed Lost"].includes(c.stage),
  ).length;
  const waitingPO = scopedCI
    .filter((c) => c.stage === "Waiting Client PO" || c.stage === "PO Received")
    .reduce((s, c) => s + c.amount, 0);

  const scopedClients = ownerFilter ? clients.filter((c) => c.ownerId === ownerFilter) : clients;

  const trendData = monthlyTargets.map((m) => ({
    month: m.month.slice(5),
    Achievement: Math.round((role === "sales" ? m.achievement * 0.25 : m.achievement) / 1_000_000),
    Target: Math.round((role === "sales" ? m.target * 0.25 : m.target) / 1_000_000),
  }));

  let cumT = 0;
  let cumA = 0;
  const ytdData = monthlyTargets.map((m) => {
    const t = role === "sales" ? m.target * 0.25 : m.target;
    const a = role === "sales" ? m.achievement * 0.25 : m.achievement;
    cumT += t;
    cumA += a;
    return {
      month: m.month.slice(5),
      "Target YTD": Math.round(cumT / 1_000_000),
      "Achievement YTD": Math.round(cumA / 1_000_000),
    };
  });
  const ytdPct = ytdTgt > 0 ? Math.round((ytdAch / ytdTgt) * 100) : 0;

  const [ytdMode, setYtdMode] = useState<"total" | "customer" | "product">("total");

  const SEGMENT_COLORS = [
    "var(--color-primary)",
    "var(--color-teal)",
    "var(--color-info)",
    "var(--color-success)",
    "var(--color-warning)",
  ];
  const OTHERS_COLOR = "var(--color-muted-foreground)";

  const { breakdownData, segments } = useMemo(() => {
    if (ytdMode === "total") {
      return { breakdownData: [] as Array<Record<string, number | string>>, segments: [] as Array<{ key: string; color: string }> };
    }
    const scopedRev = ownerFilter ? revenue.filter((r) => r.ownerId === ownerFilter) : revenue;
    const keyOf = (r: (typeof revenue)[number]) =>
      ytdMode === "customer" ? findClient(r.clientId)?.name ?? "Unknown" : r.description;

    const totals = new Map<string, number>();
    for (const r of scopedRev) {
      totals.set(keyOf(r), (totals.get(keyOf(r)) ?? 0) + r.total);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const topKeys = sorted.slice(0, 5).map(([k]) => k);
    const othersKeys = new Set(sorted.slice(5).map(([k]) => k));
    const hasOthers = sorted.slice(5).some(([, v]) => v > 0);

    const segs: Array<{ key: string; color: string }> = topKeys.map((k, i) => ({
      key: k,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    }));
    if (hasOthers) segs.push({ key: "Others", color: OTHERS_COLOR });

    const cum = new Map<string, number>(segs.map((s) => [s.key, 0]));
    let cTgt = 0;
    const data = monthlyTargets.map((m) => {
      const t = role === "sales" ? m.target * 0.25 : m.target;
      cTgt += t;
      const monthRev = scopedRev.filter((r) => r.month === m.month);
      for (const r of monthRev) {
        const k = keyOf(r);
        const bucket = othersKeys.has(k) ? "Others" : k;
        if (!cum.has(bucket)) continue;
        cum.set(bucket, (cum.get(bucket) ?? 0) + r.total);
      }
      const row: Record<string, number | string> = {
        month: m.month.slice(5),
        "Target YTD": Math.round(cTgt / 1_000_000),
      };
      for (const s of segs) row[s.key] = Math.round((cum.get(s.key) ?? 0) / 1_000_000);
      return row;
    });
    return { breakdownData: data, segments: segs };
  }, [ytdMode, ownerFilter, role]);


  const ppnData = [
    { name: "PPN", value: ppn },
    { name: "Non-PPN", value: non },
  ];
  const PPN_COLORS = ["var(--color-primary)", "var(--color-teal)"];

  const titleByRole =
    role === "executive"
      ? "Executive Dashboard"
      : role === "manager"
        ? "Team Dashboard"
        : "My Dashboard";
  const descByRole =
    role === "executive"
      ? "Company-wide performance, YTD achievement, pipeline health, and risk alerts."
      : role === "manager"
        ? "Team and company performance across sales, pipeline, and revenue."
        : `Your active clients, follow-ups, and revenue contribution — as of today.`;

  return (
    <>
      <PageHeader
        title={titleByRole}
        description={descByRole}
        actions={
          <Badge variant="outline" className="font-normal">
            Period: FY 2026 · YTD
          </Badge>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Achievement YTD"
          value={formatIDR(ytdAch)}
          hint={`vs Target YTD ${formatIDR(ytdTgt)}`}
          icon={<Target className="h-5 w-5" />}
          accent="primary"
          progress={ytdAch / ytdTgt}
        />
        <KpiCard
          label={`Bulan ${currentMonth.month.slice(5)}`}
          value={formatIDR(monthAch)}
          hint={`Monthly Target ${formatIDR(monthTgt)}`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="teal"
          progress={monthAch / monthTgt}
        />
        <KpiCard
          label="Revenue PPN vs Non-PPN"
          value={
            <span className="text-xl">
              {formatIDR(ppn)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {formatIDR(non)}
              </span>
            </span>
          }
          hint={`Total ${formatIDR(ppn + non)}`}
          icon={<Percent className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          label="Waiting PO Value"
          value={formatIDR(waitingPO)}
          hint={`${scopedCI.filter((c) => c.stage === "Waiting Client PO").length} items awaiting client PO`}
          icon={<Receipt className="h-5 w-5" />}
          accent="warning"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Open Tasks"
          value={openTasks}
          icon={<ListChecks className="h-5 w-5" />}
          accent="info"
        />
        <KpiCard
          label="Overdue FU"
          value={overdue}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="destructive"
        />
        <KpiCard
          label="Active Commercial Items"
          value={activeCI}
          icon={<Clock className="h-5 w-5" />}
          accent="teal"
        />
        <KpiCard
          label={role === "sales" ? "My Active Clients" : "Active Clients"}
          value={scopedClients.filter((c) => c.status !== "Lost" && c.status !== "Dormant").length}
          icon={<Users className="h-5 w-5" />}
          accent="success"
        />
      </div>

      {/* YTD cumulative chart */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Target YTD vs Achievement YTD</CardTitle>
            <CardDescription>
              Kumulatif per bulan (Rp Juta)
              {ytdMode === "customer" ? " · breakdown per customer" : ytdMode === "product" ? " · breakdown per produk" : ""}.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              size="sm"
              value={ytdMode}
              onValueChange={(v) => v && setYtdMode(v as typeof ytdMode)}
              className="border border-border rounded-md"
            >
              <ToggleGroupItem value="total" className="text-xs px-2">Total</ToggleGroupItem>
              <ToggleGroupItem value="customer" className="text-xs px-2">Per Customer</ToggleGroupItem>
              <ToggleGroupItem value="product" className="text-xs px-2">Per Produk</ToggleGroupItem>
            </ToggleGroup>
            <div className="text-right text-xs text-muted-foreground">
              <div>
                <span className="font-semibold text-primary">{formatIDR(ytdAch)}</span>
                <span> / {formatIDR(ytdTgt)}</span>
              </div>
              <div className="mt-0.5">Achievement {ytdPct}%</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {ytdMode === "total" ? (
              <AreaChart data={ytdData}>
                <defs>
                  <linearGradient id="ytdTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-muted-foreground)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-muted-foreground)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="ytdAch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v: number) => `Rp ${v.toLocaleString("id-ID")} Jt`}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="Target YTD"
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  fill="url(#ytdTarget)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="Achievement YTD"
                  stroke="var(--color-primary)"
                  fill="url(#ytdAch)"
                  strokeWidth={2}
                />
              </AreaChart>
            ) : (
              <ComposedChart data={breakdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v: number) => `Rp ${v.toLocaleString("id-ID")} Jt`}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {segments.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stackId="ach"
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.5}
                    strokeWidth={1}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="Target YTD"
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>


      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Achievement vs Target</CardTitle>
            <CardDescription>Values in Rp Juta (millions).</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
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
            <CardTitle className="text-base">PPN vs Non-PPN Breakdown</CardTitle>
            <CardDescription>YTD revenue composition.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ppnData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {ppnData.map((_, i) => (
                    <Cell key={i} fill={PPN_COLORS[i]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number) => formatIDR(v)}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {role === "sales" ? <MyTasksCard /> : <TeamPerformanceCard />}
        <TopCustomersCard />
        <PipelineActivityCard scopedItems={scopedCI} />
      </div>

      {role === "executive" ? <RiskAlerts /> : null}
    </>
  );
}

function MyTasksCard() {
  const { user } = useRole();
  const my = tasks
    .filter((t) => t.ownerId === user.id && t.status !== "Done" && t.status !== "Archived")
    .slice(0, 6);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Today's Priorities</CardTitle>
          <CardDescription>Overdue and upcoming follow-ups.</CardDescription>
        </div>
        <Link to="/tasks" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {my.map((t) => {
          const client = findClient(t.clientId);
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{client?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t.nextAction}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <TaskStatusBadge status={t.status} />
                <span className="text-[10px] text-muted-foreground">{t.tanggalNextFU}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TeamPerformanceCard() {
  const perf = salesPerformance().filter((p) => p.user.role === "sales");
  const max = Math.max(...perf.map((p) => p.revenue), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sales Performance Comparison</CardTitle>
        <CardDescription>YTD revenue by sales owner.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {perf.map((p) => (
          <div key={p.user.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{p.user.name}</span>
              <span className="text-muted-foreground">{formatIDR(p.revenue)}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${(p.revenue / max) * 100}%` }}
              />
            </div>
            <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
              <span>{p.openTasks} open</span>
              <span className="text-destructive">{p.overdue} overdue</span>
              <span>{p.activeCI} active items</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TopCustomersCard() {
  const top = topCustomers(5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top 5 Customers YTD</CardTitle>
        <CardDescription>Revenue contribution.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.map((row, i) => (
          <div
            key={row.client.id}
            className="flex items-center justify-between rounded-md border border-border p-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-navy text-navy-foreground text-xs font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.client.name}</p>
                <p className="text-[10px] text-muted-foreground">{row.client.industry}</p>
              </div>
            </div>
            <span className="text-sm font-medium text-primary">{formatIDR(row.total)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PipelineActivityCard({
  scopedItems,
}: {
  scopedItems: typeof commercialItems;
}) {
  const stages = [
    "RFQ Received",
    "Quotation in Progress",
    "Quotation Sent",
    "Waiting Client PO",
    "PO Received",
  ] as const;
  const counts = stages.map((s) => ({
    stage: s,
    count: scopedItems.filter((c) => c.stage === s).length,
    value: scopedItems.filter((c) => c.stage === s).reduce((sum, c) => sum + c.amount, 0),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quotation Funnel</CardTitle>
        <CardDescription>Active pipeline by stage.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {counts.map((c) => (
          <div key={c.stage} className="rounded-md border border-border p-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{c.stage}</span>
              <span className="text-muted-foreground">
                {c.count} · {formatIDR(c.value)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RiskAlerts() {
  const overdue = tasks.filter((t) => t.status === "Overdue").slice(0, 3);
  const bigPending = commercialItems
    .filter((c) => c.stage === "Waiting Client PO" && c.amount > 300_000_000)
    .slice(0, 3);
  const dormantHV = clients
    .filter((c) => c.status === "Dormant" || (c.status === "Lost" && c.spendingYTD === 0))
    .slice(0, 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Risk Alerts
        </CardTitle>
        <CardDescription>Items requiring executive attention.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
            Overdue Follow-ups
          </p>
          <div className="space-y-1.5">
            {overdue.map((t) => (
              <div key={t.id} className="text-xs">
                <span className="font-medium">{findClient(t.clientId)?.name}</span>{" "}
                <span className="text-muted-foreground">— {findUser(t.ownerId)?.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
            Large Pending PO
          </p>
          <div className="space-y-1.5">
            {bigPending.map((c) => (
              <div key={c.id} className="text-xs">
                <span className="font-medium">{findClient(c.clientId)?.name}</span>{" "}
                <span className="text-primary">{formatIDR(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-info">
            Dormant / High-Value Clients
          </p>
          <div className="space-y-1.5">
            {dormantHV.map((c) => (
              <div key={c.id} className="text-xs flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// silence unused
void StageBadge;
