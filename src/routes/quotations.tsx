import { createFileRoute } from "@tanstack/react-router";
import { CommercialList } from "@/components/app/commercial-list";

export const Route = createFileRoute("/quotations")({
  head: () => ({ meta: [{ title: "Quotations · DSM Sales Execution" }] }),
  component: () => (
    <CommercialList
      title="Quotations"
      description="All quotations issued to clients, tracked from draft through client PO confirmation."
      types={["Quotation"]}
    />
  ),
});
