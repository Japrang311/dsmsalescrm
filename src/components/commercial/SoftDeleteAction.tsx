import { useState, type MouseEvent } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { softDeleteConfirmationDescription } from "./soft-delete-controls";

export function SoftDeleteAction({
  label,
  onDelete,
  onDeleted,
}: {
  label: string;
  onDelete: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function confirmDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await onDelete();
      setOpen(false);
      onDeleted();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Penghapusan gagal. Silakan coba lagi.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen);
        if (nextOpen) setError(undefined);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-1.5">
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {softDeleteConfirmationDescription(label)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => void confirmDelete(event)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Menghapus…" : "Hapus"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
