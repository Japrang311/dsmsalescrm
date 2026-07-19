import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  FileText,
  Layers,
  Package,
  PhoneCall,
  ReceiptText,
  Sparkles,
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

import { useRole } from "@/context/role-context";
import {
  getClientById,
  listOwners,
  updateClientStatus,
} from "@/lib/data/clients";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { listFollowUpsForClient } from "@/lib/data/follow-ups";
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
import { NOW } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChangeStatusDialog } from "@/components/clients/ChangeStatusDialog";
import type { ClientStatus } from "@/lib/domain";

export const Route = createFileRoute("/_app/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client · DSM Sales Execution" }] }),
  component: ClientProfilePage,
});

// Sections below need tables that don't exist yet (commercial_items —
// Phase 4, sales_orders — Phase 5, follow-up/task history — no table
// planned yet). Shown as an honest "not connected yet" placeholder rather
// than fake/mock numbers mixed in with the real client record above.
function NotYetAvailable({ note }: { note: string }) {
  return (
    <div className="mt-3 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
      Belum terhubung ke data real — {note}
    </div>
  );
}

function ClientProfilePage() {
  const { clientId } = Route.useParams();
  const { role, authReady } = useRole();
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
  const { data: followUps = [] } = useQuery({
    queryKey: ["follow-ups", "client", clientId],
    queryFn: () => listFollowUpsForClient(clientId),
    enabled: authReady,
  });

  const [activeTab, setActiveTab] = useState("overview");
  const [pendingStatus, setPendingStatus] = useState<ClientStatus | null>(null);
  const canEditStatus =
    role === "sales" || role === "manager" || role === "super_admin";

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
                  client.spendingYtd > 0
                    ? formatRupiahShort(client.spendingYtd)
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
              value="—"
              icon={ReceiptText}
              hint="Butuh Sales Orders (Phase 5)"
            />
            <MetricCard
              label="PPN"
              value="—"
              icon={Layers}
              hint="Butuh Sales Orders (Phase 5)"
            />
            <MetricCard
              label="Non-PPN"
              value="—"
              icon={Layers}
              hint="Butuh Sales Orders (Phase 5)"
            />
            <MetricCard
              label="RFQ Pipeline"
              value="—"
              icon={FileText}
              hint="Butuh Commercial Items (Phase 4)"
            />
            <MetricCard
              label="Waiting PO"
              value="—"
              icon={Clock}
              hint="Butuh Commercial Items (Phase 4)"
            />
            <MetricCard
              label="Prototype Paid"
              value="—"
              icon={Sparkles}
              hint="Butuh Sales Orders (Phase 5)"
            />
            <MetricCard
              label="Prototype FOC"
              value="—"
              icon={Sparkles}
              hint="Butuh Sales Orders (Phase 5)"
            />
          </div>

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
                <NotYetAvailable note="menunggu migrasi Tasks (Phase 3)." />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={Calendar} title="Semua Tasks" />
              <NotYetAvailable note="menunggu migrasi Tasks (Phase 3)." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commercial" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={Package} title="Commercial Items" />
              <NotYetAvailable note="menunggu migrasi Commercial Items (Phase 4)." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotations" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={FileText} title="RFQ & Quotations" />
              <NotYetAvailable note="menunggu migrasi Commercial Items (Phase 4)." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={ReceiptText} title="Sales Orders" />
              <NotYetAvailable note="menunggu migrasi Sales Orders (Phase 5)." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <SectionTitle icon={ReceiptText} title="Revenue History" />
              <NotYetAvailable note="menunggu migrasi Sales Orders (Phase 5)." />
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
            actorName={ownerName}
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
