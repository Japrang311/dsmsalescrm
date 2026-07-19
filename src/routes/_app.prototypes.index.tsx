import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { CommercialViews } from "@/components/commercial/CommercialViews";
import { PROTOTYPE_STAGES } from "@/lib/business-rules";

export const Route = createFileRoute("/_app/prototypes/")({
  head: () => ({ meta: [{ title: "Prototype Requests · DSM" }] }),
  component: () => (
    <CommercialViews
      title="Prototype Requests"
      subtitle="Semua prototype: Paid (masuk revenue) & FOC (tidak masuk revenue)"
      icon={<FlaskConical className="h-5 w-5 text-primary" />}
      filter={{ sourceFlows: ["Prototype"] }}
      stages={PROTOTYPE_STAGES}
      detailBasePath="/prototypes"
      emptyHint="Belum ada permintaan prototype dari klien."
    />
  ),
});
