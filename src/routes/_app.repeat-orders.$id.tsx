import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetailPage } from "@/components/commercial/CommercialDetailPage";

export const Route = createFileRoute("/_app/repeat-orders/$id")({
  head: () => ({ meta: [{ title: "Repeat Order · DSM" }] }),
  component: RepeatOrderDetailRoute,
});

function RepeatOrderDetailRoute() {
  const { id } = Route.useParams();
  return (
    <CommercialDetailPage
      itemId={id}
      backHref="/repeat-orders"
      backLabel="Repeat Order"
    />
  );
}
