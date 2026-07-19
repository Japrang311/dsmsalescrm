import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetailPage } from "@/components/commercial/CommercialDetailPage";

export const Route = createFileRoute("/_app/rfq/$id")({
  head: () => ({ meta: [{ title: "RFQ Detail · DSM" }] }),
  component: RfqDetailRoute,
});

function RfqDetailRoute() {
  const { id } = Route.useParams();
  return <CommercialDetailPage itemId={id} backHref="/rfq" backLabel="RFQ" />;
}
