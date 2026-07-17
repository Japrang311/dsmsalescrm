import { createFileRoute } from "@tanstack/react-router";
import { CommercialList } from "@/components/app/commercial-list";

export const Route = createFileRoute("/rfq")({
  head: () => ({ meta: [{ title: "RFQ · DSM Sales Execution" }] }),
  component: () => (
    <CommercialList
      title="RFQ"
      description="Incoming request for quotation from clients — the starting point of the New RFQ flow."
      types={["RFQ"]}
    />
  ),
});
