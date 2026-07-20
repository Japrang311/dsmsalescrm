import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listClients } from "@/lib/data/clients";
import type { Client } from "@/lib/domain";
import { cn } from "@/lib/utils";

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

// Searchable combobox instead of a plain dropdown — with dozens of real
// clients, scrolling a closed list to find one by eye doesn't scale;
// typing a few letters does. Only needs id/name, so it accepts both the
// full Client[] (the "create X for a client" dialogs, RLS-scoped to owned
// clients) and the minimal {id,name}[] from searchClients() (the Sales
// Order edit form, which needs to find/correct a client regardless of
// owner — see src/lib/data/clients.ts's searchClients()).
export function ClientPickerField({
  clients,
  value,
  onChange,
}: {
  clients: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  const selected = sorted.find((c) => c.id === value);

  return (
    <div>
      <Label>Klien</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn(!selected && "text-muted-foreground")}>
              {selected ? selected.name : "Pilih klien…"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder="Cari nama klien…" />
            <CommandList className="max-h-72">
              <CommandEmpty>Klien tidak ditemukan.</CommandEmpty>
              <CommandGroup>
                {sorted.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        c.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
