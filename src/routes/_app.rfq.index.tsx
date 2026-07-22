import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { CommercialViews } from "@/components/commercial/CommercialViews";
import { RFQ_INTAKE_STAGES } from "@/lib/business-rules";

export const Route = createFileRoute("/_app/rfq/")({
  head: () => ({ meta: [{ title: "RFQ · DSM Sales Execution" }] }),
  component: () => (
    <CommercialViews
      title="RFQ / New Product"
      subtitle="Permintaan harga dan spesifikasi dari klien"
      icon={<FileText className="h-5 w-5 text-primary" />}
      filter={{ types: ["RFQ"], stages: RFQ_INTAKE_STAGES }}
      stages={RFQ_INTAKE_STAGES}
      detailBasePath="/rfq"
      emptyHint="Belum ada RFQ aktif. Tambahkan dari client profile → Commercial."
    />
  ),
});
