import { createFileRoute } from "@tanstack/react-router";
import { CommercialList } from "@/components/app/commercial-list";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Sales Order · DSM" }] }),
  component: () => (
    <CommercialList
      title="Sales Order"
      description="Released Sales Orders — the immediate precursor to revenue."
      types={["PO", "Sales Order", "Repeat Order Request"]}
    />
  ),
});
