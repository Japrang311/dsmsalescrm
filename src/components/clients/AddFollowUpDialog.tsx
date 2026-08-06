import { useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { toLocalIsoDate } from "@/lib/domain";
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
import {
  recordClientFollowUp,
  type FollowUpResult,
} from "@/lib/data/follow-ups";
import { listTasks } from "@/lib/data/tasks";
import { activeClientTasks } from "@/lib/data/task-relations";
import { buildExplicitFollowUpCommand } from "@/lib/follow-up-command";
import { useClientResolution, ClientPickerField } from "./ClientPicker";

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

const schema = z.object({
  method: z.enum(METHODS),
  result: z.enum(RESULTS as [FollowUpResult, ...FollowUpResult[]]),
  fuDate: z.string().min(4, { message: "Tanggal wajib diisi" }),
  notes: z
    .string()
    .trim()
    .min(4, { message: "Catatan minimal 4 karakter" })
    .max(400, { message: "Catatan maks 400 karakter" }),
  taskMode: z.enum(["existing_task", "create_task"]),
  taskId: z.string().optional(),
  nextAction: z
    .string()
    .trim()
    .min(4, { message: "Next action minimal 4 karakter" })
    .max(160, { message: "Next action maks 160 karakter" }),
  nextActionDate: z.string().min(4, { message: "Tanggal next action wajib" }),
});

type FollowUpValues = z.infer<typeof schema>;

export function AddFollowUpDialog({
  clientId,
  clientName,
  ownerId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  clientId?: string;
  clientName?: string;
  ownerId?: string;
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
  const queryClient = useQueryClient();
  const {
    needsPicker,
    clients,
    pickedId,
    setPickedId,
    clientId: resolvedClientId,
    clientName: resolvedClientName,
    ownerId: resolvedOwnerId,
    resolved,
  } = useClientResolution({ clientId, clientName, ownerId });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: "Phone",
      result: "Interested",
      fuDate: toLocalIsoDate(new Date()),
      notes: "",
      taskMode: "create_task",
      taskId: "",
      nextAction: "",
      nextActionDate: "",
    },
  });
  const taskMode = watch("taskMode");
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: open && Boolean(resolvedClientId),
  });
  const activeTasks = resolvedClientId
    ? activeClientTasks(tasks, resolvedClientId)
    : [];

  const onSubmit = handleSubmit(async (v) => {
    if (!resolvedClientId || !resolvedOwnerId) return;
    try {
      const command = buildExplicitFollowUpCommand(
        v.taskMode === "existing_task"
          ? { mode: "existing_task", taskId: v.taskId ?? "" }
          : {
              mode: "create_task",
              createTaskTitle: `Follow-up · ${resolvedClientName}`,
              taskDueDate: v.nextActionDate,
            },
        {
          nextAction: v.nextAction,
          nextActionDate: v.nextActionDate,
          note: v.notes,
          method: v.method,
          result: v.result,
          fuDate: v.fuDate,
        },
      );
      await recordClientFollowUp({
        clientId: resolvedClientId,
        ...command,
      });
      await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Follow up tercatat", {
        description: `${resolvedClientName} · ${v.method} · ${v.result}`,
      });
      reset();
      setPickedId("");
      setOpen(false);
    } catch (error) {
      toast.error("Gagal menyimpan follow-up", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined || controlledOpen === undefined ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" variant="outline">
              <PhoneCall className="h-4 w-4" /> Add FU
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat Follow Up</DialogTitle>
          <DialogDescription>
            {resolvedClientName ?? "Pilih klien"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          {needsPicker && (
            <ClientPickerField
              clients={clients}
              value={pickedId}
              onChange={setPickedId}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Metode</Label>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
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
            <div>
              <Label>Hasil</Label>
              <Controller
                control={control}
                name="result"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
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
          </div>
          <div>
            <Label htmlFor="fuDate">Tanggal</Label>
            <Input id="fuDate" type="date" {...register("fuDate")} />
            {errors.fuDate && (
              <p className="mt-1 text-xs text-destructive">
                {errors.fuDate.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Ringkas hasil komunikasi…"
              {...register("notes")}
            />
            {errors.notes && (
              <p className="mt-1 text-xs text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <Label>Task yang diprogress</Label>
            <Controller
              control={control}
              name="taskMode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
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
                    <SelectTrigger>
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
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label htmlFor="nextAction">Next action</Label>
                <Input id="nextAction" {...register("nextAction")} />
                {errors.nextAction && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.nextAction.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="nextActionDate">Tanggal next action</Label>
                <Input
                  id="nextActionDate"
                  type="date"
                  {...register("nextActionDate")}
                />
                {errors.nextActionDate && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.nextActionDate.message}
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting || !resolved}>
              {isSubmitting ? "Menyimpan…" : "Simpan Follow Up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
