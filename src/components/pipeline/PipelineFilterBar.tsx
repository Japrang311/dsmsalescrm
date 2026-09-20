import { User2, CalendarClock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterBar, FILTER_TRIGGER_CLASS } from "@/components/shell/FilterBar";
import type { Role } from "@/lib/domain";
import type { PipelineNextWindow } from "@/lib/pipeline-next-action-filter";

type Props = {
  role: Role;
  owner: string;
  onOwnerChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  nextWindow: PipelineNextWindow;
  onNextWindowChange: (value: PipelineNextWindow) => void;
  salesTeam: { id: string; name: string }[];
};

export function PipelineFilterBar({
  role,
  owner,
  onOwnerChange,
  status,
  onStatusChange,
  nextWindow,
  onNextWindowChange,
  salesTeam,
}: Props) {
  return (
    <FilterBar
      collapsible
      activeCount={
        Number(owner !== "all") +
        Number(status !== "all") +
        Number(nextWindow !== "all")
      }
      onReset={() => {
        onOwnerChange("all");
        onStatusChange("all");
        onNextWindowChange("all");
      }}
    >
      {role !== "sales" && (
        <Select value={owner} onValueChange={onOwnerChange}>
          <SelectTrigger className={FILTER_TRIGGER_CLASS}>
            <User2 className="h-3.5 w-3.5" />
            <SelectValue placeholder="Owner" />
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

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className={FILTER_TRIGGER_CLASS}>
          <SelectValue placeholder="Client status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua status</SelectItem>
          <SelectItem value="Prospect">Prospect</SelectItem>
          <SelectItem value="Active Customer">Active Customer</SelectItem>
          <SelectItem value="Repeat Order">Repeat Order</SelectItem>
          <SelectItem value="Dormant">Dormant</SelectItem>
          <SelectItem value="Lost">Lost</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={nextWindow}
        onValueChange={(v) => onNextWindowChange(v as PipelineNextWindow)}
      >
        <SelectTrigger className={FILTER_TRIGGER_CLASS}>
          <CalendarClock className="h-3.5 w-3.5" />
          <SelectValue placeholder="Next action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua next action</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="today">Hari ini</SelectItem>
          <SelectItem value="week">7 hari ke depan</SelectItem>
          <SelectItem value="none">Tanpa next action</SelectItem>
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
