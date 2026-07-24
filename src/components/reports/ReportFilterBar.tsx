import { useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Filter,
  User2,
  Building2,
  Receipt,
  Layers,
  PackageSearch,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  DateRangePicker,
  type PeriodRange,
} from "@/components/dashboard/DateRangePicker";
import type { Client } from "@/lib/domain";
import type { Role } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { filterClientOptions } from "@/components/reports/client-filter";

export type ReportFilters = {
  range: PeriodRange;
  ownerId: string; // "all" or user id
  clientId: string; // "all" or client id
  taxType: string; // "all" | "PPN" | "Non-PPN"
  source: string; // "all" | "RFQ / New Product" | "Existing / Repeat Order" | "Prototype Paid" | "Prototype FOC"
  soType: string; // "all" | "Regular" | "Prototype"
};

export function defaultReportFilters(range: PeriodRange): ReportFilters {
  return {
    range,
    ownerId: "all",
    clientId: "all",
    taxType: "all",
    source: "all",
    soType: "all",
  };
}

type Props = {
  role: Role;
  value: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  hideClient?: boolean;
  clients: Client[];
  salesTeam: { id: string; name: string }[];
};

export function ReportFilterBar({
  role,
  value,
  onChange,
  hideClient = false,
  clients,
  salesTeam,
}: Props) {
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const clientOptions = useMemo(
    () => filterClientOptions(clients, clientQuery),
    [clients, clientQuery],
  );
  const selectedClient = clients.find((client) => client.id === value.clientId);

  const setClientPickerVisibility = (open: boolean) => {
    setClientPickerOpen(open);
    if (!open) setClientQuery("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
      <span className="flex items-center gap-1 pl-1 pr-2 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" /> Filter
      </span>

      <DateRangePicker
        value={value.range}
        onChange={(r) => onChange({ range: r })}
      />

      {role !== "sales" && (
        <Select
          value={value.ownerId}
          onValueChange={(v) => onChange({ ownerId: v })}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <User2 className="h-3.5 w-3.5" />
            <SelectValue placeholder="Sales owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua sales</SelectItem>
            {salesTeam.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!hideClient && (
        <Popover
          open={clientPickerOpen}
          onOpenChange={setClientPickerVisibility}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={clientPickerOpen}
              aria-label="Filter klien"
              className="h-8 w-[220px] justify-between px-3 text-xs font-normal"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {selectedClient?.name ?? "Semua klien"}
                </span>
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Cari nama klien…"
                value={clientQuery}
                onValueChange={setClientQuery}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>Klien tidak ditemukan.</CommandEmpty>
                <CommandGroup>
                  {!clientQuery.trim() && (
                    <CommandItem
                      value="Semua klien"
                      onSelect={() => {
                        onChange({ clientId: "all" });
                        setClientPickerVisibility(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value.clientId === "all"
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      Semua klien
                    </CommandItem>
                  )}
                  {clientOptions.map((client) => (
                    <CommandItem
                      key={client.id}
                      value={client.name}
                      onSelect={() => {
                        onChange({ clientId: client.id });
                        setClientPickerVisibility(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          client.id === value.clientId
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {client.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <Select
        value={value.taxType}
        onValueChange={(v) => onChange({ taxType: v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <Receipt className="h-3.5 w-3.5" />
          <SelectValue placeholder="Pajak" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua pajak</SelectItem>
          <SelectItem value="PPN">PPN</SelectItem>
          <SelectItem value="Non-PPN">Non-PPN</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.source}
        onValueChange={(v) => onChange({ source: v })}
      >
        <SelectTrigger className="h-8 w-[190px] text-xs">
          <Layers className="h-3.5 w-3.5" />
          <SelectValue placeholder="Revenue source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua source</SelectItem>
          <SelectItem value="RFQ / New Product">RFQ / New Product</SelectItem>
          <SelectItem value="Existing / Repeat Order">
            Existing / Repeat Order
          </SelectItem>
          <SelectItem value="Prototype Paid">Prototype Paid</SelectItem>
          <SelectItem value="Prototype FOC">Prototype FOC</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.soType}
        onValueChange={(v) => onChange({ soType: v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <PackageSearch className="h-3.5 w-3.5" />
          <SelectValue placeholder="Tipe SO" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua tipe</SelectItem>
          <SelectItem value="Regular">Regular</SelectItem>
          <SelectItem value="Prototype">Prototype</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
