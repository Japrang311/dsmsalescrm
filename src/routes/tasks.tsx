import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TaskStatusBadge } from "@/components/app/badges";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/lib/role-store";
import {
  tasks as allTasks,
  findClient,
  findUser,
  findCI,
  formatIDR,
  type Task,
  type FollowUpResult,
} from "@/lib/mock-data";
import { CheckCircle2, CalendarPlus, FileText, ArrowRight, Archive } from "lucide-react";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks · DSM Sales Execution" }] }),
  component: TasksPage,
});

const results: FollowUpResult[] = [
  "No Response",
  "Interested",
  "Need Quotation",
  "Quotation Sent",
  "Negotiation",
  "Waiting PO",
  "PO Confirmed",
  "Not Interested",
  "Follow-up Later",
];

function TasksPage() {
  const { role, user } = useRole();
  const [tab, setTab] = useState<"all" | "overdue" | "today" | "upcoming">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);

  const scope = role === "sales" ? allTasks.filter((t) => t.ownerId === user.id) : allTasks;

  const filtered = useMemo(() => {
    let list = scope;
    if (tab === "overdue") list = list.filter((t) => t.status === "Overdue");
    if (tab === "today")
      list = list.filter((t) => t.tanggalNextFU === new Date("2026-07-17").toISOString().slice(0, 10));
    if (tab === "upcoming") list = list.filter((t) => t.status === "Open");
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter(
        (t) =>
          findClient(t.clientId)?.name.toLowerCase().includes(ql) ||
          t.nextAction.toLowerCase().includes(ql),
      );
    }
    return list;
  }, [scope, tab, q]);

  return (
    <>
      <PageHeader
        title={role === "manager" ? "Team Tasks" : "My Tasks"}
        description="Customer follow-ups. Attach each task to a client and — when relevant — an active commercial item."
        actions={
          <Button size="sm">
            <CalendarPlus className="mr-1.5 h-4 w-4" /> New Follow-Up
          </Button>
        }
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="all">All ({scope.length})</TabsTrigger>
                <TabsTrigger value="overdue" className="text-destructive">
                  Overdue ({scope.filter((t) => t.status === "Overdue").length})
                </TabsTrigger>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="upcoming">Open</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search client or next action..."
              className="h-9 max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Next Action</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Hasil FU</TableHead>
                {role !== "sales" ? <TableHead>Sales</TableHead> : null}
                <TableHead>Tgl Next FU</TableHead>
                <TableHead>Potensi</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const c = findClient(t.clientId);
                return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(t)}
                  >
                    <TableCell className="font-medium">{c?.name}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{t.nextAction}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.metodeFU}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.hasilFU}</TableCell>
                    {role !== "sales" ? (
                      <TableCell className="text-xs">{findUser(t.ownerId)?.name}</TableCell>
                    ) : null}
                    <TableCell className="text-xs">{t.tanggalNextFU}</TableCell>
                    <TableCell className="text-xs">{formatIDR(t.potensiNilai)}</TableCell>
                    <TableCell>
                      <TaskStatusBadge status={t.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected ? <FollowUpForm task={selected} /> : null}
        </SheetContent>
      </Sheet>

    </>

  );
}

function FollowUpForm({ task }: { task: Task }) {
  const client = findClient(task.clientId);
  const ci = task.commercialItemId ? findCI(task.commercialItemId) : undefined;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{client?.name}</SheetTitle>
        <SheetDescription>
          {ci ? (
            <>
              Linked to <span className="font-medium">{ci.type}</span> · {ci.description} ·{" "}
              {formatIDR(ci.amount)}
            </>
          ) : (
            "General follow-up (no linked commercial item)."
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal FU">
            <Input type="date" defaultValue={task.tanggalFU} />
          </Field>
          <Field label="Metode FU">
            <Select defaultValue={task.metodeFU}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Phone", "Email", "Visit", "WhatsApp", "Meeting"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Hasil FU">
          <Select defaultValue={task.hasilFU}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {results.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Next Action">
          <Input defaultValue={task.nextAction} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Next FU">
            <Input type="date" defaultValue={task.tanggalNextFU} />
          </Field>
          <Field label="Status Customer">
            <Select defaultValue={task.statusCustomer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Prospect", "Active Customer", "Repeat Order", "Dormant", "Lost"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Potensi Nilai / Order">
          <Input defaultValue={task.potensiNilai.toLocaleString("id-ID")} />
        </Field>

        <Field label="Catatan">
          <Textarea rows={4} defaultValue={task.catatan} />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick actions
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm">
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark Done
            </Button>
            <Button variant="outline" size="sm">
              <CalendarPlus className="mr-1.5 h-4 w-4" /> Schedule Next FU
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="mr-1.5 h-4 w-4" /> Create Quotation Task
            </Button>
            <Button variant="outline" size="sm">
              <ArrowRight className="mr-1.5 h-4 w-4" /> Move to Waiting PO
            </Button>
            <Button variant="outline" size="sm" className="col-span-2 text-muted-foreground">
              <Archive className="mr-1.5 h-4 w-4" /> Archive
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline">Cancel</Button>
          <Button>Save Follow-Up</Button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
