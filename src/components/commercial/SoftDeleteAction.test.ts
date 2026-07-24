import { describe, expect, test } from "bun:test";
import {
  canManageSoftDeletedRecord,
  softDeleteConfirmationDescription,
} from "./soft-delete-controls";

describe("commercial soft-delete controls", () => {
  test("matches the database ownership boundary", () => {
    expect(canManageSoftDeletedRecord("sales", "sales-1", "sales-1")).toBe(
      true,
    );
    expect(canManageSoftDeletedRecord("sales", "sales-2", "sales-1")).toBe(
      false,
    );
    expect(canManageSoftDeletedRecord("manager", "sales-2", "manager-1")).toBe(
      true,
    );
    expect(
      canManageSoftDeletedRecord("super_admin", "sales-2", "admin-1"),
    ).toBe(true);
    expect(
      canManageSoftDeletedRecord("executive", "sales-2", "executive-1"),
    ).toBe(false);
  });

  test("confirmation copy explicitly promises restore and no permanent deletion", () => {
    expect(softDeleteConfirmationDescription("Quotation DSM-26QUO-0001")).toBe(
      "Quotation DSM-26QUO-0001 akan disembunyikan dari tampilan dan laporan aktif. Data tidak dihapus permanen dan dapat dipulihkan kembali.",
    );
  });
});
