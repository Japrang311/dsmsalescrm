import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/clients/StatusBadges";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { ClientStatus } from "@/lib/domain";
import { ROLE_LABEL } from "@/context/role-context";
import type { Role } from "@/lib/domain";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientName: string;
  from: ClientStatus;
  to: ClientStatus;
  role: Role;
  actorName: string;
  onConfirm: (note?: string) => void;
};

export function ChangeStatusDialog({
  open,
  onOpenChange,
  clientName,
  from,
  to,
  role,
  actorName,
  onConfirm,
}: Props) {
  const [note, setNote] = useState("");
  const isManagerOverride =
    (role === "manager" || role === "super_admin") && from !== to;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setNote("");
        onOpenChange(v);
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi perubahan status</AlertDialogTitle>
          <AlertDialogDescription>
            Perubahan ini akan tercatat pada audit trail akun{" "}
            <span className="font-medium text-foreground">{clientName}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
            <StatusBadge status={from} />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <StatusBadge status={to} />
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              Dicatat sebagai{" "}
              <span className="font-medium text-foreground">{actorName}</span> ·{" "}
              {ROLE_LABEL[role]}
            </span>
          </div>

          {isManagerOverride && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              Perubahan ini akan ditandai sebagai <b>koreksi manajerial</b>.
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label
              htmlFor="status-note"
              className="text-xs text-muted-foreground"
            >
              Alasan / catatan {isManagerOverride ? "" : "(opsional)"}
            </Label>
            <Textarea
              id="status-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. Klien telah melakukan repeat order pada Juli 2026."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={isManagerOverride && note.trim().length === 0}
            onClick={() => {
              onConfirm(note.trim() || undefined);
              setNote("");
            }}
          >
            Konfirmasi perubahan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
