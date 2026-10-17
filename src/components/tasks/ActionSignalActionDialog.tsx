import { useEffect, useRef, useState } from "react";
import { MessageSquareMore } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  recordActionSignalAction,
  type ActionSignalItem,
} from "@/lib/data/action-signals";
import { toLocalIsoDate } from "@/lib/domain";
import { getErrorMessage } from "@/lib/utils";

type ActionChoice = "snooze" | "relevant" | "not_relevant";

export function ActionSignalActionDialog({
  signal,
  clientName,
}: {
  signal: ActionSignalItem;
  clientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ActionChoice>("snooze");
  const [reason, setReason] = useState("");
  const [snoozedUntil, setSnoozedUntil] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestIdRef = useRef("");
  const queryClient = useQueryClient();
  const today = toLocalIsoDate(new Date());

  useEffect(() => {
    if (!open) return;
    requestIdRef.current = crypto.randomUUID();
    setChoice("snooze");
    setReason("");
    setSnoozedUntil("");
  }, [open, signal.entityId, signal.ruleId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (!cleanReason || (choice === "snooze" && !snoozedUntil)) return;

    setIsSubmitting(true);
    try {
      await recordActionSignalAction(
        choice === "snooze"
          ? {
              requestId: requestIdRef.current || crypto.randomUUID(),
              entityId: signal.entityId,
              ruleId: signal.ruleId,
              actionType: "snooze",
              reason: cleanReason,
              snoozedUntil,
            }
          : {
              requestId: requestIdRef.current || crypto.randomUUID(),
              entityId: signal.entityId,
              ruleId: signal.ruleId,
              actionType: "feedback",
              reason: cleanReason,
              feedback: choice,
            },
      );
      await queryClient.invalidateQueries({ queryKey: ["crm-action-signals"] });
      toast.success(
        choice === "snooze" ? "Sinyal ditunda" : "Feedback tersimpan",
        {
          description: `${clientName} · perubahan tidak mengubah status bisnis`,
        },
      );
      setOpen(false);
    } catch (error) {
      toast.error("Aksi sinyal gagal disimpan", {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
          <MessageSquareMore className="mr-1 h-3.5 w-3.5" /> Tunda / feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Tindak lanjuti sinyal</DialogTitle>
          <DialogDescription>
            {clientName}. Aksi ini tidak mengubah stage quotation atau status
            klien.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label
              htmlFor={`signal-action-${signal.entityId}-${signal.ruleId}`}
            >
              Aksi
            </Label>
            <Select
              value={choice}
              onValueChange={(value) => setChoice(value as ActionChoice)}
            >
              <SelectTrigger
                id={`signal-action-${signal.entityId}-${signal.ruleId}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="snooze">
                  Tunda sampai tanggal tertentu
                </SelectItem>
                <SelectItem value="relevant">Relevan</SelectItem>
                <SelectItem value="not_relevant">Tidak relevan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {choice === "snooze" ? (
            <div className="grid gap-1.5">
              <Label
                htmlFor={`signal-until-${signal.entityId}-${signal.ruleId}`}
              >
                Ditunda sampai (inklusif)
              </Label>
              <Input
                id={`signal-until-${signal.entityId}-${signal.ruleId}`}
                type="date"
                min={today}
                value={snoozedUntil}
                onChange={(event) => setSnoozedUntil(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Sinyal muncul lagi keesokan hari atau lebih cepat bila ada
                progress bermakna.
              </p>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label
              htmlFor={`signal-reason-${signal.entityId}-${signal.ruleId}`}
            >
              Alasan
            </Label>
            <Textarea
              id={`signal-reason-${signal.entityId}-${signal.ruleId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              required
              placeholder="Catat konteks keputusan"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan…" : "Simpan aksi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
