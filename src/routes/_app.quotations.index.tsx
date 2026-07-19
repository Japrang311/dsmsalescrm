import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { CommercialViews } from "@/components/commercial/CommercialViews";
import { RFQ_STAGES } from "@/lib/business-rules";

export const Route = createFileRoute("/_app/quotations/")({
  head: () => ({ meta: [{ title: "Quotations · DSM Sales Execution" }] }),
  component: () => (
    <CommercialViews
      title="Quotations"
      subtitle="Penawaran resmi yang dikirim ke klien"
      icon={<ReceiptText className="h-5 w-5 text-primary" />}
      filter={{ types: ["Quotation"] }}
      stages={RFQ_STAGES}
      detailBasePath="/quotations"
      emptyHint="Belum ada Quotation. Buat dari client profile atau tandai stage pada RFQ."
    />
  ),
});
