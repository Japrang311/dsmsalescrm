export type AppRole = "sales" | "manager" | "executive" | "super_admin";

export type AdminAction =
  | {
      action: "create";
      name: string;
      email: string;
      initials: string;
      role: AppRole;
      password: string;
    }
  | {
      action: "update_profile";
      id: string;
      name: string;
      initials: string;
    }
  | {
      action: "change_role";
      id: string;
      role: AppRole;
      reason: string;
    }
  | {
      action: "deactivate" | "reactivate";
      id: string;
      reason: string;
    }
  | {
      action: "transfer_ownership";
      fromId: string;
      toId: string;
      reason: string;
    }
  | {
      action: "delete_eligible_account";
      id: string;
      reason: string;
    };

export type ErrorBody = {
  error: string;
  code: string;
  details?: Record<string, number>;
};

export type HttpError = {
  status: number;
  body: ErrorBody;
};

type UnknownRecord = Record<string, unknown>;

const APP_ROLES = new Set<AppRole>([
  "sales",
  "manager",
  "executive",
  "super_admin",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DATABASE_ERRORS: Record<string, { status: number; message: string }> = {
  ACTIVE_SUPER_ADMIN_REQUIRED: {
    status: 403,
    message: "Hanya Super Admin aktif yang dapat mengelola anggota tim.",
  },
  ADMINISTRATIVE_REASON_REQUIRED: {
    status: 400,
    message: "Alasan administratif wajib diisi.",
  },
  PROFILE_FIELDS_REQUIRED: {
    status: 400,
    message: "Nama dan inisial anggota tim wajib diisi.",
  },
  INVALID_OWNERSHIP_SOURCE: {
    status: 400,
    message: "Sumber ownership harus berupa akun Sales atau Manager.",
  },
  INVALID_OWNERSHIP_DESTINATION: {
    status: 400,
    message:
      "Tujuan ownership harus berupa akun Sales atau Manager yang aktif.",
  },
  TEAM_MEMBER_NOT_FOUND: {
    status: 404,
    message: "Anggota tim tidak ditemukan.",
  },
  OWNERSHIP_SOURCE_EQUALS_DESTINATION: {
    status: 409,
    message: "Sumber dan tujuan ownership tidak boleh sama.",
  },
  SELF_ROLE_CHANGE_FORBIDDEN: {
    status: 409,
    message:
      "Super Admin tidak dapat mengubah role akun yang sedang digunakan.",
  },
  SELF_DEACTIVATION_FORBIDDEN: {
    status: 409,
    message:
      "Super Admin tidak dapat menonaktifkan akun yang sedang digunakan.",
  },
  SELF_DELETE_FORBIDDEN: {
    status: 409,
    message: "Super Admin tidak dapat menghapus akun yang sedang digunakan.",
  },
  LAST_ACTIVE_SUPER_ADMIN: {
    status: 409,
    message: "Super Admin aktif terakhir tidak dapat diubah atau dihapus.",
  },
  ACCOUNT_HAS_OWNERSHIP: {
    status: 409,
    message:
      "Akun masih memiliki ownership yang harus dipindahkan terlebih dahulu.",
  },
  ACCOUNT_HAS_REFERENCES: {
    status: 409,
    message:
      "Akun masih memiliki referensi. Nonaktifkan akun atau pindahkan ownership terlebih dahulu.",
  },
  ACCOUNT_STATUS_UNCHANGED: {
    status: 409,
    message: "Status akun sudah sesuai dengan permintaan.",
  },
  ROLE_UNCHANGED: {
    status: 409,
    message: "Role akun sudah sesuai dengan permintaan.",
  },
};

export class AdminHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, number>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, number>,
  ) {
    super(message);
    this.name = "AdminHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function invalidRequest(message: string): never {
  throw new AdminHttpError(400, "INVALID_REQUEST", message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: UnknownRecord,
  requiredKeys: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const expected = [...requiredKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalidRequest("Struktur request tidak sesuai dengan action yang dipilih.");
  }
}

function requireString(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  trim = true,
): string {
  if (typeof value !== "string") {
    invalidRequest(`${label} wajib berupa teks.`);
  }
  const normalized = trim ? value.trim() : value;
  if (normalized.length < minimum || normalized.length > maximum) {
    invalidRequest(`${label} harus berisi ${minimum}-${maximum} karakter.`);
  }
  return normalized;
}

function requireUuid(value: unknown, label: string): string {
  const id = requireString(value, label, 36, 36);
  if (!UUID_PATTERN.test(id)) {
    invalidRequest(`${label} tidak valid.`);
  }
  return id.toLowerCase();
}

function requireRole(value: unknown): AppRole {
  if (typeof value !== "string" || !APP_ROLES.has(value as AppRole)) {
    invalidRequest("Role tidak valid.");
  }
  return value as AppRole;
}

function requireEmail(value: unknown): string {
  const email = requireString(value, "Email", 3, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    invalidRequest("Email tidak valid.");
  }
  return email;
}

function requireReason(value: unknown): string {
  return requireString(value, "Alasan", 1, 500);
}

export function parseAdminAction(rawBody: string): AdminAction {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    throw new AdminHttpError(400, "INVALID_JSON", "Body JSON tidak valid.");
  }

  if (!isRecord(decoded) || typeof decoded.action !== "string") {
    invalidRequest("Action wajib diisi.");
  }

  switch (decoded.action) {
    case "create":
      requireExactKeys(decoded, [
        "action",
        "name",
        "email",
        "initials",
        "role",
        "password",
      ]);
      return {
        action: "create",
        name: requireString(decoded.name, "Nama", 1, 120),
        email: requireEmail(decoded.email),
        initials: requireString(decoded.initials, "Inisial", 1, 8),
        role: requireRole(decoded.role),
        password: requireString(decoded.password, "Password", 8, 128, false),
      };

    case "update_profile":
      requireExactKeys(decoded, ["action", "id", "name", "initials"]);
      return {
        action: "update_profile",
        id: requireUuid(decoded.id, "ID anggota tim"),
        name: requireString(decoded.name, "Nama", 1, 120),
        initials: requireString(decoded.initials, "Inisial", 1, 8),
      };

    case "change_role":
      requireExactKeys(decoded, ["action", "id", "role", "reason"]);
      return {
        action: "change_role",
        id: requireUuid(decoded.id, "ID anggota tim"),
        role: requireRole(decoded.role),
        reason: requireReason(decoded.reason),
      };

    case "deactivate":
    case "reactivate":
      requireExactKeys(decoded, ["action", "id", "reason"]);
      return {
        action: decoded.action,
        id: requireUuid(decoded.id, "ID anggota tim"),
        reason: requireReason(decoded.reason),
      };

    case "transfer_ownership":
      requireExactKeys(decoded, ["action", "fromId", "toId", "reason"]);
      return {
        action: "transfer_ownership",
        fromId: requireUuid(decoded.fromId, "ID sumber"),
        toId: requireUuid(decoded.toId, "ID tujuan"),
        reason: requireReason(decoded.reason),
      };

    case "delete_eligible_account":
      requireExactKeys(decoded, ["action", "id", "reason"]);
      return {
        action: "delete_eligible_account",
        id: requireUuid(decoded.id, "ID anggota tim"),
        reason: requireReason(decoded.reason),
      };

    default:
      invalidRequest("Action tidak dikenal.");
  }
}

function databaseCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.message !== "string") return undefined;
  const message = error.message;
  return Object.keys(DATABASE_ERRORS).find(
    (code) => message === code || message.startsWith(`${code}:`),
  );
}

function numericDetails(error: unknown): Record<string, number> | undefined {
  if (!isRecord(error)) return undefined;
  const raw = error.details ?? error.detail;
  let decoded: unknown = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(decoded)) return undefined;

  const safeEntries = Object.entries(decoded).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" &&
      Number.isSafeInteger(entry[1]) &&
      entry[1] >= 0,
  );
  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof AdminHttpError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  const code = databaseCode(error);
  if (code) {
    const mapped = DATABASE_ERRORS[code];
    const details = numericDetails(error);
    return {
      status: mapped.status,
      body: {
        error: mapped.message,
        code,
        ...(details ? { details } : {}),
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Operasi anggota tim gagal.",
      code: "INTERNAL_ERROR",
    },
  };
}
