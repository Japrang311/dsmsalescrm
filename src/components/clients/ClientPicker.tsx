import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listClients } from "@/lib/data/clients";
import type { Client } from "@/lib/domain";

// Shared by every "create X for a client" dialog that can be opened either
// with a known client (from that client's own page — no picker needed) or
// without one (from the global Quick Create menu — resolves which client
// is effectively selected via a picker rendered as the form's first field).
export function useClientResolution(props: {
  clientId?: string;
  clientName?: string;
  ownerId?: string;
}) {
  const needsPicker = !props.clientId;
  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
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

export function ClientPickerField({
  clients,
  value,
  onChange,
}: {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
}) {
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <Label>Klien</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Pilih klien…" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {sorted.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
