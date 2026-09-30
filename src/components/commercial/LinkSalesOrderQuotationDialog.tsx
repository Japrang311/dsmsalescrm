import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { CommercialItem } from "@/lib/domain";
import {
  linkSalesOrderToQuotation,
  type SalesOrderDocument,
} from "@/lib/data/sales-orders";
import {
  eligibleQuotationsForSalesOrder,
  eligibleSalesOrdersForQuotation,
  manualCommercialLinkErrorMessage,
  productNameSummary,
} from "@/lib/commercial-linking";
import { formatDateShort, formatRupiahShort } from "@/lib/format";

type SharedProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
};

type SalesOrderEntryProps = SharedProps & {
  mode: "sales-order";
  salesOrder: SalesOrderDocument;
  quotations: readonly CommercialItem[];
  allSalesOrders: readonly SalesOrderDocument[];
  quotation?: never;
  salesOrders?: never;
};

type QuotationEntryProps = SharedProps & {
  mode: "quotation";
  quotation: CommercialItem;
  salesOrders: readonly SalesOrderDocument[];
  salesOrder?: never;
  quotations?: never;
  allSalesOrders?: never;
};

export type LinkSalesOrderQuotationDialogProps =
  SalesOrderEntryProps | QuotationEntryProps;

export function LinkSalesOrderQuotationDialog(
  props: LinkSalesOrderQuotationDialogProps,
) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fromSalesOrder = props.mode === "sales-order";

  useEffect(() => {
    if (props.open) setSelectedId("");
  }, [props.open, fromSalesOrder]);

  const quotationCandidates =
    props.mode === "sales-order"
      ? eligibleQuotationsForSalesOrder(
          props.quotations,
          props.allSalesOrders,
          props.salesOrder,
        )
      : [];
  const salesOrderCandidates =
    props.mode === "quotation"
      ? eligibleSalesOrdersForQuotation(props.quotation, props.salesOrders)
      : [];
  const hasCandidates = fromSalesOrder
    ? quotationCandidates.length > 0
    : salesOrderCandidates.length > 0;

  async function submit() {
    if (!selectedId) return;
    const salesOrderId =
      props.mode === "sales-order" ? props.salesOrder.id : selectedId;
    const quotationId =
      props.mode === "sales-order" ? selectedId : props.quotation.id;
    setIsSubmitting(true);
    try {
      await linkSalesOrderToQuotation({ salesOrderId, quotationId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial-items"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial-documents"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-log"] }),
      ]);
      toast.success("Quotation dan Sales Order terhubung");
      props.onOpenChange(false);
      props.onLinked?.();
    } catch (error) {
      toast.error("Gagal menghubungkan dokumen", {
        description: manualCommercialLinkErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.mode === "sales-order"
              ? "Link Quotation"
              : "Link Sales Order"}
          </DialogTitle>
          <DialogDescription>
            {props.mode === "sales-order"
              ? `${props.salesOrder.soNumber} hanya dapat dihubungkan ke satu Quotation Closed Won dari klien yang sama.`
              : `${props.quotation.quotationNumber ?? "Quotation"} hanya dapat dihubungkan ke satu SO released dari klien yang sama.`}
          </DialogDescription>
        </DialogHeader>

        {hasCandidates ? (
          <RadioGroup
            value={selectedId}
            onValueChange={setSelectedId}
            aria-label={
              props.mode === "sales-order"
                ? "Pilih Quotation Closed Won"
                : "Pilih Sales Order released"
            }
            className="max-h-72 gap-2 overflow-y-auto pr-1"
          >
            {props.mode === "sales-order"
              ? quotationCandidates.map((quotation) => (
                  <Label
                    key={quotation.id}
                    htmlFor={`link-quotation-${quotation.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:border-primary/50"
                  >
                    <RadioGroupItem
                      id={`link-quotation-${quotation.id}`}
                      value={quotation.id}
                      className="mt-0.5"
                    />
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">
                        {productNameSummary(
                          quotation.lineItems,
                          quotation.projectName || quotation.description,
                        )}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        {quotation.quotationNumber ?? "Tanpa nomor quotation"}
                      </span>
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {formatRupiahShort(quotation.estimatedValue)}
                      </span>
                    </span>
                  </Label>
                ))
              : salesOrderCandidates.map((salesOrder) => (
                  <Label
                    key={salesOrder.id}
                    htmlFor={`link-sales-order-${salesOrder.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:border-primary/50"
                  >
                    <RadioGroupItem
                      id={`link-sales-order-${salesOrder.id}`}
                      value={salesOrder.id}
                      className="mt-0.5"
                    />
                    <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">
                        {productNameSummary(
                          salesOrder.items,
                          salesOrder.soNumber,
                        )}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        {salesOrder.soNumber} ·{" "}
                        {formatDateShort(salesOrder.date)} · {salesOrder.type}
                      </span>
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {salesOrder.value === null
                          ? "FOC"
                          : formatRupiahShort(salesOrder.value)}
                      </span>
                    </span>
                  </Label>
                ))}
          </RadioGroup>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {props.mode === "sales-order"
              ? "Tidak ada Quotation Closed Won aktif dari klien ini yang belum terhubung ke SO."
              : "Tidak ada SO released dari klien ini yang belum terhubung ke Quotation."}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!selectedId || isSubmitting}
          >
            {isSubmitting ? "Memproses…" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
