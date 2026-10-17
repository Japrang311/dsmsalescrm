import { useEffect, useRef, useState } from "react";
import { MessageSquareMore } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  recordRepeatOrderFeedback,
  type RepeatOrderCadenceItem,
} from "@/lib/data/repeat-order-cadence";
import { getErrorMessage } from "@/lib/utils";

export function RepeatOrderFeedbackDialog({
  item,
}: {
  item: RepeatOrderCadenceItem;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<"relevant" | "not_relevant">(
    "relevant",
  );
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestIdRef = useRef("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    requestIdRef.current = crypto.randomUUID();
    setFeedback(item.latestFeedback ?? "relevant");
    setReason(item.feedbackReason ?? "");
  }, [item.clientId, item.feedbackReason, item.latestFeedback, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return;

    setIsSubmitting(true);
    try {
      await recordRepeatOrderFeedback({
        requestId: requestIdRef.current || crypto.randomUUID(),
        clientId: item.clientId,
        feedback,
        reason: cleanReason,
        asOfDate: item.historyWindowEndDate,
      });
      await queryClient.invalidateQueries({
        queryKey: ["crm-repeat-order-cadence"],
      });
      toast.success("Feedback repeat-order tersimpan", {
        description: `${item.clientName} · status klien tidak berubah`,
      });
      setOpen(false);
    } catch (error) {
      toast.error("Feedback repeat-order gagal disimpan", {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
          <MessageSquareMore className="mr-1 h-3.5 w-3.5" /> Nilai sinyal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nilai sinyal repeat-order</DialogTitle>
          <DialogDescription>
            {item.clientName}. Feedback disimpan untuk pilot D05 dan tidak
            mengubah status klien.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor={`repeat-feedback-${item.clientId}`}>
              Penilaian
            </Label>
            <Select
              value={feedback}
              onValueChange={(value) =>
                setFeedback(value as "relevant" | "not_relevant")
              }
            >
              <SelectTrigger id={`repeat-feedback-${item.clientId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevant">Relevan</SelectItem>
                <SelectItem value="not_relevant">Tidak relevan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`repeat-feedback-reason-${item.clientId}`}>
              Alasan
            </Label>
            <Textarea
              id={`repeat-feedback-reason-${item.clientId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              required
              placeholder="Contoh: pola proyek musiman"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan…" : "Simpan feedback"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
