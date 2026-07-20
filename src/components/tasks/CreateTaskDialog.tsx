import { useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";

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
import type { TaskStatus } from "@/lib/domain";
import { NOW } from "@/lib/domain";
import type { Role } from "@/lib/domain";
import { listClients, listSalesTeamProfiles } from "@/lib/data/clients";
import { ClientPickerField } from "@/components/clients/ClientPicker";
import { createTask } from "@/lib/data/tasks";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { useRole } from "@/context/role-context";

// Matches the local role switcher's fixed sign-in for "sales" (see
// role-context.tsx's ROLE_LOGIN) — same "act as one specific person"
// simplification used throughout the tasks pages.
const CURRENT_SALES_ID = "22222222-2222-2222-2222-222222222222";

const METHODS = ["Phone", "Email", "WhatsApp", "Visit", "Meeting"] as const;
const PRIORITIES = ["High", "Normal", "Low"] as const;

const schema = z.object({
  clientId: z.string().min(1, { message: "Pilih klien" }),
  title: z
    .string()
    .trim()
    .min(4, { message: "Judul minimal 4 karakter" })
    .max(120, { message: "Judul maks 120 karakter" }),
  method: z.enum(METHODS),
  priority: z.enum(PRIORITIES),
  dueDate: z.string().min(4, { message: "Tanggal wajib diisi" }),
  ownerId: z.string().min(1, { message: "Owner wajib dipilih" }),
});

type FormValues = z.infer<typeof schema>;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function statusFor(dueISO: string): TaskStatus {
  const due = startOfDay(new Date(dueISO));
  const today = startOfDay(NOW);
  if (due < today) return "Overdue";
  if (due === today) return "Today";
  return "Upcoming";
}

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

  const defaultOwner =
    role === "sales"
      ? CURRENT_SALES_ID
      : (salesTeam[0]?.id ?? CURRENT_SALES_ID);

  const clients = useMemo(() => {
    const scoped =
      role === "sales"
        ? allClients.filter((c) => c.ownerId === CURRENT_SALES_ID)
        : allClients;
    return [...scoped].sort((a, b) => a.name.localeCompare(b.name));
  }, [role, allClients]);

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
      dueDate: NOW.toISOString().slice(0, 10),
      ownerId: defaultOwner,
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const task = await createTask({
        clientId: v.clientId,
        ownerId: v.ownerId,
        title: v.title,
        method: v.method,
        priority: v.priority,
        dueDate: v.dueDate,
        status: statusFor(v.dueDate),
      });
      const actorId = await getCurrentActorId();
      if (actorId) {
        await logActivity({
          kind: "task_created",
          ownerId: v.ownerId,
          actorId,
          clientId: v.clientId,
          taskId: task.id,
          title: "Task dibuat dari inbox",
          detail: `${v.title} · due ${v.dueDate}`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    } catch (error) {
      toast.error("Gagal membuat task", {
        description: error instanceof Error ? error.message : "Unknown error",
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
      dueDate: NOW.toISOString().slice(0, 10),
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
              value={watch("clientId")}
              onChange={(v) =>
                setValue("clientId", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            {errors.clientId && (
              <p className="mt-1 text-xs text-destructive">
                {errors.clientId.message}
              </p>
            )}
            {watch("clientId") && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: watch("clientId") }}
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
