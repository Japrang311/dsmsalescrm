import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchClients } from "@/lib/data/clients";

// Uses searchClients() (client_search_index) instead of listClients()
// (clients table with ownership RLS) so that the picker shows ALL clients
// regardless of owner. This fixes the owner-mismatch case where a SO was
// imported under one sales rep but its client is registered to another —
// the client didn't appear in the picker because clients_select RLS hid it.
export function useClientResolution(props: {
  clientId?: string;
  clientName?: string;
  ownerId?: string;
}) {
  const needsPicker = !props.clientId;
  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "search"],
    queryFn: searchClients,
    enabled: needsPicker,
  });
  const [pickedId, setPickedId] = useState("");
  const picked = clients.find((c) => c.id === pickedId);

  const clientId = props.clientId ?? picked?.id;
  const clientName = props.clientId ? props.clientName : picked?.name;
  const ownerId = props.clientId ? props.ownerId : picked?.ownerId;

  return {
    needsPicker,
    clients,
    pickedId,
    setPickedId,
    clientId,
    clientName,
    ownerId,
    resolved: !!clientId && !!ownerId,
  };
}
