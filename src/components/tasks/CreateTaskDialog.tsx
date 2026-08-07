import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { getErrorMessage } from "@/lib/utils";
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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskCategory } from "@/lib/domain";
import { NOW } from "@/lib/domain";
import type { Role } from "@/lib/domain";
import { listClients, listSalesTeamProfiles } from "@/lib/data/clients";
import { ClientPickerField } from "@/components/clients/ClientPicker";
import { createTask } from "@/lib/data/tasks";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { useRole } from "@/context/role-context";

const METHODS = ["Phone", "Email", "WhatsApp", "Visit", "Meeting"] as const;
const PRIORITIES = ["High", "Normal", "Low"] as const;
// Default due date is tomorrow (local day), not today -- user can still edit it.
const tomorrow = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1);
const DEFAULT_DUE_DATE = [
  tomorrow.getFullYear(),
  String(tomorrow.getMonth() + 1).padStart(2, "0"),
  String(tomorrow.getDate()).padStart(2, "0"),
].join("-");
// Same 7 values as public.task_category (spec §2.1) -- Task not yet
// classified defaults to "Other", same "not yet known" meaning as its use
// elsewhere (spec §6.3).
const CATEGORIES: TaskCategory[] = [
  "Project/Opportunity Planning",
  "Client Meeting/Visit",
  "Follow-Up",
  "Quotation",
  "Sales Order",
  "Internal/Admin",
  "Other",
];

const schema = z.object({
  // Optional (spec §2.1, Task 7/52): a Task may omit Client entirely.
  clientId: z.string().optional(),
  title: z
    .string()
    .trim()
    .min(4, { message: "Judul minimal 4 karakter" })
    .max(120, { message: "Judul maks 120 karakter" }),
  method: z.enum(METHODS),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES as [TaskCategory, ...TaskCategory[]]),
  dueDate: z.string().min(4, { message: "Tanggal wajib diisi" }),
  ownerId: z.string().min(1, { message: "Owner wajib dipilih" }),
});

type FormValues = z.infer<typeof schema>;

export function CreateTaskDialog({
  role,
  defaultClientId,
  trigger,
}: {
  role: Role;
  defaultClientId?: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { authReady } = useRole();
  const queryClient = useQueryClient();

  const { data: salesTeam = [] } = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && role !== "sales",
  });
  const { data: allClients = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentActorId,
    enabled: authReady,
  });

  const defaultOwner =
    role === "sales"
      ? (currentUserId ?? "")
      : (salesTeam[0]?.id ?? currentUserId ?? "");

  // listClients() is already RLS-scoped to the caller's own clients for
  // Sales — no client-side re-filter needed (or safe to do correctly,
  // since there's no reliable "current user id" available synchronously
  // here anyway).
  const clients = useMemo(() => {
    return [...allClients].sort((a, b) => a.name.localeCompare(b.name));
  }, [allClients]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      title: "",
      method: "Phone",
      priority: "Normal",
      category: "Other",
      dueDate: DEFAULT_DUE_DATE,
      ownerId: defaultOwner,
    },
  });

  // For Sales, the Owner field below is disabled (never user-editable), so
  // it depends entirely on defaultOwner being correct. currentUserId loads
  // asynchronously and may not be ready when useForm's defaultValues are
  // taken, so sync it in once it resolves.
  useEffect(() => {
    if (role === "sales" && currentUserId) {
      setValue("ownerId", currentUserId);
    }
  }, [role, currentUserId, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const task = await createTask({
        clientId: v.clientId || undefined,
        ownerId: v.ownerId,
        title: v.title,
        method: v.method,
        priority: v.priority,
        category: v.category,
        dueDate: v.dueDate,
      });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_created",
          ownerId: v.ownerId,
          actorId,
          clientId: v.clientId || undefined,
          taskId: task.id,
          title: "Task dibuat dari inbox",
          detail: `${v.title} · due ${v.dueDate}`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    } catch (error) {
      toast.error("Gagal membuat task", {
        description: getErrorMessage(error),
      });
      return;
    }
    const client = allClients.find((c) => c.id === v.clientId);
    toast.success("Task dibuat", {
      description: `${client?.name ?? "Klien"} · ${v.title}`,
      action: client
        ? {
            label: "Buka klien",
            onClick: () => {
              window.location.href = `/clients/${client.id}`;
            },
          }
        : undefined,
    });
    reset({
      clientId: "",
      title: "",
      method: "Phone",
      priority: "Normal",
      category: "Other",
      dueDate: DEFAULT_DUE_DATE,
      ownerId: defaultOwner,
    });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Buat Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Task Baru</DialogTitle>
          <DialogDescription>
            Task akan otomatis muncul di inbox dan pada profil klien terkait.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div>
            <ClientPickerField
              clients={clients}
              value={watch("clientId") ?? ""}
              onChange={(v) =>
                setValue("clientId", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Opsional — Task boleh dibuat tanpa klien.
            </p>
            {errors.clientId && (
              <p className="mt-1 text-xs text-destructive">
                {errors.clientId.message}
              </p>
            )}
            {watch("clientId") && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: watch("clientId")! }}
                  className="hover:text-primary hover:underline"
                >
                  Lihat profil klien →
                </Link>
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="title">Judul task</Label>
            <Input
              id="title"
              placeholder="Contoh: Follow up konfirmasi PO"
              {...register("title")}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <div>
            <Label>Kategori</Label>
            <Select
              value={watch("category")}
              onValueChange={(v) =>
                setValue("category", v as FormValues["category"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Metode</Label>
              <Select
                value={watch("method")}
                onValueChange={(v) =>
                  setValue("method", v as FormValues["method"], {
                    shouldDirty: true,
                  })
                }
              >
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
            </div>
            <div>
              <Label>Prioritas</Label>
              <Select
                value={watch("priority")}
                onValueChange={(v) =>
                  setValue("priority", v as FormValues["priority"], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" type="date" {...register("dueDate")} />
              {errors.dueDate && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.dueDate.message}
                </p>
              )}
            </div>
            <div>
              <Label>Owner</Label>
              <Select
                value={watch("ownerId")}
                onValueChange={(v) =>
                  setValue("ownerId", v, { shouldDirty: true })
                }
                disabled={role === "sales"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {salesTeam.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {isSubmitting ? "Menyimpan…" : "Simpan Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
