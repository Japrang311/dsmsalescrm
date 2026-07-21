import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateClientDetails } from "@/lib/data/clients";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import type { Client } from "@/lib/domain";

// Empty string ("") is how a cleared input reaches the form — treat it the
// same as "not provided" rather than failing email validation on a blank
// field, since every contact field here is optional.
const emailField = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Format email tidak valid",
  });

const contactSchema = z.object({
  name: z.string().trim(),
  email: emailField,
  phone: z.string().trim(),
  mobile: z.string().trim(),
});

const schema = z.object({
  address: z.string().trim(),
  industry: z.string().trim(),
  website: z.string().trim(),
  notes: z.string().trim(),
  cp1: contactSchema,
  cp2: contactSchema,
  cp3: contactSchema,
});

type FormValues = z.infer<typeof schema>;

function toFormValues(client: Client): FormValues {
  const [cp1, cp2, cp3] = client.contacts;
  const toContact = (c: (typeof client.contacts)[number]) => ({
    name: c.name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
  });
  return {
    address: client.address ?? "",
    industry: client.industry ?? "",
    website: client.website ?? "",
    notes: client.notes ?? "",
    cp1: toContact(cp1),
    cp2: toContact(cp2),
    cp3: toContact(cp3),
  };
}

export function EditClientInfoDialog({
  client,
  actorName,
  open,
  onOpenChange,
}: {
  client: Client;
  actorName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(client),
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = form;

  // Re-sync the form whenever the dialog is (re)opened for this client —
  // otherwise a previous edit session's stale values would show up.
  useEffect(() => {
    if (open) reset(toFormValues(client));
  }, [open, client, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await updateClientDetails(client.id, {
        address: values.address,
        industry: values.industry,
        website: values.website,
        notes: values.notes,
        contacts: [values.cp1, values.cp2, values.cp3],
      });

      const actorId = await getCurrentActorId();
      if (actorId) {
        const changed: string[] = [];
        if (values.address !== (client.address ?? "")) changed.push("Alamat");
        if (values.industry !== (client.industry ?? ""))
          changed.push("Bidang Usaha");
        if (values.website !== (client.website ?? "")) changed.push("Website");
        if (values.notes !== (client.notes ?? "")) changed.push("Catatan");
        [values.cp1, values.cp2, values.cp3].forEach((cp, i) => {
          const before = client.contacts[i];
          const isDirty =
            cp.name !== (before.name ?? "") ||
            cp.email !== (before.email ?? "") ||
            cp.phone !== (before.phone ?? "") ||
            cp.mobile !== (before.mobile ?? "");
          if (isDirty) changed.push(`Kontak ${i + 1}`);
        });
        await logActivity({
          kind: "client_details_change",
          ownerId: updated.ownerId,
          actorId,
          clientId: client.id,
          title: `Info klien ${client.name} diperbarui`,
          detail: changed.length ? changed.join(", ") : undefined,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Info klien diperbarui");
      onOpenChange(false);
    } catch (error) {
      toast.error("Gagal menyimpan info klien", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Info Perusahaan &amp; Kontak</DialogTitle>
          <DialogDescription>
            Alamat, bidang usaha, dan hingga 3 kontak person untuk {client.name}
            . Dicatat sebagai {actorName}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-5">
          <div className="grid gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Perusahaan
            </p>
            <div>
              <Label htmlFor="address">Alamat</Label>
              <Textarea
                id="address"
                rows={2}
                placeholder="Jl. Contoh No. 1, Kota"
                {...register("address")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="industry">Bidang Usaha</Label>
                <Input
                  id="industry"
                  placeholder="Panel Maker"
                  {...register("industry")}
                />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://..."
                  {...register("website")}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="Catatan internal tentang klien ini"
                {...register("notes")}
              />
            </div>
          </div>

          {([1, 2, 3] as const).map((n) => {
            const key = `cp${n}` as const;
            return (
              <div key={key} className="grid gap-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Kontak Person {n}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`${key}-name`}>Nama</Label>
                    <Input id={`${key}-name`} {...register(`${key}.name`)} />
                  </div>
                  <div>
                    <Label htmlFor={`${key}-email`}>Email</Label>
                    <Input
                      id={`${key}-email`}
                      type="email"
                      {...register(`${key}.email`)}
                    />
                    {errors[key]?.email && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors[key]?.email?.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor={`${key}-phone`}>Telepon</Label>
                    <Input id={`${key}-phone`} {...register(`${key}.phone`)} />
                  </div>
                  <div>
                    <Label htmlFor={`${key}-mobile`}>HP</Label>
                    <Input
                      id={`${key}-mobile`}
                      {...register(`${key}.mobile`)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
