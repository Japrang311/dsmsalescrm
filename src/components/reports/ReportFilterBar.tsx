import { useMemo } from "react";
import {
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
import {
  DateRangePicker,
  type PeriodRange,
} from "@/components/dashboard/DateRangePicker";
import type { Client } from "@/lib/domain";
import type { Role } from "@/lib/domain";

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
  const clientOptions = useMemo(
    () => clients.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

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
        <Select
          value={value.clientId}
          onValueChange={(v) => onChange({ clientId: v })}
        >
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <Building2 className="h-3.5 w-3.5" />
            <SelectValue placeholder="Klien" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Semua klien</SelectItem>
            {clientOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
