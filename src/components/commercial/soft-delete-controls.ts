import type { Role } from "@/lib/domain";

export function canManageSoftDeletedRecord(
  role: Role,
  ownerId: string,
  currentUserId?: string,
): boolean {
  return (
    role === "manager" ||
    role === "super_admin" ||
    (role === "sales" && ownerId === currentUserId)
  );
}

export function softDeleteConfirmationDescription(label: string): string {
  return `${label} akan disembunyikan dari tampilan dan laporan aktif. Data tidak dihapus permanen dan dapat dipulihkan kembali.`;
}
