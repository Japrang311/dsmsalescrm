import { describe, expect, test } from "bun:test";

import { editClientInfoSchema } from "./edit-client-info-schema";

const validForm = {
  name: "PT DSM Indonesia",
  address: "",
  province: "",
  city: "",
  industry: "",
  website: "",
  notes: "",
  cp1: { name: "", position: "", email: "", phone: "", mobile: "" },
  cp2: { name: "", position: "", email: "", phone: "", mobile: "" },
  cp3: { name: "", position: "", email: "", phone: "", mobile: "" },
};

describe("editClientInfoSchema", () => {
  test("trims a valid client name", () => {
    const result = editClientInfoSchema.parse({
      ...validForm,
      name: "  PT DSM Indonesia  ",
    });

    expect(result.name).toBe("PT DSM Indonesia");
  });

  test("rejects a client name shorter than 3 characters", () => {
    const result = editClientInfoSchema.safeParse({
      ...validForm,
      name: "AB",
    });

    expect(result.success).toBe(false);
  });

  test("rejects a client name longer than 120 characters", () => {
    const result = editClientInfoSchema.safeParse({
      ...validForm,
      name: "A".repeat(121),
    });

    expect(result.success).toBe(false);
  });
});
