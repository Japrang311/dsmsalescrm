import { createFileRoute } from "@tanstack/react-router";
import { FileCheck2 } from "lucide-react";
import { CommercialViews } from "@/components/commercial/CommercialViews";
import { RFQ_STAGES } from "@/lib/business-rules";

export const Route = createFileRoute("/_app/customer-po/")({
  head: () => ({ meta: [{ title: "Customer PO · DSM" }] }),
  component: () => (
    <CommercialViews
      title="Customer PO"
      subtitle="Referensi PO klien yang tercatat secara manual"
      icon={<FileCheck2 className="h-5 w-5 text-primary" />}
      filter={{ requireCustomerPo: true }}
      stages={RFQ_STAGES}
      detailBasePath="/customer-po"
      emptyHint="Belum ada Customer PO yang tercatat. Isi No. Customer PO di detail item."
    />
  ),
});
