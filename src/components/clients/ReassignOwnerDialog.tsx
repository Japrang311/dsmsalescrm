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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ROLE_LABEL } from "@/context/role-context";
import type { Role } from "@/lib/domain";

type TeamMember = {
  id: string;
  name: string;
  initials: string;
  email: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientName: string;
  currentOwnerName: string;
  teamMembers: TeamMember[];
  role: Role;
  actorName: string;
  onConfirm: (newOwnerId: string, note?: string) => void;
};

export function ReassignOwnerDialog({
  open,
  onOpenChange,
  clientName,
  currentOwnerName,
  teamMembers,
  role,
  actorName,
  onConfirm,
}: Props) {
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");
  const [note, setNote] = useState("");

  const selectedMember = teamMembers.find((m) => m.id === selectedOwnerId);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSelectedOwnerId("");
          setNote("");
        }
        onOpenChange(v);
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign / Handover Klien</AlertDialogTitle>
          <AlertDialogDescription>
            Pindahkan{" "}
            <span className="font-medium text-foreground">{clientName}</span>{" "}
            ke sales lain. Perubahan ini akan tercatat pada audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3 text-xs">
            <span className="font-medium">{currentOwnerName}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-primary">
              {selectedMember?.name ?? "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              Pilih sales tujuan
            </Label>
            <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Pilih sales..." />
              </SelectTrigger>
              <SelectContent>
                {teamMembers
                  .filter((m) => m.id !== undefined)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              Dicatat sebagai{" "}
              <span className="font-medium text-foreground">{actorName}</span> ·{" "}
              {ROLE_LABEL[role]}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Label
              htmlFor="reassign-note"
              className="text-xs text-muted-foreground"
            >
              Alasan / catatan (opsional)
            </Label>
            <Textarea
              id="reassign-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. Klien dipindahkan ke sales yang lebih dekat dengan lokasi."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedOwnerId}
            onClick={() => {
              onConfirm(selectedOwnerId, note.trim() || undefined);
              setSelectedOwnerId("");
              setNote("");
            }}
          >
            Konfirmasi reassign
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
