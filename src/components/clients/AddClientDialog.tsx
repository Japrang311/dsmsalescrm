import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

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
  listSalesTeamProfiles,
  listOwners,
  createClient,
} from "@/lib/data/clients";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { CLIENT_STATUSES } from "@/lib/business-rules";
import { useRole } from "@/context/role-context";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: "Nama klien minimal 3 karakter" })
    .max(120, { message: "Nama klien terlalu panjang" }),
  status: z.enum([
    "Prospect",
    "Active Customer",
    "Repeat Order",
    "Dormant",
    "Lost",
  ]),
  source: z.enum([
    "Referral",
    "Website Inquiry",
    "Business Relationship",
    "Repeat",
  ]),
  ownerId: z.string().min(1, { message: "Pilih sales pemilik akun" }),
  address: z.string().trim().max(500, { message: "Alamat terlalu panjang" }),
  cp1Name: z
    .string()
    .trim()
    .max(120, { message: "Contact Person 1 terlalu panjang" }),
  cp2Name: z
    .string()
    .trim()
    .max(120, { message: "Contact Person 2 terlalu panjang" }),
  cp3Name: z
    .string()
    .trim()
    .max(120, { message: "Contact Person 3 terlalu panjang" }),
});

type FormValues = z.infer<typeof schema>;

export function AddClientDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
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
  const navigate = useNavigate();
  const { role, authReady } = useRole();
  const isSales = role === "sales";
  // A sales user's own RLS-scoped profile read only ever returns their own
  // row (they can't list other sales profiles) — used to auto-assign and
  // lock the owner field to themselves instead of showing an empty picker.
  const { data: actorId } = useQuery({
    queryKey: ["current-actor-id"],
    queryFn: async () => (await getCurrentActorId()) ?? null,
    enabled: authReady && isSales,
  });
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: isSales,
  });
  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: !isSales,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      status: "Prospect",
      source: "Referral",
      ownerId: "",
      address: "",
      cp1Name: "",
      cp2Name: "",
      cp3Name: "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = form;

  useEffect(() => {
    if (isSales && actorId) {
      setValue("ownerId", actorId, { shouldValidate: true });
    }
  }, [isSales, actorId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const created = await createClient({
        name: values.name,
        source: values.source,
        ownerId: values.ownerId,
        status: values.status,
        address: values.address,
        contacts: [
          { name: values.cp1Name },
          { name: values.cp2Name },
          { name: values.cp3Name },
        ],
      });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "client_created",
          ownerId: values.ownerId,
          actorId,
          clientId: created.id,
          title: `Klien baru: ${created.name}`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Klien berhasil ditambahkan", {
        description: `${values.name} — assigned to ${
          (isSales
            ? owners[values.ownerId]?.name
            : salesTeam.find((m) => m.id === values.ownerId)?.name) ?? "-"
        }`,
        action: {
          label: "Buka klien",
          onClick: () => {
            void navigate({
              to: "/clients/$clientId",
              params: { clientId: created.id },
            });
          },
        },
      });
      reset();
      setOpen(false);
    } catch (error) {
      toast.error("Gagal menambahkan klien", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined || controlledOpen === undefined ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <Building2 className="h-4 w-4" /> Add Client
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah Klien Baru</DialogTitle>
          <DialogDescription>
            Isi informasi dasar klien. Data ini masuk ke daftar klien Anda dan
            bisa diperbarui kapan saja dari halaman profil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div>
            <Label htmlFor="name">Nama Klien</Label>
            <Input
              id="name"
              placeholder="PT Contoh Manufaktur"
              {...register("name")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} {...register("address")} />
            {errors.address && (
              <p className="mt-1 text-xs text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="cp1Name">Contact Person 1</Label>
              <Input id="cp1Name" {...register("cp1Name")} />
              {errors.cp1Name && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.cp1Name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="cp2Name">Contact Person 2</Label>
              <Input id="cp2Name" {...register("cp2Name")} />
              {errors.cp2Name && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.cp2Name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="cp3Name">Contact Person 3</Label>
              <Input id="cp3Name" {...register("cp3Name")} />
              {errors.cp3Name && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.cp3Name.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select
                value={watch("status")}
                onValueChange={(v) =>
                  setValue("status", v as FormValues["status"], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Sumber</Label>
              <Select
                value={watch("source")}
                onValueChange={(v) =>
                  setValue("source", v as FormValues["source"], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Referral">Referral</SelectItem>
                  <SelectItem value="Website Inquiry">
                    Website Inquiry
                  </SelectItem>
                  <SelectItem value="Business Relationship">
                    Business Relationship
                  </SelectItem>
                  <SelectItem value="Repeat">Repeat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Assigned Sales</Label>
            {isSales ? (
              <Input
                value={owners[actorId ?? ""]?.name ?? "Anda"}
                disabled
                readOnly
              />
            ) : (
              <Select
                value={watch("ownerId")}
                onValueChange={(v) =>
                  setValue("ownerId", v, { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih sales" />
                </SelectTrigger>
                <SelectContent>
                  {salesTeam.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.ownerId && (
              <p className="mt-1 text-xs text-destructive">
                {errors.ownerId.message}
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
              {isSubmitting ? "Menyimpan…" : "Simpan Klien"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
