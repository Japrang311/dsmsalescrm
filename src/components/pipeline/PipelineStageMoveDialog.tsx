import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NOW,
  type CommercialItem,
  type QuotationLostReason,
  type Task,
} from "@/lib/domain";
import { activeCommercialTasks } from "@/lib/data/task-relations";
import { QUOTATION_LOST_REASONS } from "@/lib/data/quotation-lost-reasons";

function addDaysISO(base: string | Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PendingPipelineMove = {
  itemId: string;
  fromStage: string;
  toStage: string;
  clientName: string;
  currentNext?: string;
};

type Props = {
  pendingMove: PendingPipelineMove | null;
  pendingMoveItem: CommercialItem | undefined;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  nextActionInput: string;
  onNextActionInputChange: (value: string) => void;
  nextDateInput: string;
  onNextDateInputChange: (value: string) => void;
  taskMode: "existing_task" | "create_task";
  onTaskModeChange: (mode: "existing_task" | "create_task") => void;
  taskIdInput: string;
  onTaskIdInputChange: (value: string) => void;
  collectsLostReason: boolean;
  lostReason: QuotationLostReason | "";
  onLostReasonChange: (reason: QuotationLostReason) => void;
  lostReasonDetail: string;
  onLostReasonDetailChange: (detail: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PipelineStageMoveDialog({
  pendingMove,
  pendingMoveItem,
  onOpenChange,
  tasks,
  nextActionInput,
  onNextActionInputChange,
  nextDateInput,
  onNextDateInputChange,
  taskMode,
  onTaskModeChange,
  taskIdInput,
  onTaskIdInputChange,
  collectsLostReason,
  lostReason,
  onLostReasonChange,
  lostReasonDetail,
  onLostReasonDetailChange,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Dialog open={pendingMove !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pindahkan pipeline stage</DialogTitle>
          <DialogDescription>
            Update stage dan next action untuk{" "}
            <span className="font-medium text-foreground">
              {pendingMove?.clientName}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {pendingMove && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs">
              <span className="rounded-md border bg-background px-2 py-1 font-medium">
                {pendingMove.fromStage}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="rounded-md border border-primary/40 bg-primary-soft px-2 py-1 font-medium text-primary">
                {pendingMove.toStage}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="next-action-text" className="text-xs">
                Next action
              </Label>
              <Input
                id="next-action-text"
                value={nextActionInput}
                onChange={(e) => onNextActionInputChange(e.target.value)}
                className="h-9 text-sm"
                placeholder="cth. Kirim revisi quotation"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="next-action-date" className="text-xs">
                Next action date
              </Label>
              <Input
                id="next-action-date"
                type="date"
                value={nextDateInput}
                onChange={(e) => onNextDateInputChange(e.target.value)}
                className="h-9 text-sm"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: "Hari ini", days: 0 },
                  { label: "+1 hari", days: 1 },
                  { label: "+3 hari", days: 3 },
                  { label: "+7 hari", days: 7 },
                ].map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                      onNextDateInputChange(addDaysISO(NOW, p.days))
                    }
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            {pendingMoveItem && (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                <Label className="text-xs">Task yang diprogress</Label>
                <Select
                  value={taskMode}
                  onValueChange={(value) =>
                    onTaskModeChange(value as "existing_task" | "create_task")
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_task">Buat Task baru</SelectItem>
                    <SelectItem
                      value="existing_task"
                      disabled={
                        activeCommercialTasks(tasks, pendingMoveItem.id)
                          .length === 0
                      }
                    >
                      Progress Task existing
                    </SelectItem>
                  </SelectContent>
                </Select>
                {taskMode === "existing_task" && (
                  <Select
                    value={taskIdInput}
                    onValueChange={onTaskIdInputChange}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pilih Task aktif" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCommercialTasks(tasks, pendingMoveItem.id).map(
                        (task) => (
                          <SelectItem key={task.id} value={task.id}>
                            {task.title} · {task.dueDate}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {collectsLostReason && (
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-lost-reason">
                    Alasan closed lost
                  </Label>
                  <Select
                    value={lostReason}
                    onValueChange={(value) =>
                      onLostReasonChange(value as QuotationLostReason)
                    }
                  >
                    <SelectTrigger id="pipeline-lost-reason">
                      <SelectValue placeholder="Pilih alasan lost" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUOTATION_LOST_REASONS.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-lost-reason-detail">
                    Detail alasan
                    {lostReason === "Lainnya" ? " (wajib)" : " (opsional)"}
                  </Label>
                  <Textarea
                    id="pipeline-lost-reason-detail"
                    value={lostReasonDetail}
                    onChange={(event) =>
                      onLostReasonDetailChange(event.target.value)
                    }
                    placeholder="Tambahkan konteks untuk analisis"
                    className="min-h-20"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Batal
          </Button>
          <Button onClick={onConfirm}>Konfirmasi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
