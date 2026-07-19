import { createFileRoute } from "@tanstack/react-router";
import { Repeat } from "lucide-react";
import { CommercialViews } from "@/components/commercial/CommercialViews";
import { REPEAT_STAGES } from "@/lib/business-rules";

export const Route = createFileRoute("/_app/repeat-orders/")({
  head: () => ({ meta: [{ title: "Direct / Repeat Orders · DSM" }] }),
  component: () => (
    <CommercialViews
      title="Direct / Repeat Orders"
      subtitle="Order dari klien eksisting tanpa RFQ baru"
      icon={<Repeat className="h-5 w-5 text-primary" />}
      filter={{ sourceFlows: ["Existing / Repeat Order"] }}
      stages={REPEAT_STAGES}
      detailBasePath="/repeat-orders"
      emptyHint="Belum ada repeat order pada periode ini."
    />
  ),
});
