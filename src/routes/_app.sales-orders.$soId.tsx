import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Lock, Pencil, Receipt, X } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updateSalesOrderHeader,
  updateSalesOrderItem,
  updateSalesOrderTax,
  type SalesOrderLineItem,
} from "@/lib/data/sales-orders";
import { searchClients } from "@/lib/data/clients";
import type { Uom } from "@/lib/data/document-numbering";
import {
  getCurrentActorId,
  listSalesOrderTaxHistory,
  logActivity,
} from "@/lib/data/activity-log";
import {
  formatDateShort,
  formatRupiahFull,
  formatRupiahShort,
} from "@/lib/format";
import { ClientPickerField } from "@/components/clients/ClientPicker";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { useRole, ROLE_LABEL } from "@/context/role-context";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export const Route = createFileRoute("/_app/sales-orders/$soId")({
  head: () => ({ meta: [{ title: "Sales Order Detail · DSM" }] }),
  component: SalesOrderDetail,
});

function SalesOrderDetail() {
  const { soId } = Route.useParams();
  const navigate = useNavigate();
  const { role, authReady } = useRole();
  const queryClient = useQueryClient();
  const {
    orders,
    clients: clientList,
    items,
    ownersById,
    currentUserId,
    isLoading,
  } = useDashboardData();
  const { data: audit = [] } = useQuery({
    queryKey: ["activity-log", "sales-order-tax", soId],
    queryFn: () => listSalesOrderTaxHistory(soId),
    enabled: authReady,
  });

  const so = useMemo(() => orders.find((s) => s.id === soId), [orders, soId]);
  const client = so ? clientList.find((c) => c.id === so.clientId) : undefined;
  const owner = so ? ownersById[so.ownerId] : undefined;
  const linkedItems = so
    ? items.filter(
        (ci) =>
          ci.soNumber === so.soNumber ||
          (ci.customerPoNumber && ci.clientId === so.clientId),
      )
    : [];

  if (!authReady || isLoading) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!so) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Sales Order tidak ditemukan</h1>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/sales-orders">Kembali</Link>
        </Button>
      </div>
    );
  }

  const foc = so.type === "Prototype" && so.prototypeStatus === "FOC";
  const effectiveTax = so.taxType;
  const canEditTax = role === "manager" || role === "super_admin";
  const canEditOwnSo =
    role === "manager" ||
    role === "super_admin" ||
    (role === "sales" && so.ownerId === currentUserId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/sales-orders" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-xl font-semibold">{so.soNumber}</h1>
            <Badge variant="outline">{so.type}</Badge>
            <Badge variant="secondary">{so.numberMode}</Badge>
            {foc && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                FOC
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Referensi Sales Order · dicatat {formatDateShort(so.date)}
          </p>
        </div>
        {canEditOwnSo && (
          <EditSalesOrderHeaderDialog
            soId={so.id}
            clientId={so.clientId}
            ownerId={so.ownerId}
            customerPoNumber={so.customerPoNumber}
            date={so.date}
            canEditOwner={role === "manager" || role === "super_admin"}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="grid gap-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Cell label="Klien">
                {client ? (
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: client.id }}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {client.name}
                  </Link>
                ) : (
                  "—"
                )}
                {client && (
                  <div className="mt-1">
                    <StatusBadge status={client.status} />
                  </div>
                )}
              </Cell>
              <Cell label="Sales Owner">{owner?.name ?? "—"}</Cell>
              <Cell label="Source revenue">
                <Badge variant="secondary" className="text-[11px]">
                  {so.source}
                </Badge>
              </Cell>
              <TaxCell
                foc={foc}
                soId={so.id}
                ownerId={so.ownerId}
                clientId={so.clientId}
                current={effectiveTax}
                canEdit={canEditTax}
              />
              <Cell label="Tanggal SO">{formatDateShort(so.date)}</Cell>
              <Cell label="Customer PO">
                <span className="font-mono text-xs">
                  {so.customerPoNumber ?? "—"}
                </span>
              </Cell>
              <Cell label="Tipe SO">
                {so.type}
                {so.prototypeStatus ? ` · ${so.prototypeStatus}` : ""}
              </Cell>
              <Cell label="Jumlah item">{so.items.length}</Cell>
              {so.backdateReason && (
                <Cell label="Alasan Backdate">{so.backdateReason}</Cell>
              )}
            </div>

            <Separator />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nilai
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {foc ? "Rp0" : formatRupiahFull(so.value ?? 0)}
                {!foc && (so.value ?? 0) >= 1_000_000 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({formatRupiahShort(so.value ?? 0)})
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {foc
                  ? "SO Prototype FOC tidak berkontribusi ke revenue & achievement."
                  : "Kontribusi 100% ke revenue pada periode SO."}
              </p>
            </div>

            <Separator />

            <SalesOrderItemsTable
              items={so.items}
              showMoney={!foc}
              canEdit={canEditOwnSo}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Linked Commercial Items
            </p>
            {linkedItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tidak ada item pipeline yang direferensikan ke SO ini.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {linkedItems.map((it) => (
                  <li
                    key={it.id}
                    className="rounded-md border bg-muted/30 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {it.projectName ?? it.description}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {it.type}
                      </Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {it.stage}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {audit.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Riwayat perubahan pajak
            </p>
            <ul className="flex flex-col gap-2">
              {audit.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-0.5 rounded-md border bg-muted/30 p-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {a.from}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-[10px]">
                      {a.to}
                    </Badge>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(a.at).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    oleh {a.byUserName} · {ROLE_LABEL[a.byRole]}
                    {a.note ? ` — "${a.note}"` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header edit dialog — Klien, Customer PO, Tanggal, Sales Owner. Klien uses
// searchClients() (public.client_search_index), not the RLS-scoped clients
// list, so a sales user correcting their own SO can find a client even when
// it's registered to a different owner — see
// supabase/migrations/20260720000000_add_sales_order_edit_support.sql.
// ---------------------------------------------------------------------------

function EditSalesOrderHeaderDialog({
  soId,
  clientId,
  ownerId,
  customerPoNumber,
  date,
  canEditOwner,
}: {
  soId: string;
  clientId: string;
  ownerId: string;
  customerPoNumber: string | null;
  date: string;
  canEditOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const { ownersById } = useDashboardData();
  const [open, setOpen] = useState(false);
  const [draftClientId, setDraftClientId] = useState(clientId);
  const [draftOwnerId, setDraftOwnerId] = useState(ownerId);
  const [draftPo, setDraftPo] = useState(customerPoNumber ?? "");
  const [draftDate, setDraftDate] = useState(date);
  const [saving, setSaving] = useState(false);

  const { data: searchableClients = [] } = useQuery({
    queryKey: ["clients", "search-index"],
    queryFn: searchClients,
    enabled: open,
  });

  const ownerOptions = Object.entries(ownersById).filter(
    ([, o]) => o.role === "sales" || o.role === "manager",
  );

  function openDialog() {
    setDraftClientId(clientId);
    setDraftOwnerId(ownerId);
    setDraftPo(customerPoNumber ?? "");
    setDraftDate(date);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      await updateSalesOrderHeader(soId, {
        clientId: draftClientId,
        ownerId: canEditOwner ? draftOwnerId : ownerId,
        customerPoNumber: draftPo,
        date: draftDate,
      });
      await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Detail Sales Order diperbarui");
      setOpen(false);
    } catch (error) {
      toast.error("Gagal menyimpan perubahan", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={openDialog}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sales Order</DialogTitle>
            <DialogDescription>
              Perbaiki data Klien, Customer PO, Tanggal, atau Sales Owner untuk
              SO ini.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <ClientPickerField
              clients={searchableClients}
              value={draftClientId}
              onChange={setDraftClientId}
            />
            <div>
              <Label>Sales Owner</Label>
              {canEditOwner ? (
                <Select value={draftOwnerId} onValueChange={setDraftOwnerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerOptions.map(([id, o]) => (
                      <SelectItem key={id} value={id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  {ownersById[ownerId]?.name ?? "—"}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Lock className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Hanya Sales Manager yang dapat memindahkan kepemilikan SO.
                    </TooltipContent>
                  </Tooltip>
                </p>
              )}
            </div>
            <div>
              <Label>Customer PO</Label>
              <Input
                value={draftPo}
                onChange={(e) => setDraftPo(e.target.value)}
                placeholder="Nomor Customer PO"
              />
            </div>
            <div>
              <Label>Tanggal SO</Label>
              <Input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tax cell — read-only badge for non-managers, inline editor for managers.
// ---------------------------------------------------------------------------

function TaxCell({
  foc,
  soId,
  ownerId,
  clientId,
  current,
  canEdit,
}: {
  foc: boolean;
  soId: string;
  ownerId: string;
  clientId: string;
  current: "PPN" | "Non-PPN" | undefined;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<"PPN" | "Non-PPN">(current ?? "PPN");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (foc) {
    return (
      <Cell label="Pajak">
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          FOC
        </Badge>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Prototype FOC tidak memiliki komponen pajak.
        </p>
      </Cell>
    );
  }

  const label = "Pajak (PPN / Non-PPN)";

  if (!canEdit) {
    return (
      <Cell label={label}>
        <div className="flex items-center gap-2">
          <Badge
            variant={current === "PPN" ? "default" : "secondary"}
            className="text-[11px]"
          >
            {current ?? "Belum diset"}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center text-muted-foreground">
                <Lock className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Hanya Sales Manager yang dapat mengubah pajak SO.
            </TooltipContent>
          </Tooltip>
        </div>
      </Cell>
    );
  }

  if (!editing) {
    return (
      <Cell label={label}>
        <div className="flex items-center gap-2">
          <Badge
            variant={current === "PPN" ? "default" : "secondary"}
            className="text-[11px]"
          >
            {current ?? "Belum diset"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setDraft(current ?? "PPN");
              setNote("");
              setEditing(true);
            }}
          >
            <Pencil className="h-3 w-3" /> Ubah
          </Button>
        </div>
      </Cell>
    );
  }

  const changed = draft !== current;

  return (
    <Cell label={label}>
      <div className="flex flex-col gap-2">
        <Select
          value={draft}
          onValueChange={(v) => setDraft(v as "PPN" | "Non-PPN")}
        >
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PPN">PPN</SelectItem>
            <SelectItem value="Non-PPN">Non-PPN</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Catatan (opsional)
          </Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="cth. Koreksi klasifikasi pajak dari admin"
            className="h-8 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!changed || saving}
            onClick={() => {
              void (async () => {
                setSaving(true);
                try {
                  await updateSalesOrderTax(soId, draft);
                  const actorId = await getCurrentActorId();
                  if (actorId) {
                    const detail = note.trim()
                      ? `${current ?? "—"} → ${draft}\n${note.trim()}`
                      : `${current ?? "—"} → ${draft}`;
                    await logActivity({
                      kind: "sales_order_tax_change",
                      ownerId,
                      actorId,
                      clientId,
                      salesOrderId: soId,
                      title: `Pajak SO diubah ke ${draft}`,
                      detail,
                    });
                  }
                  await queryClient.invalidateQueries({
                    queryKey: ["sales-orders"],
                  });
                  await queryClient.invalidateQueries({
                    queryKey: ["activity-log"],
                  });
                  toast.success(`Pajak SO diubah ke ${draft}`);
                  setEditing(false);
                } catch (error) {
                  toast.error("Gagal mengubah pajak SO", {
                    description:
                      error instanceof Error ? error.message : "Unknown error",
                  });
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Batal
          </Button>
        </div>
      </div>
    </Cell>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SalesOrderItemsTable({
  items,
  showMoney,
  canEdit,
}: {
  items: SalesOrderLineItem[];
  showMoney: boolean;
  canEdit: boolean;
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
              {canEdit && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <SalesOrderItemRow
                key={item.id}
                item={item}
                showMoney={showMoney}
                canEdit={canEdit}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const UOM_OPTIONS: Uom[] = ["Unit", "Pcs", "Set", "Lot"];

function SalesOrderItemRow({
  item,
  showMoney,
  canEdit,
}: {
  item: SalesOrderLineItem;
  showMoney: boolean;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [productName, setProductName] = useState(item.productName ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [qty, setQty] = useState(String(item.qty ?? ""));
  const [uom, setUom] = useState<Uom>(item.uom ?? "Unit");
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice ?? ""));
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setProductName(item.productName ?? "");
    setDescription(item.description ?? "");
    setQty(String(item.qty ?? ""));
    setUom(item.uom ?? "Unit");
    setUnitPrice(String(item.unitPrice ?? ""));
    setEditing(true);
  }

  async function save() {
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Qty harus lebih dari 0");
      return;
    }
    const priceNum = showMoney ? Number(unitPrice) : null;
    if (showMoney && (!Number.isFinite(priceNum) || (priceNum ?? 0) <= 0)) {
      toast.error("Unit Price harus lebih dari 0");
      return;
    }
    setSaving(true);
    try {
      await updateSalesOrderItem(item.id, {
        productName: productName.trim() || null,
        description: description.trim() || null,
        qty: qtyNum,
        uom,
        unitPrice: priceNum,
      });
      await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Item diperbarui");
      setEditing(false);
    } catch (error) {
      toast.error("Gagal menyimpan item", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <TableRow>
        <TableCell className="font-medium">
          {item.productName ?? "Nama Product belum diisi"}
        </TableCell>
        <TableCell>{item.description ?? "—"}</TableCell>
        <TableCell className="text-right tabular-nums">
          {item.qty ?? "—"}
        </TableCell>
        <TableCell>{item.uom ?? "—"}</TableCell>
        {showMoney && (
          <>
            <TableCell className="text-right tabular-nums">
              {item.unitPrice === null ? "—" : formatRupiahFull(item.unitPrice)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {item.lineTotal === null ? "—" : formatRupiahFull(item.lineTotal)}
            </TableCell>
          </>
        )}
        {canEdit && (
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={startEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TableCell>
        )}
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          aria-label="Nama Product"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          className="h-8 min-w-[140px] text-xs"
          placeholder="Nama Product"
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 min-w-[160px] text-xs"
          placeholder="Description"
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label="Qty"
          type="number"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-8 w-20 text-right text-xs"
        />
      </TableCell>
      <TableCell>
        <Select value={uom} onValueChange={(v) => setUom(v as Uom)}>
          <SelectTrigger className="h-8 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UOM_OPTIONS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {showMoney && (
        <>
          <TableCell>
            <Input
              aria-label="Unit Price"
              type="number"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="h-8 w-28 text-right text-xs"
            />
          </TableCell>
          <TableCell className="text-right text-xs text-muted-foreground">
            {formatRupiahFull((Number(qty) || 0) * (Number(unitPrice) || 0))}
          </TableCell>
        </>
      )}
      <TableCell>
        <div className="flex gap-1">
          <Button
            size="icon"
            className="h-7 w-7"
            disabled={saving}
            onClick={() => void save()}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
