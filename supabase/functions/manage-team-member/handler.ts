import {
  AdminHttpError,
  parseAdminAction,
  toHttpError,
  type AdminAction,
  type AppRole,
  type ErrorBody,
} from "./contracts.ts";
import { MAX_BODY_BYTES } from "./body-reader.ts";

export type AdminRequest = {
  method: string;
  authorization: string | null;
  bodyText: string;
};

export type AdminResponse = {
  status: number;
  body: ErrorBody | { id: string; action: AdminAction["action"] };
};

export type CallerProfile = {
  role: string;
  account_status: string;
};

export type AdminDependencies = {
  authenticate(accessToken: string): Promise<{ id: string } | null>;
  getCallerProfile(id: string): Promise<CallerProfile | null>;
  createAuthUser(input: {
    email: string;
    password: string;
  }): Promise<{ id: string }>;
  deleteAuthUser(id: string): Promise<void>;
  setAuthBan(id: string, banned: boolean): Promise<void>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
};

function success(id: string, action: AdminAction["action"]): AdminResponse {
  return { status: 200, body: { id, action } };
}

function accessToken(authorization: string | null): string {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    throw new AdminHttpError(
      401,
      "UNAUTHENTICATED",
      "Sesi tidak valid atau sudah kedaluwarsa. Silakan masuk kembali.",
    );
  }
  return match[1];
}

function isAlreadyRequestedStatus(error: unknown): boolean {
  return toHttpError(error).body.code === "ACCOUNT_STATUS_UNCHANGED";
}

async function createTeamMember(
  action: Extract<AdminAction, { action: "create" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  let created: { id: string };
  try {
    created = await dependencies.createAuthUser({
      email: action.email,
      password: action.password,
    });
  } catch {
    throw new AdminHttpError(
      400,
      "AUTH_CREATE_FAILED",
      "Akun Auth tidak dapat dibuat. Periksa email dan kebijakan password.",
    );
  }

  try {
    await dependencies.rpc("admin_create_team_member_profile", {
      p_actor_id: actorId,
      p_target_id: created.id,
      p_name: action.name,
      p_email: action.email,
      p_initials: action.initials,
      p_role: action.role,
    });
  } catch (databaseError) {
    try {
      await dependencies.deleteAuthUser(created.id);
    } catch {
      throw new AdminHttpError(
        502,
        "CREATE_COMPENSATION_INCOMPLETE",
        "Profil gagal dibuat dan pembersihan akun Auth belum selesai. Akun tanpa profil tetap tidak memiliki akses; administrator server harus menyelesaikan pembersihan.",
      );
    }
    throw databaseError;
  }

  return success(created.id, action.action);
}

async function updateProfile(
  action: Extract<AdminAction, { action: "update_profile" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  await dependencies.rpc("admin_update_team_member_profile", {
    p_actor_id: actorId,
    p_target_id: action.id,
    p_name: action.name,
    p_initials: action.initials,
  });
  return success(action.id, action.action);
}

async function changeRole(
  action: Extract<AdminAction, { action: "change_role" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  await dependencies.rpc("admin_change_team_member_role", {
    p_actor_id: actorId,
    p_target_id: action.id,
    p_role: action.role,
    p_reason: action.reason,
  });
  return success(action.id, action.action);
}

async function setAccountStatus(
  action: Extract<AdminAction, { action: "deactivate" | "reactivate" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  const isDeactivation = action.action === "deactivate";
  const accountStatus = isDeactivation ? "inactive" : "active";

  if (!isDeactivation) {
    try {
      await dependencies.setAuthBan(action.id, false);
    } catch {
      throw new AdminHttpError(
        502,
        "AUTH_REACTIVATION_INCOMPLETE",
        "Akun Auth belum berhasil dibuka kembali sehingga profil database tetap nonaktif. Ulangi aksi ini atau hubungi administrator server.",
      );
    }

    try {
      await dependencies.rpc("admin_set_team_member_status", {
        p_actor_id: actorId,
        p_target_id: action.id,
        p_account_status: accountStatus,
        p_reason: action.reason,
      });
    } catch (error) {
      if (isAlreadyRequestedStatus(error)) {
        return success(action.id, action.action);
      }

      // The profile is still inactive because the database transaction failed.
      // Restore the Auth ban best-effort as defense in depth; RLS remains the
      // authoritative fail-closed boundary even if this compensation fails.
      try {
        await dependencies.setAuthBan(action.id, true);
      } catch {
        // Do not replace the actionable database-reactivation error.
      }
      throw new AdminHttpError(
        502,
        "DATABASE_REACTIVATION_INCOMPLETE",
        "Akun Auth sempat dibuka, tetapi aktivasi profil database gagal. Profil tetap nonaktif; ulangi aksi ini atau hubungi administrator server.",
      );
    }

    return success(action.id, action.action);
  }

  try {
    await dependencies.rpc("admin_set_team_member_status", {
      p_actor_id: actorId,
      p_target_id: action.id,
      p_account_status: accountStatus,
      p_reason: action.reason,
    });
  } catch (error) {
    // A retry after Auth was unavailable must still be able to finish the
    // best-effort ban/unban even though the database status is already set.
    if (!isAlreadyRequestedStatus(error)) throw error;
  }

  try {
    await dependencies.setAuthBan(action.id, isDeactivation);
  } catch {
    throw new AdminHttpError(
      502,
      "AUTH_REVOCATION_INCOMPLETE",
      "Akses database sudah nonaktif, tetapi revokasi Auth belum selesai. Ulangi aksi ini; access token lama dapat tetap valid sampai masa JWT berakhir.",
    );
  }

  return success(action.id, action.action);
}

async function transferOwnership(
  action: Extract<AdminAction, { action: "transfer_ownership" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  await dependencies.rpc("admin_transfer_active_ownership", {
    p_actor_id: actorId,
    p_source_id: action.fromId,
    p_destination_id: action.toId,
    p_reason: action.reason,
  });
  return success(action.fromId, action.action);
}

async function deleteEligibleAccount(
  action: Extract<AdminAction, { action: "delete_eligible_account" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  await dependencies.rpc("admin_delete_eligible_account", {
    p_actor_id: actorId,
    p_target_id: action.id,
    p_reason: action.reason,
  });

  try {
    await dependencies.deleteAuthUser(action.id);
  } catch {
    throw new AdminHttpError(
      502,
      "AUTH_DELETE_INCOMPLETE",
      "Profil database sudah dihapus dan akun sisa tidak memiliki otorisasi RLS, tetapi penghapusan Auth belum selesai. Administrator server harus menghapus Auth user tersebut.",
    );
  }
  return success(action.id, action.action);
}

async function dispatch(
  action: AdminAction,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  switch (action.action) {
    case "create":
      return createTeamMember(action, actorId, dependencies);
    case "update_profile":
      return updateProfile(action, actorId, dependencies);
    case "change_role":
      return changeRole(action, actorId, dependencies);
    case "deactivate":
    case "reactivate":
      return setAccountStatus(action, actorId, dependencies);
    case "transfer_ownership":
      return transferOwnership(action, actorId, dependencies);
    case "delete_eligible_account":
      return deleteEligibleAccount(action, actorId, dependencies);
  }
}

export async function handleAdminRequest(
  request: AdminRequest,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  try {
    if (request.method !== "POST") {
      throw new AdminHttpError(
        405,
        "METHOD_NOT_ALLOWED",
        "Metode request tidak diizinkan.",
      );
    }

    const token = accessToken(request.authorization);
    const caller = await dependencies.authenticate(token);
    if (!caller) {
      throw new AdminHttpError(
        401,
        "UNAUTHENTICATED",
        "Sesi tidak valid atau sudah kedaluwarsa. Silakan masuk kembali.",
      );
    }

    const callerProfile = await dependencies.getCallerProfile(caller.id);
    if (
      callerProfile?.role !== "super_admin" ||
      callerProfile.account_status !== "active"
    ) {
      throw new AdminHttpError(
        403,
        "ACTIVE_SUPER_ADMIN_REQUIRED",
        "Hanya Super Admin aktif yang dapat mengelola anggota tim. Akun nonaktif harus keluar dan masuk kembali setelah diaktifkan.",
      );
    }

    if (
      new TextEncoder().encode(request.bodyText).byteLength > MAX_BODY_BYTES
    ) {
      throw new AdminHttpError(
        413,
        "REQUEST_TOO_LARGE",
        "Body request terlalu besar.",
      );
    }

    const action = parseAdminAction(request.bodyText);
    return await dispatch(action, caller.id, dependencies);
  } catch (error) {
    return toHttpError(error);
  }
}

export type { AppRole };
