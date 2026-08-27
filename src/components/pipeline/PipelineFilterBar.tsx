import { Filter, User2, CalendarClock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
      <span className="flex items-center gap-1 pl-1 pr-2 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" /> Filter
      </span>

      {role !== "sales" && (
        <Select value={owner} onValueChange={onOwnerChange}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
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
        <SelectTrigger className="h-8 w-[170px] text-xs">
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
        <SelectTrigger className="h-8 w-[180px] text-xs">
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
    </div>
  );
}
