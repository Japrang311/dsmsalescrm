import { useEffect, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { Task, ClientStatus } from "@/lib/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listClients } from "@/lib/data/clients";
import { listCommercialItems } from "@/lib/data/commercial-items";
import { createTask, updateTask } from "@/lib/data/tasks";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { logFollowUp, type FollowUpResult } from "@/lib/data/follow-ups";
import { useRole } from "@/context/role-context";

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
const CUSTOMER_STATUSES: ClientStatus[] = [
  "Prospect",
  "Active Customer",
  "Repeat Order",
  "Dormant",
  "Lost",
];

const schema = z
  .object({
    fuDate: z.string().min(4, { message: "Tanggal FU wajib" }),
    method: z.enum(METHODS),
    result: z.enum(RESULTS as [FollowUpResult, ...FollowUpResult[]]),
    nextAction: z.string().max(160).optional().or(z.literal("")),
    nextFuDate: z.string().optional().or(z.literal("")),
    customerStatus: z
      .enum(CUSTOMER_STATUSES as [ClientStatus, ...ClientStatus[]])
      .optional(),
    potentialValue: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d+$/.test(v), {
        message: "Angka saja (tanpa titik/koma)",
      }),
    notes: z
      .string()
      .trim()
      .min(4, { message: "Catatan minimal 4 karakter" })
      .max(600, { message: "Catatan maks 600 karakter" }),
    markDone: z.boolean(),
    createNextTask: z.boolean(),
  })
  .refine((v) => !v.createNextTask || Boolean(v.nextFuDate), {
    path: ["nextFuDate"],
    message: "Wajib jika membuat task follow-up berikutnya",
  });

type FormValues = z.infer<typeof schema>;

export function LogFollowUpDialog({
  task,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  task: Task;
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

  const { authReady } = useRole();
  const queryClient = useQueryClient();
  const { data: allClients = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: commercialItems = [] } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const client = allClients.find((c) => c.id === task.clientId);
  const commercial = task.commercialItemId
    ? commercialItems.find((c) => c.id === task.commercialItemId)
    : undefined;

  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fuDate: today,
      method: task.method,
      result: "Interested",
      nextAction: "",
      nextFuDate: "",
      customerStatus: undefined,
      potentialValue: commercial ? String(commercial.estimatedValue) : "",
      notes: "",
      markDone: true,
      createNextTask: false,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        fuDate: today,
        method: task.method,
        result: "Interested",
        nextAction: "",
        nextFuDate: "",
        customerStatus: undefined,
        potentialValue: commercial ? String(commercial.estimatedValue) : "",
        notes: "",
        markDone: true,
        createNextTask: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id]);

  const createNextTask = watch("createNextTask");

  const onSubmit = handleSubmit(async (v) => {
    try {
      await logFollowUp({
        taskId: task.id,
        clientId: task.clientId,
        commercialItemId: task.commercialItemId,
        ownerId: task.ownerId,
        fuDate: v.fuDate,
        method: v.method,
        result: v.result,
        nextAction: v.nextAction || undefined,
        nextFuDate: v.nextFuDate || undefined,
        customerStatus: v.customerStatus,
        potentialValue: v.potentialValue ? Number(v.potentialValue) : undefined,
        notes: v.notes,
      });

      const actorId = await getCurrentActorId();

      if (v.markDone) {
        await updateTask(task.id, { status: "Done" });
        if (actorId) {
          await logActivity({
            kind: "task_status_change",
            ownerId: task.ownerId,
            actorId,
            clientId: task.clientId,
            taskId: task.id,
            title: "Status → Done (via FU)",
          });
        }
      }

      if (v.createNextTask && v.nextFuDate) {
        const nextTask = await createTask({
          clientId: task.clientId,
          ownerId: task.ownerId,
          commercialItemId: task.commercialItemId,
          title:
            v.nextAction?.trim() ||
            `Follow-up lanjutan · ${client?.name ?? ""}`,
          dueDate: v.nextFuDate,
          method: v.method,
          priority: task.priority,
          status: "Upcoming",
        });
        if (actorId) {
          await logActivity({
            kind: "task_created",
            ownerId: task.ownerId,
            actorId,
            clientId: task.clientId,
            taskId: nextTask.id,
            title: "Task follow-up lanjutan dibuat",
            detail: nextTask.title,
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    } catch (error) {
      toast.error("Gagal menyimpan follow-up", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }

    toast.success("Follow-up tercatat", {
      description: `${client?.name ?? "Klien"} · ${v.result}${
        v.createNextTask ? " · task lanjutan dibuat" : ""
      }`,
    });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined || controlledOpen === undefined ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" variant="outline">
              <PhoneCall className="mr-1 h-4 w-4" /> Log FU
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Update Follow-Up</DialogTitle>
          <DialogDescription>
            {client?.name}
            {commercial
              ? ` · ${commercial.type} — ${commercial.description}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fu-date" className="text-xs">
                Tanggal FU
              </Label>
              <Input
                id="fu-date"
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
              <Label className="text-xs">Metode FU</Label>
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
            <Label htmlFor="fu-next-action" className="text-xs">
              Next action
            </Label>
            <Input
              id="fu-next-action"
              className="h-9"
              placeholder="cth. Kirim revisi drawing, siapkan sample…"
              {...register("nextAction")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fu-next-date" className="text-xs">
                Tanggal next FU
              </Label>
              <Input
                id="fu-next-date"
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
              <Label className="text-xs">Status customer</Label>
              <Controller
                control={control}
                name="customerStatus"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(v) =>
                      field.onChange(
                        v === "__none" ? undefined : (v as ClientStatus),
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="— tidak berubah —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— tidak berubah —</SelectItem>
                      {CUSTOMER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fu-pot" className="text-xs">
              Potensi nilai / order (Rp)
            </Label>
            <Input
              id="fu-pot"
              inputMode="numeric"
              className="h-9"
              placeholder="cth. 250000000"
              {...register("potentialValue")}
            />
            {errors.potentialValue && (
              <p className="text-xs text-destructive">
                {errors.potentialValue.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fu-notes" className="text-xs">
              Catatan
            </Label>
            <Textarea
              id="fu-notes"
              rows={3}
              placeholder="Ringkas hasil komunikasi, komitmen customer, blocker…"
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-xs text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-xs text-foreground">
              <Controller
                control={control}
                name="markDone"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <span>
                Tandai task saat ini sebagai <b>Done</b>.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <Controller
                control={control}
                name="createNextTask"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => {
                      field.onChange(v === true);
                      if (v === true && !watch("nextFuDate")) {
                        // pre-fill +3 days if empty
                        const d = new Date();
                        d.setDate(d.getDate() + 3);
                        setValue("nextFuDate", d.toISOString().slice(0, 10));
                      }
                    }}
                  />
                )}
              />
              <span>
                Buat task follow-up berikutnya dengan tanggal & next action di
                atas.
              </span>
            </label>
            {createNextTask && !watch("nextFuDate") && (
              <p className="text-xs text-destructive">
                Isi <b>Tanggal next FU</b> untuk membuat task lanjutan.
              </p>
            )}
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
              {isSubmitting ? "Menyimpan…" : "Simpan FU"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
