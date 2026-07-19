import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetailPage } from "@/components/commercial/CommercialDetailPage";

export const Route = createFileRoute("/_app/quotations/$id")({
  head: () => ({ meta: [{ title: "Quotation Detail · DSM" }] }),
  component: QuotationDetailRoute,
});

function QuotationDetailRoute() {
  const { id } = Route.useParams();
  return (
    <CommercialDetailPage
      itemId={id}
      backHref="/quotations"
      backLabel="Quotation"
    />
  );
}
