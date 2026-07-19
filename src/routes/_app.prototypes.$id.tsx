import { createFileRoute } from "@tanstack/react-router";
import { CommercialDetailPage } from "@/components/commercial/CommercialDetailPage";

export const Route = createFileRoute("/_app/prototypes/$id")({
  head: () => ({ meta: [{ title: "Prototype Detail · DSM" }] }),
  component: PrototypeDetailRoute,
});

function PrototypeDetailRoute() {
  const { id } = Route.useParams();
  return (
    <CommercialDetailPage
      itemId={id}
      backHref="/prototypes"
      backLabel="Prototype"
    />
  );
}
