import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Pencil,
  Plus,
  Save,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  UserX,
  Users,
  User2,
  Target as TargetIcon,
  Database,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRole, ROLE_LABEL } from "@/context/role-context";
import {
  RFQ_STAGES,
  REPEAT_STAGES,
  PROTOTYPE_STAGES,
} from "@/lib/business-rules";
import { CURRENT_MONTH, CURRENT_YEAR } from "@/lib/domain";
import {
  defaultUserPreferences,
  useSettings,
  settingsActions,
  type UserPreferences,
} from "@/lib/preferences-store";
import { formatRupiahShort } from "@/lib/format";
import { listSalesTeamProfiles } from "@/lib/data/clients";
import {
  listTargets,
  upsertYearlyTarget,
  type TargetsByMember,
} from "@/lib/data/targets";
import {
  getOrgSettings,
  updateOrgSettings,
  type OrgSettings,
} from "@/lib/data/org-settings";
import {
  listTeamMembers,
  createTeamMember,
  updateTeamMemberProfile,
  changeTeamMemberRole,
  deactivateTeamMember,
  reactivateTeamMember,
  transferTeamOwnership,
  deleteEligibleTeamMember,
  getCurrentProfileId,
  TeamAdminError,
  type AppRole,
  type TeamMember,
} from "@/lib/data/team";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · DSM Sales Execution" },
      {
        name: "description",
        content:
          "Kelola profil, tim, target penjualan, dan preferensi organisasi.",
      },
    ],
  }),
  component: SettingsPage,
});

const CLIENT_SOURCES = [
  "Referral",
  "Website Inquiry",
  "Business Relationship",
  "Repeat",
] as const;

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function SettingsPage() {
  const { role, authReady, realProfile } = useRole();
  const canViewTeam =
    role === "manager" || role === "executive" || role === "super_admin";
  const canManageTeam = role === "super_admin";
  const canViewBusinessSettings = canViewTeam;
  const canEditTargets = role === "manager" || role === "super_admin";
  const canEditOrg = role === "manager" || role === "super_admin";
  const queryClient = useQueryClient();

  const realSalesTeam = useQuery({
    queryKey: ["profiles", "sales-team"],
    queryFn: listSalesTeamProfiles,
    enabled: authReady && canViewBusinessSettings,
  });
  const realTargets = useQuery({
    queryKey: ["targets", "all"],
    queryFn: () => listTargets(),
    enabled: authReady && canViewBusinessSettings,
  });
  const currentProfileId = useQuery({
    queryKey: ["current-profile-id"],
    queryFn: getCurrentProfileId,
    enabled: authReady,
  });

  const currentUserId = currentProfileId.data ?? `dev:${role}`;
  const defaultProfile =
    realProfile ??
    {
      sales: { name: "Nur Iman", email: "nur@local.dsm.test" },
      manager: { name: "Hendra Wijaya", email: "hendra@local.dsm.test" },
      executive: {
        name: "Direktur Utama",
        email: "executive@local.dsm.test",
      },
      super_admin: {
        name: "Super Admin",
        email: "super-admin@dsm.co.id",
      },
    }[role];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Profil pribadi, manajemen tim, target penjualan, dan konfigurasi
            organisasi.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Login sebagai{" "}
          {ROLE_LABEL[role]}
        </Badge>
      </header>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="profile" className="gap-1.5">
            <User2 className="h-3.5 w-3.5" /> Profil
          </TabsTrigger>
          {canViewTeam && (
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Tim &amp; Role
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger value="targets" className="gap-1.5">
              <TargetIcon className="h-3.5 w-3.5" /> Target
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger value="org" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> Master Data
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab
            userId={currentUserId}
            defaultName={defaultProfile.name}
            defaultEmail={defaultProfile.email}
          />
        </TabsContent>
        {canViewTeam && (
          <TabsContent value="team">
            <TeamTab
              canManage={canManageTeam}
              currentProfileId={currentProfileId.data}
            />
          </TabsContent>
        )}
        {canViewBusinessSettings && (
          <TabsContent value="targets">
            <TargetsTab
              team={realSalesTeam.data ?? []}
              targetsByMember={realTargets.data ?? {}}
              canEdit={canEditTargets}
              onSaved={() =>
                void queryClient.invalidateQueries({ queryKey: ["targets"] })
              }
            />
          </TabsContent>
        )}
        {canViewBusinessSettings && (
          <TabsContent value="org">
            <OrgTab canEdit={canEditOrg} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

function ProfileTab({
  userId,
  defaultName,
  defaultEmail,
}: {
  userId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const settings = useSettings();
  const prefs =
    settings.preferences[userId] ??
    defaultUserPreferences(defaultName, defaultEmail);
  const [form, setForm] = useState<UserPreferences>(prefs);

  // Refresh local form when userId changes (role switch).
  const key = userId;
  useMemo(() => {
    setForm(prefs);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(form) !== JSON.stringify(prefs);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil &amp; Preferensi</CardTitle>
        <CardDescription>
          Preferensi tampilan dan informasi akun untuk user saat ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama tampilan">
            <Input
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Bahasa">
            <Select
              value={form.language}
              onValueChange={(v: UserPreferences["language"]) =>
                setForm({ ...form, language: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">Bahasa Indonesia</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Timezone">
            <Select
              value={form.timezone}
              onValueChange={(v: UserPreferences["timezone"]) =>
                setForm({ ...form, timezone: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WIB">WIB (UTC+7)</SelectItem>
                <SelectItem value="WITA">WITA (UTC+8)</SelectItem>
                <SelectItem value="WIT">WIT (UTC+9)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Format tanggal">
            <Select
              value={form.dateFormat}
              onValueChange={(v: UserPreferences["dateFormat"]) =>
                setForm({ ...form, dateFormat: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd/MM/yyyy">17/07/2026</SelectItem>
                <SelectItem value="yyyy-MM-dd">2026-07-17</SelectItem>
                <SelectItem value="dd MMM yyyy">17 Jul 2026</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Format mata uang">
            <Select
              value={form.currencyFormat}
              onValueChange={(v: UserPreferences["currencyFormat"]) =>
                setForm({ ...form, currencyFormat: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Ringkas (Rp 1,4 M)</SelectItem>
                <SelectItem value="full">Penuh (Rp 1.400.000.000)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            disabled={!dirty}
            onClick={() => setForm(prefs)}
          >
            Batal
          </Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              settingsActions.updatePreferences(userId, form);
              toast.success("Preferensi disimpan");
            }}
          >
            <Save className="mr-1.5 h-4 w-4" /> Simpan preferensi
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Team tab
// ---------------------------------------------------------------------------

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const TEAM_ROLE_LABELS: Record<AppRole, string> = {
  sales: "Sales",
  manager: "Sales Manager",
  executive: "Top Executive",
  super_admin: "Super Admin",
};

type TeamAction =
  | "change_role"
  | "deactivate"
  | "reactivate"
  | "transfer"
  | "delete";

function TeamTab({
  canManage,
  currentProfileId,
}: {
  canManage: boolean;
  currentProfileId?: string;
}) {
  const queryClient = useQueryClient();
  const {
    data: team = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["team-members"],
    queryFn: listTeamMembers,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [teamAction, setTeamAction] = useState<{
    kind: TeamAction;
    member: TeamMember;
  } | null>(null);

  const visibleTeam = team.filter(
    (member) => statusFilter === "all" || member.accountStatus === statusFilter,
  );

  const invalidateTeam = () =>
    queryClient.invalidateQueries({ queryKey: ["team-members"] });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Manajemen Tim &amp; Role</CardTitle>
          <CardDescription>
            Super Admin dan Executive tidak menjadi owner target atau data
            Sales. Ownership aktif hanya dapat dialihkan ke Sales atau Manager
            aktif.
          </CardDescription>
        </div>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Tambah anggota
              </Button>
            </DialogTrigger>
            <MemberDialog
              member={null}
              onClose={() => setAddOpen(false)}
              onSubmit={async (v) => {
                await createTeamMember({
                  name: v.name,
                  email: v.email,
                  initials: deriveInitials(v.name),
                  role: v.role,
                  password: v.password!,
                });
                await invalidateTeam();
                toast.success(`${v.name} ditambahkan`);
                setAddOpen(false);
              }}
            />
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage && (
          <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Hanya Super Admin yang dapat mengelola anggota tim dan role.
          </div>
        )}
        {isLoading ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            Memuat tim…
          </div>
        ) : isError ? (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-destructive">
                Data tim gagal dimuat.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : "Periksa koneksi atau hak akses, lalu coba lagi."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {isFetching ? "Mencoba lagi…" : "Coba lagi"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {visibleTeam.length} dari {team.length} akun
              </p>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as "all" | "active" | "inactive")
                }
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Akun aktif</SelectItem>
                  <SelectItem value="inactive">Akun nonaktif</SelectItem>
                  <SelectItem value="all">Semua akun</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ownership aktif</TableHead>
                    <TableHead>Perubahan terakhir</TableHead>
                    {canManage && (
                      <TableHead className="w-[190px] text-right">
                        Aksi
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTeam.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={canManage ? 7 : 6}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        {statusFilter === "active"
                          ? "Tidak ada akun aktif."
                          : statusFilter === "inactive"
                            ? "Tidak ada akun nonaktif."
                            : "Belum ada akun tim."}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleTeam.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {m.initials}
                          </span>
                          {m.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.role === "super_admin" ? "default" : "secondary"
                          }
                          className="capitalize"
                        >
                          {TEAM_ROLE_LABELS[m.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.accountStatus === "active"
                              ? "outline"
                              : "destructive"
                          }
                        >
                          {m.accountStatus === "active" ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {m.ownedActiveCounts.total}
                        </span>{" "}
                        total · {m.ownedActiveCounts.clients} client ·{" "}
                        {m.ownedActiveCounts.tasks} task ·{" "}
                        {m.ownedActiveCounts.commercialItems} commercial
                      </TableCell>
                      <TableCell className="max-w-[210px] text-xs text-muted-foreground">
                        {m.lastAdministrativeChange ? (
                          <div>
                            <p className="truncate text-foreground">
                              {m.lastAdministrativeChange.title}
                            </p>
                            <p className="truncate">
                              {m.lastAdministrativeChange.reason ?? "—"}
                            </p>
                            <p>
                              {new Date(
                                m.lastAdministrativeChange.createdAt,
                              ).toLocaleString("id-ID")}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditing(m)}
                              title="Edit profil"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                setTeamAction({
                                  kind: "change_role",
                                  member: m,
                                })
                              }
                              title="Ubah role"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                busyId === m.id ||
                                (m.accountStatus === "active" &&
                                  (!currentProfileId ||
                                    currentProfileId === m.id))
                              }
                              onClick={() =>
                                setTeamAction({
                                  kind:
                                    m.accountStatus === "active"
                                      ? "deactivate"
                                      : "reactivate",
                                  member: m,
                                })
                              }
                              title={
                                m.accountStatus === "active"
                                  ? "Nonaktifkan akun"
                                  : "Aktifkan kembali"
                              }
                            >
                              {m.accountStatus === "active" ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                busyId === m.id ||
                                !["sales", "manager"].includes(m.role)
                              }
                              onClick={() =>
                                setTeamAction({ kind: "transfer", member: m })
                              }
                              title="Alihkan ownership aktif"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={
                                busyId === m.id ||
                                !currentProfileId ||
                                currentProfileId === m.id
                              }
                              onClick={() =>
                                setTeamAction({ kind: "delete", member: m })
                              }
                              title="Hapus permanen jika eligible"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          {editing && (
            <MemberDialog
              member={editing}
              onClose={() => setEditing(null)}
              onSubmit={async (v) => {
                await updateTeamMemberProfile(editing.id, {
                  name: v.name,
                  initials: deriveInitials(v.name),
                });
                await invalidateTeam();
                toast.success(`${v.name} diperbarui`);
                setEditing(null);
              }}
            />
          )}
        </Dialog>
        <Dialog
          open={!!teamAction}
          onOpenChange={(open) => !open && setTeamAction(null)}
        >
          {teamAction && (
            <TeamActionDialog
              action={teamAction.kind}
              member={teamAction.member}
              team={team}
              onClose={() => setTeamAction(null)}
              onBusyChange={(busy) =>
                setBusyId(busy ? teamAction.member.id : null)
              }
              onCompleted={async () => {
                await invalidateTeam();
                setTeamAction(null);
              }}
            />
          )}
        </Dialog>
      </CardContent>
    </Card>
  );
}

function MemberDialog({
  member,
  onSubmit,
  onClose,
}: {
  member: TeamMember | null;
  onSubmit: (v: {
    name: string;
    email: string;
    role: AppRole;
    password?: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [password, setPassword] = useState("");
  const [memberRole, setMemberRole] = useState<AppRole>(
    member?.role ?? "sales",
  );
  const [submitting, setSubmitting] = useState(false);
  const valid =
    name.trim().length > 1 &&
    /.+@.+\..+/.test(email) &&
    (member || password.length >= 8);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {member ? "Edit anggota tim" : "Tambah anggota tim"}
        </DialogTitle>
        <DialogDescription>
          {member
            ? "Perubahan nama langsung berlaku di akun login. Perubahan role dilakukan melalui aksi terpisah dan wajib disertai alasan."
            : "Membuat akun login sungguhan — anggota tim bisa langsung masuk dengan email & kata sandi ini."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Nama lengkap">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Nama anggota tim"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            disabled={!!member}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@dsm.co.id"
          />
          {member && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Email tidak bisa diubah dari sini.
            </p>
          )}
        </Field>
        {!member && (
          <Field label="Kata sandi sementara">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Beritahu kata sandi ini ke anggota tim secara langsung.
            </p>
          </Field>
        )}
        {!member && (
          <Field label="Role">
            <Select
              value={memberRole}
              onValueChange={(v) => setMemberRole(v as AppRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="manager">Sales Manager</SelectItem>
                <SelectItem value="executive">Top Executive</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Batal
        </Button>
        <Button
          disabled={!valid || submitting}
          onClick={() => {
            void (async () => {
              setSubmitting(true);
              try {
                await onSubmit({
                  name: name.trim(),
                  email: email.trim(),
                  role: memberRole,
                  password: member ? undefined : password,
                });
              } catch (error) {
                toast.error(
                  member
                    ? "Gagal memperbarui anggota"
                    : "Gagal menambahkan anggota",
                  {
                    description:
                      error instanceof Error ? error.message : "Unknown error",
                  },
                );
              } finally {
                setSubmitting(false);
              }
            })();
          }}
        >
          {submitting ? "Menyimpan…" : member ? "Simpan perubahan" : "Tambah"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function referenceGuidance(error: TeamAdminError): string {
  const counts = Object.entries(error.details ?? {})
    .filter(([key, value]) => key !== "total_all" && value > 0)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`)
    .join(" · ");
  if (error.status === 409 && error.code === "ACCOUNT_HAS_REFERENCES") {
    return `${error.message}${counts ? ` ${counts}.` : ""} Gunakan Nonaktifkan Akun apabila riwayat harus tetap dipertahankan.`;
  }
  if (error.status === 409 && error.code === "ACCOUNT_HAS_OWNERSHIP") {
    return `${error.message}${counts ? ` ${counts}.` : ""} Alihkan ownership aktif ke Sales atau Manager aktif terlebih dahulu.`;
  }
  return error.message;
}

function TeamActionDialog({
  action,
  member,
  team,
  onClose,
  onBusyChange,
  onCompleted,
}: {
  action: TeamAction;
  member: TeamMember;
  team: TeamMember[];
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onCompleted: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [nextRole, setNextRole] = useState<AppRole>(member.role);
  const [destinationId, setDestinationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const destinations = team.filter(
    (candidate) =>
      candidate.id !== member.id &&
      candidate.accountStatus === "active" &&
      (candidate.role === "sales" || candidate.role === "manager"),
  );

  const title: Record<TeamAction, string> = {
    change_role: `Ubah role ${member.name}`,
    deactivate: `Nonaktifkan akun ${member.name}`,
    reactivate: `Aktifkan kembali ${member.name}`,
    transfer: `Alihkan ownership ${member.name}`,
    delete: `Hapus permanen ${member.name}`,
  };
  const valid =
    reason.trim().length > 0 &&
    (action !== "change_role" || nextRole !== member.role) &&
    (action !== "transfer" || destinationId.length > 0);

  async function submit() {
    setSubmitting(true);
    onBusyChange(true);
    try {
      switch (action) {
        case "change_role":
          await changeTeamMemberRole(member.id, nextRole, reason);
          break;
        case "deactivate":
          await deactivateTeamMember(member.id, reason);
          break;
        case "reactivate":
          await reactivateTeamMember(member.id, reason);
          break;
        case "transfer":
          await transferTeamOwnership(member.id, destinationId, reason);
          break;
        case "delete":
          await deleteEligibleTeamMember(member.id, reason);
          break;
      }
      await onCompleted();
      toast.success("Perubahan anggota tim disimpan");
    } catch (error) {
      toast.error("Perubahan anggota tim gagal", {
        description:
          error instanceof TeamAdminError
            ? referenceGuidance(error)
            : error instanceof Error
              ? error.message
              : "Unknown error",
      });
    } finally {
      onBusyChange(false);
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title[action]}</DialogTitle>
        <DialogDescription>
          {action === "delete"
            ? "Penghapusan hanya dapat dilakukan jika akun tidak memiliki referensi yang memblokir. Nonaktifkan Akun adalah pilihan default untuk mempertahankan riwayat."
            : action === "transfer"
              ? "Hanya client non-Lost, task terbuka yang belum diarsipkan, dan commercial non-terminal yang dialihkan. Riwayat tetap pada owner asal."
              : "Perubahan ini dicatat pada Activity Log dan alasan administratif wajib diisi."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {action === "change_role" && (
          <Field label="Role baru">
            <Select
              value={nextRole}
              onValueChange={(value) => setNextRole(value as AppRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEAM_ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(nextRole === "super_admin" || nextRole === "executive") && (
              <p className="mt-1 text-xs text-muted-foreground">
                Super Admin dan Executive tidak memiliki target atau ownership
                data Sales. Ownership aktif harus dialihkan sebelum role diubah.
              </p>
            )}
          </Field>
        )}
        {action === "transfer" && (
          <Field label="Tujuan ownership">
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Sales atau Manager aktif" />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name} · {TEAM_ROLE_LABELS[candidate.role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Alasan administratif">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Jelaskan alasan perubahan ini"
            maxLength={500}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Batal
        </Button>
        <Button
          variant={action === "delete" ? "destructive" : "default"}
          disabled={!valid || submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Memproses…" : "Konfirmasi"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Targets tab
// ---------------------------------------------------------------------------

type TargetSalesMember = {
  id: string;
  name: string;
  email: string;
  initials: string;
};

function TargetsTab({
  team,
  targetsByMember,
  canEdit,
  onSaved,
}: {
  team: TargetSalesMember[];
  targetsByMember: TargetsByMember;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const monthlyValueFor = (id: string) =>
    targetsByMember[id]?.[CURRENT_MONTH - 1]?.target ?? 0;
  const monthlyTotal = team.reduce((s, m) => s + monthlyValueFor(m.id), 0);
  const yearlyTotal = monthlyTotal * 12;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Target bulanan tim"
          value={formatRupiahShort(monthlyTotal)}
          hint="Auto-sum dari target per sales"
        />
        <SummaryCard
          label="Target tahunan tim"
          value={formatRupiahShort(yearlyTotal)}
          hint="Bulanan × 12"
        />
        <SummaryCard
          label="Jumlah sales aktif"
          value={String(team.length)}
          hint="Sales role only"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Target bulanan per sales</CardTitle>
          <CardDescription>
            Nilai berlaku sama untuk 12 bulan tahun {CURRENT_YEAR}. Total tim
            otomatis mengikuti perubahan.
            {!canEdit && " Hanya Sales Manager yang bisa mengubah target."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[280px]">
                    Target bulanan (Rp)
                  </TableHead>
                  <TableHead className="w-[180px] text-right">
                    Preview
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada sales.
                    </TableCell>
                  </TableRow>
                )}
                {team.map((m) => (
                  <TargetRow
                    key={m.id}
                    member={m}
                    value={monthlyValueFor(m.id)}
                    canEdit={canEdit}
                    onSaved={onSaved}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TargetRow({
  member,
  value,
  canEdit,
  onSaved,
}: {
  member: TargetSalesMember;
  value: number;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [saving, setSaving] = useState(false);
  const numeric = Number(draft.replace(/[^\d]/g, "")) || 0;
  const dirty = numeric !== value;

  return (
    <TableRow>
      <TableCell className="font-medium">{member.name}</TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rp</span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
            className="tabular-nums"
            inputMode="numeric"
            disabled={!canEdit}
          />
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={!canEdit || !dirty || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await upsertYearlyTarget(member.id, numeric);
                onSaved();
                toast.success(`Target ${member.name} disimpan`);
              } catch (error) {
                toast.error("Gagal menyimpan target", {
                  description:
                    error instanceof Error
                      ? error.message
                      : "Terjadi kesalahan.",
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            Simpan
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
        {formatRupiahShort(numeric)}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Org / Master data tab
// ---------------------------------------------------------------------------

function OrgTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data: org, isLoading } = useQuery({
    queryKey: ["org-settings"],
    queryFn: getOrgSettings,
  });
  const [form, setForm] = useState<OrgSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (org) setForm(org);
  }, [org]);

  if (isLoading || !form || !org) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        Memuat konfigurasi organisasi…
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(org);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Organisasi &amp; Periode</CardTitle>
          <CardDescription>
            Konfigurasi tingkat perusahaan yang dipakai lintas modul.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama perusahaan">
              <Input
                value={form.companyName}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm({ ...form, companyName: e.target.value })
                }
              />
            </Field>
            <Field label="Tahun fiskal">
              <Input
                type="number"
                value={form.fiscalYear}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fiscalYear: Number(e.target.value) || org.fiscalYear,
                  })
                }
              />
            </Field>
            <Field label="Tarif PPN (%)">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="30"
                value={(form.ppnRate * 100).toFixed(1)}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ppnRate: (Number(e.target.value) || 0) / 100,
                  })
                }
              />
            </Field>
            <Field label="Threshold dormant (hari tanpa FU)">
              <Input
                type="number"
                value={form.dormantThresholdDays}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    dormantThresholdDays: Number(e.target.value) || 0,
                  })
                }
              />
            </Field>
            <Field label="Risk overdue (hari)">
              <Input
                type="number"
                value={form.riskOverdueDays}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    riskOverdueDays: Number(e.target.value) || 0,
                  })
                }
              />
            </Field>
          </div>
          {canEdit && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                disabled={!dirty || saving}
                onClick={() => setForm(org)}
              >
                Batal
              </Button>
              <Button
                disabled={!dirty || saving}
                onClick={() => {
                  void (async () => {
                    setSaving(true);
                    try {
                      await updateOrgSettings(form);
                      await queryClient.invalidateQueries({
                        queryKey: ["org-settings"],
                      });
                      toast.success("Konfigurasi disimpan");
                    } catch (error) {
                      toast.error("Gagal menyimpan konfigurasi", {
                        description:
                          error instanceof Error
                            ? error.message
                            : "Unknown error",
                      });
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
              >
                <Save className="mr-1.5 h-4 w-4" />{" "}
                {saving ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Katalog referensi</CardTitle>
          <CardDescription>
            Daftar sumber lead dan stage pipeline yang dipakai sistem. Read-only
            pada prototype ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReferenceGroup
            title="Sumber lead / client"
            items={[...CLIENT_SOURCES]}
          />
          <Separator />
          <ReferenceGroup
            title="Pipeline: RFQ / New Product"
            items={[...RFQ_STAGES]}
          />
          <ReferenceGroup
            title="Pipeline: Existing / Repeat Order"
            items={[...REPEAT_STAGES]}
          />
          <ReferenceGroup
            title="Pipeline: Prototype"
            items={[...PROTOTYPE_STAGES]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ReferenceGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it} variant="outline" className="font-normal">
            {it}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
