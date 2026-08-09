import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Mail,
  Pencil,
  Phone,
  ReceiptText,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  MetricCard,
  SectionTitle,
  InfoRow,
} from "@/components/clients/ClientPrimitives";
import { formatDateShort, formatRupiahShort } from "@/lib/format";
import { CURRENT_YEAR } from "@/lib/domain";
import type { Client, Task } from "@/lib/domain";
import type { FollowUpLog } from "@/lib/data/follow-ups";
import type { OwnerLookup } from "@/lib/data/clients";
import type {
  clientRevenueMetrics as clientRevenueMetricsFn,
  clientCommercialMetrics as clientCommercialMetricsFn,
} from "@/lib/data/dashboard-selectors";

type ClientRevenueMetrics = ReturnType<typeof clientRevenueMetricsFn>;
type ClientCommercialMetrics = ReturnType<typeof clientCommercialMetricsFn>;

export function ClientOverviewTab({
  client,
  revenue,
  commercial,
  canEditStatus,
  onEditInfoRequested,
  followUps,
  owners,
  upcomingActions,
  setActiveTab,
}: {
  client: Client;
  revenue: ClientRevenueMetrics;
  commercial: ClientCommercialMetrics;
  canEditStatus: boolean;
  onEditInfoRequested: () => void;
  followUps: FollowUpLog[];
  owners: OwnerLookup;
  upcomingActions: Task[];
  setActiveTab: (tab: string) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          label="Total Revenue"
          value={formatRupiahShort(revenue.totalRevenue)}
          icon={ReceiptText}
          hint={`${CURRENT_YEAR}`}
          onClick={() => setActiveTab("revenue")}
        />
        <MetricCard
          label="PPN"
          value={revenue.ppn > 0 ? formatRupiahShort(revenue.ppn) : "—"}
          icon={Layers}
          hint={revenue.ppn > 0 ? "PPN" : "Belum ada PPN"}
          onClick={() => setActiveTab("revenue")}
        />
        <MetricCard
          label="Non-PPN"
          value={revenue.nonPpn > 0 ? formatRupiahShort(revenue.nonPpn) : "—"}
          icon={Layers}
          hint={revenue.nonPpn > 0 ? "Non-PPN" : "Belum ada Non-PPN"}
          onClick={() => setActiveTab("revenue")}
        />
        <MetricCard
          label="Quotation Pipeline"
          value={
            commercial.quotationPipeline > 0
              ? formatRupiahShort(commercial.quotationPipeline)
              : "—"
          }
          icon={FileText}
          hint={
            commercial.quotationPipeline > 0
              ? "Quotation aktif"
              : "Belum ada Quotation"
          }
          onClick={() => setActiveTab("quotations")}
        />
        <MetricCard
          label="Commit"
          value={
            commercial.commit > 0 ? formatRupiahShort(commercial.commit) : "—"
          }
          icon={Clock}
          hint={commercial.commit > 0 ? "Total Commit" : "Belum ada Commit"}
          onClick={() => setActiveTab("commercial")}
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
          onClick={() => setActiveTab("orders")}
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
          onClick={() => setActiveTab("orders")}
        />
      </div>

      <ClientInfoCard
        client={client}
        canEdit={canEditStatus}
        onEdit={onEditInfoRequested}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <SectionTitle icon={Clock} title="Follow-up Timeline" />
            {followUps.length === 0 ? (
              <EmptyState
                className="mt-3"
                description="Belum ada follow-up tercatat."
              />
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
              <EmptyState
                className="mt-3"
                description="Tidak ada action mendatang."
              />
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {upcomingActions.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs"
                  >
                    {t.dueState === "Overdue" || t.dueState === "Escalated" ? (
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
                        t.dueState === "Overdue" || t.dueState === "Escalated"
                          ? "destructive"
                          : "secondary"
                      }
                      className="shrink-0 text-[10px]"
                    >
                      {t.dueState ?? t.workflowStatus}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
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
    client.address ||
    client.city ||
    client.province ||
    client.industry ||
    client.website ||
    client.notes;
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
            <InfoRow
              label="Kota / Propinsi"
              value={
                client.city && client.province
                  ? `${client.city}, ${client.province}`
                  : (client.city ?? client.province)
              }
            />
            <InfoRow label="Bidang Usaha" value={client.industry} />
            <InfoRow label="Website" value={client.website} />
            <InfoRow label="Catatan" value={client.notes} />
            {!hasCompanyInfo && (
              <EmptyState description="Belum ada info perusahaan." />
            )}
          </div>

          <div className="grid gap-2">
            {filledContacts.length === 0 ? (
              <EmptyState description="Belum ada kontak person." />
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
