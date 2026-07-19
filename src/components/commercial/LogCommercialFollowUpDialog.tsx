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
import type { CommercialItem } from "@/lib/domain";
import { useQueryClient } from "@tanstack/react-query";
import {
  updateCommercialItem,
  describeCommercialItemChanges,
} from "@/lib/data/commercial-items";
import { createTask } from "@/lib/data/tasks";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { logFollowUp, type FollowUpResult } from "@/lib/data/follow-ups";

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
    createNextTask: z.boolean(),
    updateItemNextDate: z.boolean(),
  })
  .refine((v) => !v.createNextTask || Boolean(v.nextFuDate), {
    path: ["nextFuDate"],
    message: "Wajib jika membuat task follow-up berikutnya",
  })
  .refine((v) => !v.updateItemNextDate || Boolean(v.nextFuDate), {
    path: ["nextFuDate"],
    message: "Wajib jika memperbarui next follow-up item",
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
      method: "Phone",
      result: "Interested",
      nextAction: "",
      nextFuDate: "",
      notes: "",
      createNextTask: false,
      updateItemNextDate: true,
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
        createNextTask: false,
        updateItemNextDate: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);

  const createNextTask = watch("createNextTask");
  const updateItemNextDate = watch("updateItemNextDate");

  const queryClient = useQueryClient();

  const onSubmit = handleSubmit(async (v) => {
    try {
      await logFollowUp({
        clientId: item.clientId,
        commercialItemId: item.id,
        ownerId: item.ownerId,
        fuDate: v.fuDate,
        method: v.method,
        result: v.result,
        nextAction: v.nextAction || undefined,
        nextFuDate: v.nextFuDate || undefined,
        notes: v.notes,
      });
      await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    } catch (error) {
      toast.error("Gagal menyimpan follow-up", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }

    if (
      v.updateItemNextDate &&
      v.nextFuDate &&
      v.nextFuDate !== item.nextActionDate
    ) {
      try {
        await updateCommercialItem(item.id, { nextActionDate: v.nextFuDate });
        const changes = [
          {
            field: "nextActionDate",
            from: item.nextActionDate,
            to: v.nextFuDate,
          },
        ];
        const actorId = await getCurrentActorId();
        if (actorId) {
          await logActivity({
            kind: "commercial_item_stage_change",
            ownerId: item.ownerId,
            actorId,
            clientId: item.clientId,
            commercialItemId: item.id,
            title: `${item.description} diperbarui`,
            detail: describeCommercialItemChanges(changes),
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ["commercial-items"],
        });
        await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      } catch (error) {
        toast.error("Gagal memperbarui next action date", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        return;
      }
    }

    if (v.createNextTask && v.nextFuDate) {
      try {
        const nextTask = await createTask({
          clientId: item.clientId,
          ownerId: item.ownerId,
          commercialItemId: item.id,
          title:
            v.nextAction?.trim() || `Follow-up · ${item.type} — ${clientName}`,
          dueDate: v.nextFuDate,
          method: v.method,
          priority: "Normal",
          status: "Upcoming",
        });
        const actorId = await getCurrentActorId();
        if (actorId) {
          await logActivity({
            kind: "task_created",
            ownerId: item.ownerId,
            actorId,
            clientId: item.clientId,
            commercialItemId: item.id,
            taskId: nextTask.id,
            title: "Task follow-up lanjutan dibuat",
            detail: nextTask.title,
          });
        }
        await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      } catch (error) {
        toast.error("Gagal membuat task lanjutan", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        return;
      }
    }

    toast.success("Follow-up tercatat", {
      description: `${clientName} · ${item.type} · ${v.result}${
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

          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-xs text-foreground">
              <Controller
                control={control}
                name="updateItemNextDate"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <span>
                Perbarui <b>Next follow-up</b> pada {item.type} ini ke tanggal
                di atas.
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
                        const d = new Date();
                        d.setDate(d.getDate() + 3);
                        setValue("nextFuDate", d.toISOString().slice(0, 10));
                      }
                    }}
                  />
                )}
              />
              <span>
                Buat task follow-up berikutnya (muncul di Tasks Inbox).
              </span>
            </label>
            {(createNextTask || updateItemNextDate) && !watch("nextFuDate") && (
              <p className="text-xs text-destructive">
                Isi <b>Tanggal next FU</b> terlebih dahulu.
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
              {isSubmitting ? "Menyimpan…" : "Simpan Follow-Up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
