import { useEffect, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";

import { getErrorMessage } from "@/lib/utils";
import { invalidateFollowUpQueries } from "@/lib/query-invalidation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toLocalIsoDate, type CommercialItem } from "@/lib/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listTasks } from "@/lib/data/tasks";
import { activeCommercialTasks } from "@/lib/data/task-relations";
import {
  recordCommercialFollowUp,
  type FollowUpResult,
} from "@/lib/data/follow-ups";
import { buildExplicitFollowUpCommand } from "@/lib/follow-up-command";

const METHODS = ["Phone", "Email", "WhatsApp", "Visit", "Meeting"] as const;
const RESULTS: FollowUpResult[] = [
  "No Response",
  "Interested",
  "Need Quotation",
  "Quotation Sent",
  "Negotiation",
  "Waiting PO",
  "PO Confirmed",
  "Not Interested",
  "Follow-up Later",
];

const schema = z
  .object({
    fuDate: z.string().min(4, { message: "Tanggal FU wajib" }),
    method: z.enum(METHODS),
    result: z.enum(RESULTS as [FollowUpResult, ...FollowUpResult[]]),
    nextAction: z.string().max(160).optional().or(z.literal("")),
    nextFuDate: z.string().optional().or(z.literal("")),
    notes: z
      .string()
      .trim()
      .min(4, { message: "Catatan minimal 4 karakter" })
      .max(600),
    taskMode: z.enum(["existing_task", "create_task"]),
    taskId: z.string().optional(),
  })
  .refine((v) => Boolean(v.nextAction?.trim()), {
    path: ["nextAction"],
    message: "Next action wajib",
  })
  .refine((v) => Boolean(v.nextFuDate), {
    path: ["nextFuDate"],
    message: "Tanggal next action wajib",
  });

type FormValues = z.infer<typeof schema>;

export function LogCommercialFollowUpDialog({
  item,
  clientName,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  item: CommercialItem;
  clientName: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setUncontrolled(o);
  };

  const today = toLocalIsoDate(new Date());

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fuDate: today,
      method: "Phone",
      result: "Interested",
      nextAction: "",
      nextFuDate: "",
      notes: "",
      taskMode: "create_task",
      taskId: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        fuDate: today,
        method: "Phone",
        result: "Interested",
        nextAction: "",
        nextFuDate: "",
        notes: "",
        taskMode: "create_task",
        taskId: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);

  const taskMode = watch("taskMode");

  const queryClient = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: open,
  });
  const activeTasks = activeCommercialTasks(tasks, item.id);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const command = buildExplicitFollowUpCommand(
        v.taskMode === "existing_task"
          ? { mode: "existing_task", taskId: v.taskId ?? "" }
          : {
              mode: "create_task",
              createTaskTitle:
                v.nextAction?.trim() ||
                `Follow-up · ${item.type} — ${clientName}`,
              taskDueDate: v.nextFuDate ?? "",
            },
        {
          nextAction: v.nextAction ?? "",
          nextActionDate: v.nextFuDate ?? "",
          note: v.notes,
          method: v.method,
          result: v.result,
          fuDate: v.fuDate,
        },
      );
      await recordCommercialFollowUp({
        commercialDocumentId: item.id,
        ...command,
      });
      await invalidateFollowUpQueries(queryClient);
      toast.success("Follow-up tercatat", {
        description: `${clientName} · ${item.type} · ${v.result} · Task diprogress`,
      });
      setOpen(false);
    } catch (error) {
      toast.error("Gagal menyimpan follow-up", {
        description: getErrorMessage(error),
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined || controlledOpen === undefined ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" variant="outline" className="gap-1.5">
              <PhoneCall className="h-4 w-4" /> Log Follow-Up
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Log Follow-Up · {item.type}</DialogTitle>
          <DialogDescription>
            {clientName} · {item.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfu-date" className="text-xs">
                Tanggal FU
              </Label>
              <Input
                id="cfu-date"
                type="date"
                className="h-9"
                {...register("fuDate")}
              />
              {errors.fuDate && (
                <p className="text-xs text-destructive">
                  {errors.fuDate.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Metode</Label>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Hasil FU</Label>
            <Controller
              control={control}
              name="result"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULTS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfu-next-action" className="text-xs">
              Next action
            </Label>
            <Input
              id="cfu-next-action"
              className="h-9"
              placeholder="cth. Kirim revisi drawing, siapkan sample…"
              {...register("nextAction")}
            />
            {errors.nextAction && (
              <p className="text-xs text-destructive">
                {errors.nextAction.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfu-next-date" className="text-xs">
              Tanggal next FU
            </Label>
            <Input
              id="cfu-next-date"
              type="date"
              className="h-9"
              {...register("nextFuDate")}
            />
            {errors.nextFuDate && (
              <p className="text-xs text-destructive">
                {errors.nextFuDate.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfu-notes" className="text-xs">
              Catatan
            </Label>
            <Textarea
              id="cfu-notes"
              rows={3}
              placeholder="Ringkas hasil komunikasi, komitmen customer, blocker…"
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-xs text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <Separator />

          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-xs">Task yang diprogress</Label>
            <Controller
              control={control}
              name="taskMode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_task">Buat Task baru</SelectItem>
                    <SelectItem
                      value="existing_task"
                      disabled={activeTasks.length === 0}
                    >
                      Progress Task existing
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {taskMode === "existing_task" && (
              <Controller
                control={control}
                name="taskId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pilih Task aktif" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title} · {task.dueDate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Follow-up, progress Task, dan activity audit disimpan lewat satu
              transaksi atomic.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan…" : "Simpan Follow-Up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
