import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/utils";

import { useRole } from "@/context/role-context-core";
import {
  getClientById,
  listOwners,
  updateClientStatus,
  listSalesTeamProfiles,
  reassignClientOwner,
} from "@/lib/data/clients";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { listFollowUpsForClient } from "@/lib/data/follow-ups";
import { listSalesOrders } from "@/lib/data/sales-orders";
import { listCommercialItems } from "@/lib/data/commercial-items";
import { listTasks } from "@/lib/data/tasks";
import {
  activeClientTasks,
  clientRelatedTasks,
} from "@/lib/data/task-relations";
import {
  clientRevenueMetrics,
  clientCommercialMetrics,
} from "@/lib/data/dashboard-selectors";
import { ChangeStatusDialog } from "@/components/clients/ChangeStatusDialog";
import { ReassignOwnerDialog } from "@/components/clients/ReassignOwnerDialog";
import { EditClientInfoDialog } from "@/components/clients/EditClientInfoDialog";
import { ClientHeaderCard } from "@/components/clients/ClientHeaderCard";
import { ClientOverviewTab } from "@/components/clients/ClientOverviewTab";
import { ClientTasksTab } from "@/components/clients/ClientTasksTab";
import { ClientCommercialTab } from "@/components/clients/ClientCommercialTab";
import { ClientQuotationsTab } from "@/components/clients/ClientQuotationsTab";
import { ClientOrdersTab } from "@/components/clients/ClientOrdersTab";
import { ClientRevenueTab } from "@/components/clients/ClientRevenueTab";
import { useState } from "react";
import type { ClientStatus } from "@/lib/domain";

export const Route = createFileRoute("/_app/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client · DSM Sales Execution" }] }),
  component: ClientProfilePage,
});

function ClientProfilePage() {
  const { clientId } = Route.useParams();
  const { role, authReady, realProfile } = useRole();
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
  const clientTasks = clientRelatedTasks(tasks, clientId);
  const upcomingActions = activeClientTasks(tasks, clientId);
  const clientQuotations = clientCommercial.filter(
    (i) => i.type === "Quotation",
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
  const currentActorName = realProfile?.name ?? "—";

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

      <ClientHeaderCard
        client={client}
        ownerName={ownerName}
        revenue={revenue}
        role={role}
        canEditStatus={canEditStatus}
        canReassign={canReassign}
        setActiveTab={setActiveTab}
        onStatusChangeRequested={setPendingStatus}
        onReassignRequested={() => setShowReassign(true)}
        onEditInfoRequested={() => setShowEditInfo(true)}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full max-w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1">
          <TabsTrigger value="overview" className="shrink-0">
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks" className="shrink-0">
            Follow-Up &amp; Tasks
          </TabsTrigger>
          <TabsTrigger value="commercial" className="shrink-0">
            Commercial Items
          </TabsTrigger>
          <TabsTrigger value="quotations" className="shrink-0">
            Quotations
          </TabsTrigger>
          <TabsTrigger value="orders" className="shrink-0">
            Sales Orders
          </TabsTrigger>
          <TabsTrigger value="revenue" className="shrink-0">
            Revenue History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ClientOverviewTab
            client={client}
            revenue={revenue}
            commercial={commercial}
            canEditStatus={canEditStatus}
            onEditInfoRequested={() => setShowEditInfo(true)}
            followUps={followUps}
            owners={owners}
            upcomingActions={upcomingActions}
            setActiveTab={setActiveTab}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <ClientTasksTab clientTasks={clientTasks} />
        </TabsContent>

        <TabsContent value="commercial">
          <ClientCommercialTab clientCommercial={clientCommercial} />
        </TabsContent>

        <TabsContent value="quotations">
          <ClientQuotationsTab clientQuotations={clientQuotations} />
        </TabsContent>

        <TabsContent value="orders">
          <ClientOrdersTab clientOrders={clientOrders} />
        </TabsContent>

        <TabsContent value="revenue">
          <ClientRevenueTab clientOrders={clientOrders} />
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
                  description: getErrorMessage(error),
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
              await reassignClientOwner({
                clientId: client.id,
                newOwnerId,
                note,
              });
              const newOwnerName =
                teamMembers.find((m) => m.id === newOwnerId)?.name ?? "—";

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
                description: getErrorMessage(error),
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
