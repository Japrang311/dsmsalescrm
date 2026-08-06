import {
  Building2,
  Calendar,
  FileText,
  Pencil,
  PhoneCall,
  ReceiptText,
  Sparkles,
} from "lucide-react";

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

import { StatusBadge } from "@/components/clients/StatusBadges";
import { AddFollowUpDialog } from "@/components/clients/AddFollowUpDialog";
import {
  CreateQuotationDialog,
  CreateSalesOrderDialog,
  CreatePrototypeDialog,
} from "@/components/clients/CreateRecordDialogs";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { MiniStat } from "@/components/clients/ClientPrimitives";
import { CLIENT_STATUSES } from "@/lib/business-rules";
import { formatDateShort, formatRupiahShort, daysBetween } from "@/lib/format";
import { NOW } from "@/lib/domain";
import type { Client, ClientStatus, Role } from "@/lib/domain";
import type { clientRevenueMetrics as clientRevenueMetricsFn } from "@/lib/data/dashboard-selectors";

type ClientRevenueMetrics = ReturnType<typeof clientRevenueMetricsFn>;

export function ClientHeaderCard({
  client,
  ownerName,
  revenue,
  role,
  canEditStatus,
  canReassign,
  setActiveTab,
  onStatusChangeRequested,
  onReassignRequested,
  onEditInfoRequested,
}: {
  client: Client;
  ownerName: string;
  revenue: ClientRevenueMetrics;
  role: Role;
  canEditStatus: boolean;
  canReassign: boolean;
  setActiveTab: (tab: string) => void;
  onStatusChangeRequested: (status: ClientStatus) => void;
  onReassignRequested: () => void;
  onEditInfoRequested: () => void;
}) {
  const sharedDialogProps = {
    clientId: client.id,
    clientName: client.name,
    ownerId: client.ownerId,
  };

  return (
    <>
      {/* Compact header — real fields from the clients table */}
      <Card className="border-l-4 border-l-primary/70 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">
                  {client.name}
                </h1>
                {canEditStatus && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Edit nama client ${client.name}`}
                    title="Edit nama client"
                    onClick={onEditInfoRequested}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
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
                onClick={() => setActiveTab("revenue")}
              />
              <MiniStat
                label="Last FU"
                value={client.lastFu ? formatDateShort(client.lastFu) : "—"}
                onClick={() => setActiveTab("tasks")}
              />
              <MiniStat
                label="Next FU"
                value={client.nextFu ? formatDateShort(client.nextFu) : "—"}
                tone={
                  client.nextFu && daysBetween(NOW, client.nextFu) < 0
                    ? "danger"
                    : "default"
                }
                onClick={() => setActiveTab("tasks")}
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
                  onStatusChangeRequested(next);
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
                  onClick={onReassignRequested}
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
    </>
  );
}
