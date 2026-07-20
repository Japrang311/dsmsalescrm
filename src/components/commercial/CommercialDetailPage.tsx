import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  User2,
  Calendar,
  FileText,
  Layers,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRupiahFull,
  formatRupiahShort,
  formatDateShort,
  daysBetween,
} from "@/lib/format";
import { stagesForFlow } from "@/lib/business-rules";
import type { CommercialItem } from "@/lib/domain";
import { useRole, ROLE_LABEL } from "@/context/role-context";
import { NOW } from "@/lib/domain";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { LogCommercialFollowUpDialog } from "@/components/commercial/LogCommercialFollowUpDialog";
import { ReviseQuotationDialog } from "@/components/clients/CreateRecordDialogs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCommercialItems,
  updateCommercialItem,
  describeCommercialItemChanges,
} from "@/lib/data/commercial-items";
import { listClients, listOwners } from "@/lib/data/clients";
import { listTasks } from "@/lib/data/tasks";
import {
  getCurrentActorId,
  listCommercialItemHistory,
  logActivity,
} from "@/lib/data/activity-log";

export function CommercialDetailPage({
  itemId,
  backHref,
  backLabel,
}: {
  itemId: string;
  backHref: string;
  backLabel: string;
}) {
  const { role, authReady } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const item = items.find((i) => i.id === itemId);

  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });
  const clients = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);
  const { data: history = [] } = useQuery({
    queryKey: ["activity-log", "commercial-item", itemId],
    queryFn: () => listCommercialItemHistory(itemId),
    enabled: authReady,
  });

  const [stage, setStage] = useState(item?.stage ?? "");
  const [soNumber, setSoNumber] = useState(item?.soNumber ?? "");

  useEffect(() => {
    if (!item) return;
    setStage(item.stage);
    setSoNumber(item.soNumber ?? "");
  }, [item]);

  if (!authReady) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Item tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">ID tidak dikenali.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={backHref}>Kembali</Link>
        </Button>
      </div>
    );
  }

  const client = clients[item.clientId];
  const owner = owners[item.ownerId];
  const stages = stagesForFlow(item.sourceFlow);
  const relatedTasks = allTasks.filter(
    (t) => t.commercialItemId === item.id || t.clientId === item.clientId,
  );
  // Sales Orders don't exist yet (Phase 5) — shown as an honest "not
  // available yet" placeholder below rather than mock SALES_ORDERS data.
  const canEdit = role !== "executive";
  const aging = Math.max(0, daysBetween(new Date(item.updatedAt), NOW));
  const quotationHistory =
    item.type === "Quotation" && item.quotationBaseNumber
      ? items
          .filter(
            (candidate) =>
              candidate.type === "Quotation" &&
              candidate.quotationBaseNumber === item.quotationBaseNumber,
          )
          .sort(
            (a, b) => (a.quotationRevision ?? 0) - (b.quotationRevision ?? 0),
          )
      : [];

  async function persist() {
    if (!item) return;
    const changes: { field: string; from?: string; to?: string }[] = [];
    if (stage !== item.stage)
      changes.push({ field: "stage", from: item.stage, to: stage });
    if (soNumber !== (item.soNumber ?? ""))
      changes.push({
        field: "soNumber",
        from: item.soNumber,
        to: soNumber || undefined,
      });

    if (changes.length === 0) {
      toast.info("Tidak ada perubahan");
      return;
    }

    try {
      await updateCommercialItem(item.id, {
        stage: stage !== item.stage ? stage : undefined,
        soNumber: soNumber !== (item.soNumber ?? "") ? soNumber : undefined,
      });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "commercial_item_stage_change",
          ownerId: item.ownerId,
          actorId,
          clientId: item.clientId,
          commercialDocumentId: item.id,
          title: `${item.description} diperbarui`,
          detail: describeCommercialItemChanges(changes),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Perubahan tersimpan", {
        description: `${changes.length} field diperbarui`,
      });
    } catch (error) {
      toast.error("Gagal menyimpan perubahan", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const isFoc = item.prototypeStatus === "FOC";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: backHref })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {item.projectName ?? item.description}
              </h1>
              <Badge variant="outline">{item.type}</Badge>
              {isFoc && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  FOC
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {backLabel} ·{" "}
              <Link
                to="/clients/$clientId"
                params={{ clientId: item.clientId }}
                className="hover:text-primary"
              >
                {client?.name ?? "-"}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && item.type === "Quotation" && item.isCurrentRevision && (
            <ReviseQuotationDialog
              document={item}
              onRevised={(documentId) =>
                navigate({
                  to: `${backHref}/${documentId}` as never,
                })
              }
              trigger={<Button variant="outline">Buat Revisi</Button>}
            />
          )}
          {canEdit && (
            <LogCommercialFollowUpDialog
              item={item}
              clientName={client?.name ?? "-"}
            />
          )}
          {canEdit && (
            <Button onClick={() => void persist()} className="gap-1.5">
              <Save className="h-4 w-4" /> Simpan perubahan
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="grid gap-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCell
                icon={<Building2 className="h-3.5 w-3.5" />}
                label="Klien"
              >
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: item.clientId }}
                  className="text-sm font-medium hover:text-primary"
                >
                  {client?.name ?? "-"}
                </Link>
                {client && (
                  <div className="mt-1">
                    <StatusBadge status={client.status} />
                  </div>
                )}
              </InfoCell>
              <InfoCell
                icon={<User2 className="h-3.5 w-3.5" />}
                label="Sales owner"
              >
                {/* Read-only: the DB revokes UPDATE on owner_id for
                    commercial_documents, so RFQ/Quotation ownership can't be
                    reassigned here. */}
                <span className="text-sm">{owner?.name ?? "-"}</span>
              </InfoCell>
              <InfoCell
                icon={<Layers className="h-3.5 w-3.5" />}
                label="Source flow"
              >
                <Badge variant="outline" className="text-[11px]">
                  {item.sourceFlow}
                </Badge>
              </InfoCell>
              <InfoCell icon={<Layers className="h-3.5 w-3.5" />} label="Stage">
                {canEdit ? (
                  <Select value={stage} onValueChange={setStage}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{item.stage}</Badge>
                )}
              </InfoCell>
              <InfoCell
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Date"
              >
                <span className="text-sm">
                  {item.documentDate ? formatDateShort(item.documentDate) : "—"}
                </span>
              </InfoCell>
              <InfoCell
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Aging (sejak update terakhir)"
              >
                <span className="text-sm tabular-nums">
                  {aging} hari · update {formatDateShort(item.updatedAt)}
                </span>
              </InfoCell>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-3">
              <InfoCell label="Total">
                <span className="text-lg font-semibold tabular-nums">
                  {isFoc ? "FOC · Rp0" : formatRupiahFull(item.estimatedValue)}
                </span>
                {!isFoc && item.estimatedValue >= 1_000_000 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({formatRupiahShort(item.estimatedValue)})
                  </span>
                )}
              </InfoCell>
              <InfoCell label="Jumlah item">
                <span className="text-lg font-semibold tabular-nums">
                  {item.itemCount ?? item.lineItems?.length ?? 0}
                </span>
              </InfoCell>
              <InfoCell label="Forecast">
                <span className="text-lg font-semibold tabular-nums">
                  {item.forecastValue === null ||
                  item.forecastValue === undefined
                    ? "—"
                    : formatRupiahFull(item.forecastValue)}
                </span>
              </InfoCell>
              <InfoCell label="No. RFQ">
                <span className="font-mono text-xs">
                  {item.rfqNumber ?? "—"}
                </span>
              </InfoCell>
              <InfoCell label="No. Quotation">
                <span className="font-mono text-xs">
                  {item.quotationNumber ?? "—"}
                </span>
              </InfoCell>
              <InfoCell label="No. SO">
                {canEdit ? (
                  <Input
                    value={soNumber}
                    onChange={(e) => setSoNumber(e.target.value)}
                    placeholder="SO-26-…"
                    className="h-8 font-mono text-xs"
                  />
                ) : (
                  <span className="font-mono text-xs">
                    {item.soNumber ?? "—"}
                  </span>
                )}
                {isFoc && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    FOC: SO value kosong, tidak masuk revenue.
                  </p>
                )}
              </InfoCell>
              <InfoCell label="Address">
                <span className="text-sm">{item.clientAddress ?? "—"}</span>
              </InfoCell>
              <InfoCell label="Note">
                <span className="text-sm">{item.note ?? "—"}</span>
              </InfoCell>
            </div>

            <Separator />

            <DocumentItemsTable
              items={item.lineItems ?? []}
              showMoney={!isFoc}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {quotationHistory.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Riwayat Revisi
                </p>
                <ul className="flex flex-col gap-1.5">
                  {quotationHistory.map((version) => (
                    <li key={version.id}>
                      <Link
                        to={`${backHref}/${version.id}` as never}
                        className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-xs hover:border-primary/40"
                      >
                        <span className="font-mono">
                          {version.quotationNumber}
                        </span>
                        <Badge
                          variant={
                            version.isCurrentRevision ? "default" : "outline"
                          }
                        >
                          {version.isCurrentRevision ? "Current" : "Riwayat"}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tasks / Follow-Up
              </p>
              {relatedTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada task terkait.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {relatedTasks.slice(0, 6).map((t) => (
                    <li
                      key={t.id}
                      className="rounded-md border bg-muted/30 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{t.title}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatDateShort(t.dueDate)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {t.method}
                        </Badge>
                        <span>{t.status}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                History
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada perubahan.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {history.slice(0, 8).map((h) => (
                    <li
                      key={h.id}
                      className="rounded-md border bg-muted/30 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {h.actorName} · {ROLE_LABEL[h.actorRole]}
                        </span>
                        <span className="tabular-nums">
                          {new Date(h.at).toLocaleString("id-ID", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-start gap-1 text-[11px]">
                        <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {h.detail ?? h.title}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoCell({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DocumentItemsTable({
  items,
  showMoney,
}: {
  items: NonNullable<CommercialItem["lineItems"]>;
  showMoney: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Line Items
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Product</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>UOM</TableHead>
              {showMoney && (
                <>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">
                  {line.productName ?? "Nama Product belum diisi"}
                </TableCell>
                <TableCell>{line.description ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.qty ?? "—"}
                </TableCell>
                <TableCell>{line.uom ?? "—"}</TableCell>
                {showMoney && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {line.unitPrice === null
                        ? "—"
                        : formatRupiahFull(line.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {line.lineTotal === null
                        ? "—"
                        : formatRupiahFull(line.lineTotal)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={showMoney ? 6 : 4}
                  className="text-center text-muted-foreground"
                >
                  Belum ada line item.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
