import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { CommercialViews } from "@/components/commercial/CommercialViews";
import { QUOTATION_STAGES } from "@/lib/business-rules";

export const Route = createFileRoute("/_app/quotations/")({
  head: () => ({ meta: [{ title: "Quotations · DSM Sales Execution" }] }),
  component: () => (
    <CommercialViews
      title="Quotations"
      subtitle="RFQ yang sudah dihitung dan masuk proses penawaran"
      icon={<ReceiptText className="h-5 w-5 text-primary" />}
      filter={{ types: ["RFQ", "Quotation"], stages: QUOTATION_STAGES }}
      stages={QUOTATION_STAGES}
      detailBasePath="/quotations"
      emptyHint="Belum ada penawaran. Hitung RFQ lalu lanjutkan ke proses quotation."
    />
  ),
});
