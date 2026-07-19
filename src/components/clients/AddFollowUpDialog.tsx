import { useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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
import { logFollowUp, type FollowUpResult } from "@/lib/data/follow-ups";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
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
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: "Phone",
      result: "Interested",
      fuDate: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    if (!resolvedClientId || !resolvedOwnerId) return;
    try {
      await logFollowUp({
        clientId: resolvedClientId,
        ownerId: resolvedOwnerId,
        fuDate: v.fuDate,
        method: v.method,
        result: v.result,
        notes: v.notes,
      });
      await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_status_change",
          ownerId: resolvedOwnerId,
          actorId,
          clientId: resolvedClientId,
          title: `Follow-up dicatat · ${v.result}`,
          detail: v.notes,
        });
        await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      }
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
