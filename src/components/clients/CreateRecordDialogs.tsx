import { useState, type ReactNode } from "react";
import {
  useForm,
  useFieldArray,
  type FieldErrors,
  type Path,
  type UseFormRegister,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommercialItem, TaxType, PrototypeStatus } from "@/lib/domain";
import { useQueryClient } from "@tanstack/react-query";
import {
  createPrototypeRequest,
  createQuotation,
  createRfq,
  reviseQuotation,
} from "@/lib/data/commercial-documents";
import { createSalesOrder } from "@/lib/data/sales-orders";
import { useClientResolution, ClientPickerField } from "./ClientPicker";
import {
  buildSalesOrderSchema,
  prototypeRequestSchema,
  quotationSchema,
  rfqSchema,
  type PrototypeRequestValues,
  type QuotationValues,
  type RfqValues,
  type SalesOrderValues,
} from "./commercial-form-schemas";

const todayIso = () => new Date().toISOString().slice(0, 10);

// clientId/clientName/ownerId are optional: when a dialog is opened from a
// client's own page these are already known and passed in directly: no
// picker needed. When opened from the global Quick Create menu (no client
// context yet), omit them and useClientResolution() (see ClientPicker.tsx)
// renders a client picker as the form's first field instead.
type SharedProps = {
  clientId?: string;
  clientName?: string;
  ownerId?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onCreated?: () => void;
};

function msg(errors: FieldErrors, key: string): string | undefined {
  const e = errors[key];
  if (!e) return undefined;
  const m = (e as { message?: unknown }).message;
  return typeof m === "string" ? m : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Unknown error";
}

// ---------------------------------------------------------------------------
// RFQ
// ---------------------------------------------------------------------------

const emptyLineItem = {
  productName: "",
  description: "",
  qty: 1,
  uom: "Pcs" as const,
  unitPrice: 0,
};
const WEIGHTED_STAGES = [
  "Client Request for Quotes",
  "Quotes Sent",
  "Negotiation",
  "Hot Prospect",
  "Commit",
  "Closed Won",
  "Closed Lost",
] as const;

export function CreateRfqDialog(props: SharedProps) {
  const { open, setOpen, controlled } = useDialogState(props);
  const queryClient = useQueryClient();
  const {
    needsPicker,
    clients,
    pickedId,
    setPickedId,
    clientId,
    clientName,
    ownerId,
    resolved,
  } = useClientResolution(props);
  const form = useForm<RfqValues>({
    resolver: zodResolver(rfqSchema),
    defaultValues: {
      rfqNumber: `RFQ-${new Date().getFullYear().toString().slice(2)}-${Math.floor(1000 + Math.random() * 8999)}`,
      documentDate: todayIso(),
      stage: "Client Request for Quotes",
      lineItems: [emptyLineItem],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  const lineItems = form.watch("lineItems");
  const onSubmit = form.handleSubmit(async (v) => {
    if (!clientId || !ownerId) return;
    try {
      const created = await createRfq({
        clientId,
        rfqNumber: v.rfqNumber,
        documentDate: v.documentDate,
        stage: v.stage,
        items: v.lineItems,
      });
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("RFQ dibuat", {
        description: `${clientName} · ${created.rfqNumber} · ${v.lineItems.length} item`,
      });
      form.reset();
      setPickedId("");
      setOpen(false);
      props.onCreated?.();
    } catch (error) {
      toast.error("Gagal membuat RFQ", {
        description: errorMessage(error),
      });
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(props.trigger || !controlled) && (
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tambah RFQ</DialogTitle>
          <DialogDescription>{clientName ?? "Pilih klien"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          {needsPicker && (
            <ClientPickerField
              clients={clients}
              value={pickedId}
              onChange={setPickedId}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <FieldText
              label="Nomor RFQ"
              reg={form.register("rfqNumber")}
              error={msg(form.formState.errors, "rfqNumber")}
            />
            <FieldSelect
              label="Stage awal"
              value={form.watch("stage")}
              onChange={(v) =>
                form.setValue("stage", v as RfqValues["stage"], {
                  shouldDirty: true,
                })
              }
              options={[...WEIGHTED_STAGES]}
            />
          </div>
          <FieldText
            label="Date"
            reg={form.register("documentDate")}
            error={msg(form.formState.errors, "documentDate")}
            type="date"
          />
          <LineItemsSection
            fields={fields}
            append={() => append(emptyLineItem)}
            remove={remove}
            register={form.register}
            lineItems={lineItems}
            errorMessage={form.formState.errors.lineItems?.message as string}
            showMoney
          />
          <Footer
            onCancel={() => setOpen(false)}
            submitting={form.formState.isSubmitting}
            label="Simpan RFQ"
            disabled={!resolved}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Quotation
// ---------------------------------------------------------------------------

export function CreateQuotationDialog(props: SharedProps) {
  const { open, setOpen, controlled } = useDialogState(props);
  const queryClient = useQueryClient();
  const {
    needsPicker,
    clients,
    pickedId,
    setPickedId,
    clientId,
    clientName,
    ownerId,
    resolved,
  } = useClientResolution(props);
  const form = useForm<QuotationValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      documentDate: todayIso(),
      clientAddress: "",
      stage: "Quotes Sent",
      soNumber: "",
      note: "",
      lineItems: [emptyLineItem],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  const lineItems = form.watch("lineItems");
  const onSubmit = form.handleSubmit(async (v) => {
    if (!clientId || !ownerId) return;
    try {
      const created = await createQuotation({
        clientId,
        documentDate: v.documentDate,
        clientAddress: v.clientAddress,
        stage: v.stage,
        soNumber: v.soNumber,
        note: v.note,
        items: v.lineItems,
      });
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Quotation dibuat", {
        description: `${clientName} · ${created.quotationNumber} · ${v.lineItems.length} item`,
      });
      form.reset();
      setPickedId("");
      setOpen(false);
      props.onCreated?.();
    } catch (error) {
      toast.error("Gagal membuat Quotation", {
        description: errorMessage(error),
      });
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(props.trigger || !controlled) && (
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Quotation</DialogTitle>
          <DialogDescription>{clientName ?? "Pilih klien"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          {needsPicker && (
            <ClientPickerField
              clients={clients}
              value={pickedId}
              onChange={setPickedId}
            />
          )}
          <div className="rounded-md border bg-muted/40 p-3">
            <Label>Nomor Quotation</Label>
            <p className="text-sm text-muted-foreground">
              Dibuat otomatis oleh sistem setelah disimpan
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Date"
              type="date"
              reg={form.register("documentDate")}
              error={msg(form.formState.errors, "documentDate")}
            />
            <FieldSelect
              label="Stage"
              value={form.watch("stage")}
              onChange={(v) =>
                form.setValue("stage", v as QuotationValues["stage"], {
                  shouldDirty: true,
                })
              }
              options={[...WEIGHTED_STAGES]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Address"
              reg={form.register("clientAddress")}
              error={msg(form.formState.errors, "clientAddress")}
            />
            <FieldText
              label="SO Number"
              reg={form.register("soNumber")}
              error={msg(form.formState.errors, "soNumber")}
            />
          </div>
          <FieldText
            label="Note"
            reg={form.register("note")}
            error={msg(form.formState.errors, "note")}
          />
          <LineItemsSection
            fields={fields}
            append={() => append(emptyLineItem)}
            remove={remove}
            register={form.register}
            lineItems={lineItems}
            errorMessage={form.formState.errors.lineItems?.message as string}
            showMoney
          />
          <Footer
            onCancel={() => setOpen(false)}
            submitting={form.formState.isSubmitting}
            label="Simpan Quotation"
            disabled={!resolved}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviseQuotationDialog({
  document,
  trigger,
  onRevised,
}: {
  document: CommercialItem;
  trigger: ReactNode;
  onRevised?: (documentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<QuotationValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      documentDate: todayIso(),
      clientAddress: document.clientAddress ?? "",
      stage: "Quotes Sent",
      soNumber: document.soNumber ?? "",
      note: document.note ?? "",
      lineItems:
        document.lineItems && document.lineItems.length > 0
          ? document.lineItems.map((item) => ({
              productName: item.productName ?? "",
              description: item.description ?? "",
              qty: item.qty ?? 1,
              uom: item.uom ?? "Pcs",
              unitPrice: item.unitPrice ?? 0,
            }))
          : [emptyLineItem],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  const lineItems = form.watch("lineItems");
  const onSubmit = form.handleSubmit(async (value) => {
    try {
      const revised = await reviseQuotation(document.id, {
        documentDate: value.documentDate,
        clientAddress: value.clientAddress,
        soNumber: value.soNumber,
        note: value.note,
        items: value.lineItems,
      });
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Revisi Quotation dibuat", {
        description: revised.quotationNumber ?? undefined,
      });
      setOpen(false);
      onRevised?.(revised.id);
    } catch (error) {
      toast.error("Gagal membuat revisi", {
        description: errorMessage(error),
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Revisi Quotation</DialogTitle>
          <DialogDescription>
            {document.quotationNumber} akan dipertahankan sebagai riwayat.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Date"
              type="date"
              reg={form.register("documentDate")}
              error={msg(form.formState.errors, "documentDate")}
            />
            <FieldText
              label="Address"
              reg={form.register("clientAddress")}
              error={msg(form.formState.errors, "clientAddress")}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="SO Number"
              reg={form.register("soNumber")}
              error={msg(form.formState.errors, "soNumber")}
            />
            <FieldText
              label="Note"
              reg={form.register("note")}
              error={msg(form.formState.errors, "note")}
            />
          </div>
          <LineItemsSection
            fields={fields}
            append={() => append(emptyLineItem)}
            remove={remove}
            register={form.register}
            lineItems={lineItems}
            errorMessage={form.formState.errors.lineItems?.message as string}
            showMoney
          />
          <Footer
            onCancel={() => setOpen(false)}
            submitting={form.formState.isSubmitting}
            label="Buat Revisi"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sales Order
// ---------------------------------------------------------------------------

const emptySoLineItem = {
  productName: "",
  description: "",
  qty: 1,
  uom: "Pcs" as const,
  unitPrice: 0,
};
type SoValues = SalesOrderValues;

export function CreateSalesOrderDialog(props: SharedProps) {
  const { open, setOpen, controlled } = useDialogState(props);
  const queryClient = useQueryClient();
  const {
    needsPicker,
    clients,
    pickedId,
    setPickedId,
    clientId,
    clientName,
    ownerId,
    resolved,
  } = useClientResolution(props);
  const isHariffClient = clientName === "PT. HARIFF DAYA TUNGGAL ENGINEERING";
  const form = useForm<SoValues>({
    resolver: zodResolver(buildSalesOrderSchema(isHariffClient)),
    defaultValues: {
      customerPoNumber: "",
      type: "Regular",
      taxType: "PPN",
      prototypeStatus: undefined,
      source: "Existing / Repeat Order",
      date: todayIso(),
      numberMode: "Auto",
      manualSoNumber: "",
      backdateReason: "",
      lineItems: [emptySoLineItem],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  const lineItems = form.watch("lineItems");
  const type = form.watch("type");
  const proto = form.watch("prototypeStatus");
  const isFoc = type === "Prototype" && proto === "FOC";
  const onSubmit = form.handleSubmit(async (v) => {
    if (!clientId || !ownerId) return;
    const foc = v.type === "Prototype" && v.prototypeStatus === "FOC";
    try {
      const created = await createSalesOrder({
        clientId,
        date: v.date,
        customerPoNumber: v.customerPoNumber,
        type: v.type,
        taxType: foc ? undefined : v.taxType,
        prototypeStatus: v.prototypeStatus,
        source: v.source,
        numberMode: v.numberMode,
        manualSoNumber: v.manualSoNumber,
        backdateReason: v.backdateReason,
        items: v.lineItems.map((item) => ({
          ...item,
          unitPrice: foc ? undefined : item.unitPrice,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Sales Order dicatat", {
        description: foc
          ? `${created.soNumber} · Prototype FOC (tidak masuk revenue)`
          : `${created.soNumber} · ${v.type} · ${v.lineItems.length} item`,
      });
      form.reset();
      setPickedId("");
      setOpen(false);
      props.onCreated?.();
    } catch (error) {
      toast.error("Gagal mencatat Sales Order", {
        description: errorMessage(error),
      });
    }
  });
  const regularSources: SoValues["source"][] = [
    "RFQ / New Product",
    "Existing / Repeat Order",
  ];
  const prototypeSource: SoValues["source"] =
    proto === "FOC" ? "Prototype FOC" : "Prototype Paid";
  const showTax =
    type === "Regular" || (type === "Prototype" && proto === "Paid");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(props.trigger || !controlled) && (
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record Sales Order</DialogTitle>
          <DialogDescription>{clientName ?? "Pilih klien"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          {needsPicker && (
            <ClientPickerField
              clients={clients}
              value={pickedId}
              onChange={setPickedId}
            />
          )}
          <div className="rounded-md border bg-muted/40 p-3">
            <Label>Nomor SO</Label>
            <p className="text-sm text-muted-foreground">
              {form.watch("numberMode") === "Hariff Backdate"
                ? "Gunakan nomor resmi historis di bawah"
                : "Dibuat otomatis oleh sistem setelah disimpan"}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Nomor PO Customer"
              reg={form.register("customerPoNumber")}
              error={msg(form.formState.errors, "customerPoNumber")}
            />
            <FieldSelect
              label="Tipe SO"
              value={type}
              onChange={(v) => {
                const next = v as SoValues["type"];
                form.setValue("type", next, { shouldDirty: true });
                if (next === "Regular") {
                  form.setValue("prototypeStatus", undefined);
                  form.setValue("taxType", "PPN");
                  form.setValue("source", "Existing / Repeat Order");
                } else {
                  form.setValue("prototypeStatus", "Paid");
                  form.setValue("taxType", "PPN");
                  form.setValue("source", "Prototype Paid");
                }
              }}
              options={["Regular", "Prototype"]}
            />
          </div>
          {isHariffClient && (
            <FieldSelect
              label="Mode Penomoran SO"
              value={form.watch("numberMode")}
              onChange={(value) => {
                const mode = value as SoValues["numberMode"];
                form.setValue("numberMode", mode, { shouldDirty: true });
                if (mode === "Auto") {
                  form.setValue("manualSoNumber", "");
                  form.setValue("backdateReason", "");
                }
              }}
              options={["Auto", "Hariff Backdate"]}
              error={msg(form.formState.errors, "numberMode")}
            />
          )}
          {isHariffClient && form.watch("numberMode") === "Hariff Backdate" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldText
                label="Nomor SO Manual"
                reg={form.register("manualSoNumber")}
                error={msg(form.formState.errors, "manualSoNumber")}
              />
              <FieldText
                label="Alasan Backdate"
                reg={form.register("backdateReason")}
                error={msg(form.formState.errors, "backdateReason")}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {type === "Prototype" && (
              <FieldSelect
                label="Status prototype"
                value={form.watch("prototypeStatus") ?? "Paid"}
                onChange={(v) => {
                  const status = v as PrototypeStatus;
                  form.setValue("prototypeStatus", status, {
                    shouldDirty: true,
                  });
                  if (status === "FOC") {
                    form.setValue("source", "Prototype FOC");
                    form.setValue("taxType", undefined);
                    form.setValue(
                      "lineItems",
                      form.getValues("lineItems").map((item) => ({
                        ...item,
                        unitPrice: undefined,
                      })),
                      { shouldDirty: true },
                    );
                  } else {
                    form.setValue("source", "Prototype Paid");
                    form.setValue("taxType", "PPN");
                    form.setValue(
                      "lineItems",
                      form.getValues("lineItems").map((item) => ({
                        ...item,
                        unitPrice: item.unitPrice ?? 0,
                      })),
                      { shouldDirty: true },
                    );
                  }
                }}
                options={["Paid", "FOC"]}
                error={msg(form.formState.errors, "prototypeStatus")}
              />
            )}
            {showTax && (
              <FieldSelect
                label="Pajak"
                value={form.watch("taxType") ?? "PPN"}
                onChange={(v) =>
                  form.setValue("taxType", v as TaxType, { shouldDirty: true })
                }
                options={["PPN", "Non-PPN"]}
                error={msg(form.formState.errors, "taxType")}
              />
            )}
            {type === "Regular" ? (
              <FieldSelect
                label="Sumber revenue"
                value={form.watch("source")}
                onChange={(v) =>
                  form.setValue("source", v as SoValues["source"], {
                    shouldDirty: true,
                  })
                }
                options={regularSources}
                error={msg(form.formState.errors, "source")}
              />
            ) : (
              <div>
                <Label>Sumber revenue</Label>
                <Input value={prototypeSource} disabled readOnly />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {proto === "FOC"
                    ? "Tidak berkontribusi ke revenue"
                    : "Masuk revenue Prototype Paid"}
                </p>
              </div>
            )}
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" {...form.register("date")} />
            {msg(form.formState.errors, "date") && (
              <p className="mt-1 text-xs text-destructive">
                {msg(form.formState.errors, "date")}
              </p>
            )}
          </div>
          {isFoc && (
            <p className="text-[11px] text-muted-foreground">
              Prototype FOC tetap menyimpan Product, Description, Qty, dan UOM;
              Unit Price dan Total dikosongkan.
            </p>
          )}
          <LineItemsSection
            fields={fields}
            append={() => append(emptySoLineItem)}
            remove={remove}
            register={form.register}
            lineItems={lineItems}
            errorMessage={form.formState.errors.lineItems?.message as string}
            showMoney={!isFoc}
          />
          <Footer
            onCancel={() => setOpen(false)}
            submitting={form.formState.isSubmitting}
            label="Simpan Sales Order"
            disabled={!resolved}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Prototype Request
// ---------------------------------------------------------------------------

export function CreatePrototypeDialog(props: SharedProps) {
  const { open, setOpen, controlled } = useDialogState(props);
  const queryClient = useQueryClient();
  const {
    needsPicker,
    clients,
    pickedId,
    setPickedId,
    clientId,
    clientName,
    ownerId,
    resolved,
  } = useClientResolution(props);
  const form = useForm<PrototypeRequestValues>({
    resolver: zodResolver(prototypeRequestSchema),
    defaultValues: {
      documentDate: todayIso(),
      lineItems: [emptyLineItem],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });
  const lineItems = form.watch("lineItems");
  const onSubmit = form.handleSubmit(async (v) => {
    if (!clientId || !ownerId) return;
    try {
      const created = await createPrototypeRequest({
        clientId,
        documentDate: v.documentDate,
        items: v.lineItems,
      });
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Prototype Request dibuat", {
        description: `${clientName} · ${created.items.length} item`,
      });
      form.reset();
      setPickedId("");
      setOpen(false);
      props.onCreated?.();
    } catch (error) {
      toast.error("Gagal membuat Prototype Request", {
        description: errorMessage(error),
      });
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(props.trigger || !controlled) && (
        <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prototype Request</DialogTitle>
          <DialogDescription>{clientName ?? "Pilih klien"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          {needsPicker && (
            <ClientPickerField
              clients={clients}
              value={pickedId}
              onChange={setPickedId}
            />
          )}
          <FieldText
            label="Date"
            type="date"
            reg={form.register("documentDate")}
            error={msg(form.formState.errors, "documentDate")}
          />
          <LineItemsSection
            fields={fields}
            append={() => append(emptyLineItem)}
            remove={remove}
            register={form.register}
            lineItems={lineItems}
            errorMessage={form.formState.errors.lineItems?.message as string}
            showMoney
          />
          <Footer
            onCancel={() => setOpen(false)}
            submitting={form.formState.isSubmitting}
            label="Simpan Prototype Request"
            disabled={!resolved}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function useDialogState(props: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const controlled = props.open !== undefined;
  const open = props.open ?? uncontrolled;
  const setOpen = (o: boolean) => {
    if (props.onOpenChange) props.onOpenChange(o);
    else setUncontrolled(o);
  };
  return { open, setOpen, controlled };
}

function Footer({
  onCancel,
  submitting,
  label,
  disabled,
}: {
  onCancel: () => void;
  submitting: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Batal
      </Button>
      <Button type="submit" disabled={submitting || disabled}>
        {submitting ? "Menyimpan…" : label}
      </Button>
    </DialogFooter>
  );
}

function FieldText({
  label,
  placeholder,
  reg,
  error,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  reg: UseFormRegisterReturn;
  error?: string;
  type?: "text" | "date";
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} placeholder={placeholder} {...reg} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function LineItemsSection<
  TFieldValues extends {
    lineItems: {
      productName: string;
      description?: string;
      qty: number;
      uom: "Unit" | "Pcs" | "Set" | "Lot";
      unitPrice?: number;
    }[];
  },
>({
  fields,
  append,
  remove,
  register,
  lineItems,
  errorMessage,
  showMoney,
}: {
  fields: { id: string }[];
  append: () => void;
  remove: (index: number) => void;
  register: UseFormRegister<TFieldValues>;
  lineItems: {
    productName?: string;
    description?: string;
    qty?: number;
    uom?: string;
    unitPrice?: number;
  }[];
  errorMessage?: string;
  showMoney: boolean;
}) {
  const grandTotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0),
    0,
  );
  return (
    <div className="grid gap-2">
      <Label>Item</Label>
      <div className="grid gap-2">
        {fields.map((field, index) => {
          const li = lineItems[index];
          const rowTotal =
            (Number(li?.qty) || 0) * (Number(li?.unitPrice) || 0);
          return (
            <div
              key={field.id}
              className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border p-2"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <Input
                  aria-label={`Nama Product item ${index + 1}`}
                  placeholder="Nama Product"
                  {...register(
                    `lineItems.${index}.productName` as Path<TFieldValues>,
                  )}
                />
                <Input
                  aria-label={`Description item ${index + 1}`}
                  placeholder="Description / Deskripsi Project"
                  {...register(
                    `lineItems.${index}.description` as Path<TFieldValues>,
                  )}
                />
                <Input
                  aria-label={`Qty item ${index + 1}`}
                  type="number"
                  min={0}
                  placeholder="Qty"
                  {...register(`lineItems.${index}.qty` as Path<TFieldValues>)}
                />
                <select
                  aria-label={`UOM item ${index + 1}`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  {...register(`lineItems.${index}.uom` as Path<TFieldValues>)}
                >
                  {["Unit", "Pcs", "Set", "Lot"].map((uom) => (
                    <option key={uom} value={uom}>
                      {uom}
                    </option>
                  ))}
                </select>
                {showMoney && (
                  <>
                    <Input
                      aria-label={`Unit Price item ${index + 1}`}
                      type="number"
                      min={0}
                      placeholder="Unit Price"
                      {...register(
                        `lineItems.${index}.unitPrice` as Path<TFieldValues>,
                      )}
                    />
                    <Input
                      aria-label={`Total item ${index + 1}`}
                      disabled
                      readOnly
                      value={rowTotal.toLocaleString("id-ID")}
                    />
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
              >
                Hapus
              </Button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append()}
      >
        + Tambah item
      </Button>
      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
      {showMoney && (
        <div className="flex justify-end text-sm font-medium">
          Total: Rp {grandTotal.toLocaleString("id-ID")}
        </div>
      )}
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  error?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
