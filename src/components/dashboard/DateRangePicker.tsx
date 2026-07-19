import * as React from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange as RdpDateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateShort } from "@/lib/format";
import { CURRENT_YEAR, NOW } from "@/lib/domain";

export type PeriodRange = { from: Date; to: Date };

type Props = {
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
};

const PRESETS: Array<{ label: string; range: () => PeriodRange }> = [
  {
    label: "Bulan berjalan",
    range: () => ({
      from: new Date(CURRENT_YEAR, NOW.getMonth(), 1),
      to: NOW,
    }),
  },
  {
    label: "Bulan lalu",
    range: () => ({
      from: new Date(CURRENT_YEAR, NOW.getMonth() - 1, 1),
      to: new Date(CURRENT_YEAR, NOW.getMonth(), 0),
    }),
  },
  {
    label: "Kuartal berjalan",
    range: () => {
      const q = Math.floor(NOW.getMonth() / 3);
      return { from: new Date(CURRENT_YEAR, q * 3, 1), to: NOW };
    },
  },
  {
    label: "Year to date",
    range: () => ({ from: new Date(CURRENT_YEAR, 0, 1), to: NOW }),
  },
];

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<RdpDateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  React.useEffect(() => {
    setDraft({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  const label =
    value.from && value.to
      ? `${formatDateShort(value.from)} — ${formatDateShort(value.to)}`
      : "Pilih rentang";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 font-normal text-xs")}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="tabular-nums">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
        <div className="flex flex-col gap-0 sm:flex-row">
          <div className="flex flex-col gap-1 border-b border-border p-2 sm:border-b-0 sm:border-r sm:min-w-[140px]">
            <span className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Preset
            </span>
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="h-8 justify-start text-xs font-normal"
                onClick={() => {
                  const r = p.range();
                  setDraft({ from: r.from, to: r.to });
                  onChange(r);
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={value.from}
              selected={draft}
              onSelect={setDraft}
              className={cn("p-3 pointer-events-auto")}
            />
            <div className="flex items-center justify-end gap-2 border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!draft?.from || !draft?.to}
                onClick={() => {
                  if (draft?.from && draft?.to) {
                    onChange({ from: draft.from, to: draft.to });
                    setOpen(false);
                  }
                }}
              >
                Terapkan
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
