import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetailPage } from "@/components/commercial/CommercialDetailPage";

export const Route = createFileRoute("/_app/customer-po/$id")({
  head: () => ({ meta: [{ title: "Customer PO Detail · DSM" }] }),
  component: CustomerPoDetailRoute,
});

function CustomerPoDetailRoute() {
  const { id } = Route.useParams();
  return (
    <CommercialDetailPage
      itemId={id}
      backHref="/customer-po"
      backLabel="Customer PO"
    />
  );
}
