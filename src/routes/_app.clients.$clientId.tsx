import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Mail,
  Package,
  Pencil,
  Phone,
  PhoneCall,
  ReceiptText,
  Smartphone,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useRole } from "@/context/role-context";
import {
  getClientById,
  listOwners,
  updateClientStatus,
  listSalesTeamProfiles,
} from "@/lib/data/clients";
import { supabase } from "@/lib/supabase";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { listFollowUpsForClient } from "@/lib/data/follow-ups";
import { listSalesOrders } from "@/lib/data/sales-orders";
import { listCommercialItems } from "@/lib/data/commercial-items";
import { listTasks } from "@/lib/data/tasks";
import {
  clientRevenueMetrics,
  clientCommercialMetrics,
} from "@/lib/data/dashboard-selectors";
import { CLIENT_STATUSES } from "@/lib/business-rules";
import { formatDateShort, formatRupiahShort, daysBetween } from "@/lib/format";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { AddFollowUpDialog } from "@/components/clients/AddFollowUpDialog";
import {
  CreateRfqDialog,
  CreateQuotationDialog,
  CreateSalesOrderDialog,
  CreatePrototypeDialog,
} from "@/components/clients/CreateRecordDialogs";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { NOW, CURRENT_YEAR } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChangeStatusDialog } from "@/components/clients/ChangeStatusDialog";
import { ReassignOwnerDialog } from "@/components/clients/ReassignOwnerDialog";
import { EditClientInfoDialog } from "@/components/clients/EditClientInfoDialog";
import type { Client, ClientStatus } from "@/lib/domain";

export const Route = createFileRoute("/_app/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client · DSM Sales Execution" }] }),
  component: ClientProfilePage,
});

function ClientProfilePage() {
  const { clientId } = Route.useParams();
  const { role, authReady, authSource, realProfile } = useRole();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ["clients", "byId", clientId],
    queryFn: () => getClientById(clientId),
    enabled: authReady,
  });
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentActorId,
    enabled: authReady && authSource === "dev",
  });
  const { data: followUps = [] } = useQuery({
    queryKey: ["follow-ups", "client", clientId],
    queryFn: () => listFollowUpsForClient(clientId),
    enabled: authReady,
  });
  const { data: salesOrders = [] } = useQuery({
    queryKey: ["sales-orders", "all"],
    queryFn: listSalesOrders,
    enabled: authReady,
  });
  const { data: commercialItems = [] } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && (role === "manager" || role === "super_admin"),
  });

  const revenue = clientRevenueMetrics(salesOrders, clientId);
  const commercial = clientCommercialMetrics(commercialItems, clientId);

  // Per-client filtered data
  const clientOrders = salesOrders.filter((o) => o.clientId === clientId);
  const clientCommercial = commercialItems.filter(
    (i) => i.clientId === clientId,
  );
  const clientTasks = tasks.filter((t) => t.clientId === clientId);
  const upcomingActions = clientTasks.filter(
    (t) =>
      t.status === "Today" || t.status === "Overdue" || t.status === "Upcoming",
  );
  const clientRfqQuotations = clientCommercial.filter(
    (i) => i.type === "RFQ" || i.type === "Quotation",
  );

  const [activeTab, setActiveTab] = useState("overview");
  const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null);
  const [showReassign, setShowReassign] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const canEditStatus =
    role === "sales" || role === "manager" || role === "super_admin";
  const canReassign = role === "manager" || role === "super_admin";

  if (!authReady || isLoading) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Loading client…
      </div>
    );
  }

  if (!client) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Klien tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ID klien tidak dikenali. Kembali ke daftar klien.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/clients">Kembali</Link>
        </Button>
      </div>
    );
  }

  const ownerName = owners[client.ownerId]?.name ?? "—";
  // The logged-in actor, not the client's owner — a manager reassigning or
  // correcting someone else's client is never the same person as ownerName.
  const currentActorName =
    authSource === "real" && realProfile
      ? realProfile.name
      : ((currentUserId ? owners[currentUserId]?.name : undefined) ?? "—");
  const sharedDialogProps = {
    clientId: client.id,
    clientName: client.name,
    ownerId: client.ownerId,
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <div>
        <Link
          to="/clients"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Semua klien
        </Link>
      </div>

      {/* Compact header — real fields from the clients table */}
      <Card className="border-l-4 border-l-primary/70 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-foreground">
                  {client.name}
                </h1>
                <StatusBadge status={client.status} />
                <Badge variant="outline" className="text-[11px] font-normal">
                  {client.source}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sales: {ownerName}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="grid grid-cols-2 gap-3 text-right md:grid-cols-3">
              <MiniStat
                label="Spending YTD"
                value={
                  revenue.totalRevenue > 0
                    ? formatRupiahShort(revenue.totalRevenue)
                    : "Rp0"
                }
              />
              <MiniStat
                label="Last FU"
                value={client.lastFu ? formatDateShort(client.lastFu) : "—"}
              />
              <MiniStat
                label="Next FU"
                value={client.nextFu ? formatDateShort(client.nextFu) : "—"}
                tone={
                  client.nextFu && daysBetween(NOW, client.nextFu) < 0
                    ? "danger"
                    : "default"
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">Status:</Label>
              <Select
                value={client.status}
                disabled={!canEditStatus}
                onValueChange={(v) => {
                  const next = v as ClientStatus;
                  if (next === client.status) return;
                  setPendingStatus(next);
                }}
              >
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canReassign && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowReassign(true)}
                >
                  Reassign
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <AddFollowUpDialog
          {...sharedDialogProps}
          trigger={
            <Button size="sm">
              <PhoneCall className="h-4 w-4" /> Add Follow Up
            </Button>
          }
        />
        <CreateTaskDialog
          role={role}
          defaultClientId={client.id}
          trigger={
            <Button size="sm" variant="outline">
              <Calendar className="h-4 w-4" /> Create Task
            </Button>
          }
        />
        <CreateRfqDialog
          {...sharedDialogProps}
          onCreated={() => setActiveTab("quotations")}
          trigger={
            <Button size="sm" variant="outline">
              <FileText className="h-4 w-4" /> Add RFQ
            </Button>
          }
        />
        <CreateQuotationDialog
          {...sharedDialogProps}
          onCreated={() => setActiveTab("quotations")}
          trigger={
            <Button size="sm" variant="outline">
              <FileText className="h-4 w-4" /> Add Quotation
            </Button>
          }
        />
        <CreateSalesOrderDialog
          {...sharedDialogProps}
          onCreated={() => setActiveTab("orders")}
          trigger={
            <Button size="sm" variant="outline">
              <ReceiptText className="h-4 w-4" /> Record Sales Order
            </Button>
          }
        />
        <CreatePrototypeDialog
          {...sharedDialogProps}
          onCreated={() => setActiveTab("commercial")}
          trigger={
            <Button size="sm" variant="outline">
              <Sparkles className="h-4 w-4" /> Add Prototype Request
            </Button>
          }
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Follow-Up &amp; Tasks</TabsTrigger>
          <TabsTrigger value="commercial">Commercial Items</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="orders">Sales Orders</TabsTrigger>
          <TabsTrigger value="revenue">Revenue History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <MetricCard
              label="Total Revenue"
              value={formatRupiahShort(revenue.totalRevenue)}
              icon={ReceiptText}
              hint={`${CURRENT_YEAR}`}
            />
            <MetricCard
              label="PPN"
              value={revenue.ppn > 0 ? formatRupiahShort(revenue.ppn) : "—"}
              icon={Layers}
              hint={revenue.ppn > 0 ? "PPN" : "Belum ada PPN"}
            />
            <MetricCard
              label="Non-PPN"
              value={
                revenue.nonPpn > 0 ? formatRupiahShort(revenue.nonPpn) : "—"
              }
              icon={Layers}
              hint={revenue.nonPpn > 0 ? "Non-PPN" : "Belum ada Non-PPN"}
            />
            <MetricCard
              label="RFQ Pipeline"
              value={
                commercial.rfqPipeline > 0
                  ? formatRupiahShort(commercial.rfqPipeline)
                  : "—"
              }
              icon={FileText}
              hint={commercial.rfqPipeline > 0 ? "RFQ aktif" : "Belum ada RFQ"}
            />
            <MetricCard
              label="Commit"
              value={
                commercial.commit > 0
                  ? formatRupiahShort(commercial.commit)
                  : "—"
              }
              icon={Clock}
              hint={commercial.commit > 0 ? "Total Commit" : "Belum ada Commit"}
            />
            <MetricCard
              label="Prototype Paid"
              value={
                revenue.prototypePaid > 0
                  ? formatRupiahShort(revenue.prototypePaid)
                  : "—"
              }
              icon={Sparkles}
              hint={
                revenue.prototypePaid > 0
                  ? "Prototype berbayar"
                  : "Belum ada Prototype Paid"
              }
            />
            <MetricCard
              label="Prototype FOC"
              value={
                revenue.prototypeFocCount > 0
                  ? `${revenue.prototypeFocCount} unit`
                  : "—"
              }
              icon={Sparkles}
              hint={
                revenue.prototypeFocCount > 0
                  ? "Prototype FOC"
                  : "Belum ada Prototype FOC"
              }
            />
          </div>

          <ClientInfoCard
            client={client}
            canEdit={canEditStatus}
            onEdit={() => setShowEditInfo(true)}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <SectionTitle icon={Clock} title="Follow-up Timeline" />
                {followUps.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                    Belum ada follow-up tercatat.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {followUps.map((fu) => (
                      <li
                        key={fu.id}
                        className="rounded-md border bg-muted/30 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {fu.method} · {fu.result}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDateShort(fu.fuDate)}
                          </span>
                        </div>
                        {(fu.notes || fu.nextAction) && (
                          <p className="mt-1 text-muted-foreground">
                            {fu.notes || fu.nextAction}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground/80">
                          {owners[fu.ownerId]?.name ?? "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <SectionTitle icon={Calendar} title="Upcoming Actions" />
                {upcomingActions.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                    Tidak ada action mendatang.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {upcomingActions.slice(0, 5).map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs"
                      >
                        {t.status === "Overdue" ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.title}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            {t.method} · {formatDateShort(t.dueDate)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            t.status === "Overdue" ? "destructive" : "secondary"
                          }
                          className="shrink-0 text-[10px]"
                        >
                          {t.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={Calendar} title="Semua Tasks" />
              {clientTasks.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Belum ada task untuk klien ini.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientTasks.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">
                            {t.title}
                          </TableCell>
                          <TableCell>{t.method}</TableCell>
                          <TableCell>{formatDateShort(t.dueDate)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                t.status === "Overdue"
                                  ? "destructive"
                                  : t.status === "Done"
                                    ? "secondary"
                                    : "default"
                              }
                              className="text-[10px]"
                            >
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                t.priority === "High"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {t.priority}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commercial" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={Package} title="Commercial Items" />
              {clientCommercial.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Belum ada commercial item untuk klien ini.
                </p>
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
        </TabsContent>

        <TabsContent value="quotations" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={FileText} title="RFQ & Quotations" />
              {clientRfqQuotations.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Belum ada RFQ atau Quotation untuk klien ini.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right">Est. Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientRfqQuotations.map((ci) => (
                        <TableRow key={ci.id}>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {ci.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {ci.rfqNumber || ci.quotationNumber || "—"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={ReceiptText} title="Sales Orders" />
              {clientOrders.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Belum ada Sales Order untuk klien ini.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SO Number</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tax</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientOrders
                        .slice()
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((so) => (
                          <TableRow key={so.id}>
                            <TableCell className="font-medium">
                              {so.soNumber}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {so.type}
                              </Badge>
                            </TableCell>
                            <TableCell>{so.taxType ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateShort(so.date)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {so.value != null && so.value > 0
                                ? formatRupiahShort(so.value)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={ReceiptText} title="Revenue History" />
              {clientOrders.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                  Belum ada revenue tercatat untuk klien ini.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SO Number</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Tax</TableHead>
                        <TableHead>Prototype</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientOrders
                        .slice()
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((so) => (
                          <TableRow key={so.id}>
                            <TableCell className="font-medium">
                              {so.soNumber}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {so.source}
                            </TableCell>
                            <TableCell>{so.taxType ?? "—"}</TableCell>
                            <TableCell>
                              {so.type === "Prototype" && so.prototypeStatus ? (
                                <Badge
                                  variant={
                                    so.prototypeStatus === "Paid"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {so.prototypeStatus}
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDateShort(so.date)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {so.value != null && so.value > 0
                                ? formatRupiahShort(so.value)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {pendingStatus &&
        (role === "sales" || role === "manager" || role === "super_admin") && (
          <ChangeStatusDialog
            open={pendingStatus !== null}
            onOpenChange={(v) => {
              if (!v) setPendingStatus(null);
            }}
            clientName={client.name}
            from={client.status}
            to={pendingStatus}
            role={role}
            actorName={currentActorName}
            onConfirm={async (note) => {
              try {
                const fromStatus = client.status;
                await updateClientStatus(client.id, pendingStatus);
                const actorId = await getCurrentActorId();
                if (actorId) {
                  await logActivity({
                    kind: "client_status_change",
                    ownerId: client.ownerId,
                    actorId,
                    clientId: client.id,
                    title: `Status ${client.name} diubah ke ${pendingStatus}`,
                    detail: note
                      ? `${fromStatus} → ${pendingStatus}\n${note}`
                      : `${fromStatus} → ${pendingStatus}`,
                  });
                }
                await queryClient.invalidateQueries({ queryKey: ["clients"] });
                await queryClient.invalidateQueries({
                  queryKey: ["activity-log"],
                });
                toast.success(`Status diubah ke ${pendingStatus}`, {
                  description: "Perubahan disimpan ke database.",
                });
              } catch (error) {
                toast.error("Gagal mengubah status", {
                  description:
                    error instanceof Error ? error.message : "Unknown error",
                });
              }
              setPendingStatus(null);
              setActiveTab("overview");
            }}
          />
        )}

      {showReassign && canReassign && (
        <ReassignOwnerDialog
          open={showReassign}
          onOpenChange={setShowReassign}
          clientName={client.name}
          currentOwnerName={ownerName}
          teamMembers={teamMembers}
          role={role}
          actorName={currentActorName}
          onConfirm={async (newOwnerId, note) => {
            try {
              const oldOwnerName = ownerName;
              const { error: updateErr } = await supabase.rpc(
                "reassign_client_owner",
                {
                  p_client_id: client.id,
                  p_new_owner_id: newOwnerId,
                },
              );
              if (updateErr) throw updateErr;

              const newOwnerName =
                teamMembers.find((m) => m.id === newOwnerId)?.name ?? "—";

              try {
                const actorId = await getCurrentActorId();
                if (actorId) {
                  const { error: logErr } = await supabase
                    .from("activity_log")
                    .insert({
                      kind: "client_status_change",
                      owner_id: newOwnerId,
                      actor_id: actorId,
                      client_id: client.id,
                      title: `${client.name} direassign ke ${newOwnerName}`,
                      detail: note
                        ? `${oldOwnerName} → ${newOwnerName}\n${note}`
                        : `${oldOwnerName} → ${newOwnerName}`,
                    });
                  if (logErr) console.error("Activity log failed:", logErr);
                }
              } catch {
                // Non-blocking — activity log failure shouldn't block the reassign
              }

              await queryClient.invalidateQueries({ queryKey: ["clients"] });
              await queryClient.invalidateQueries({
                queryKey: ["profiles", "owners"],
              });
              await queryClient.invalidateQueries({
                queryKey: ["activity-log"],
              });
              toast.success(`Klien direassign ke ${newOwnerName}`, {
                description: "Perubahan disimpan ke database.",
              });
            } catch (error) {
              toast.error("Gagal reassign klien", {
                description:
                  error instanceof Error ? error.message : "Unknown error",
              });
            }
            setShowReassign(false);
          }}
        />
      )}

      <EditClientInfoDialog
        client={client}
        actorName={currentActorName}
        open={showEditInfo}
        onOpenChange={setShowEditInfo}
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "danger" ? "text-rose-600" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4 text-primary" /> {title}
    </div>
  );
}

function ClientInfoCard({
  client,
  canEdit,
  onEdit,
}: {
  client: Client;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const hasCompanyInfo =
    client.address || client.industry || client.website || client.notes;
  const filledContacts = client.contacts.filter(
    (c) => c.name || c.position || c.email || c.phone || c.mobile,
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Building2} title="Info Perusahaan & Kontak" />
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit Info
            </Button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid gap-2 text-xs">
            <InfoRow label="Alamat" value={client.address} />
            <InfoRow label="Bidang Usaha" value={client.industry} />
            <InfoRow label="Website" value={client.website} />
            <InfoRow label="Catatan" value={client.notes} />
            {!hasCompanyInfo && (
              <p className="text-muted-foreground">
                Belum ada info perusahaan.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            {filledContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Belum ada kontak person.
              </p>
            ) : (
              client.contacts.map((c, i) =>
                c.name || c.position || c.email || c.phone || c.mobile ? (
                  <div
                    key={i}
                    className="rounded-md border bg-muted/30 p-2.5 text-xs"
                  >
                    <p className="font-medium">
                      {c.name || `Kontak Person ${i + 1}`}
                    </p>
                    {c.position && (
                      <p className="text-muted-foreground">{c.position}</p>
                    )}
                    <div className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      {c.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" /> {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                      {c.mobile && (
                        <span className="flex items-center gap-1.5">
                          <Smartphone className="h-3 w-3" /> {c.mobile}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null,
              )
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
