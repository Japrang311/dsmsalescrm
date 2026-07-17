import { createFileRoute } from "@tanstack/react-router";
import { CommercialList } from "@/components/app/commercial-list";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "PO / Sales Order · DSM" }] }),
  component: () => (
    <CommercialList
      title="PO / Sales Order"
      description="Confirmed client POs and released Sales Orders — the immediate precursor to revenue."
      types={["PO", "Sales Order", "Repeat Order Request"]}
    />
  ),
});
