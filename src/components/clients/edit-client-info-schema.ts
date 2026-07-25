import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    {
      message: "Format email tidak valid",
    },
  );

const contactSchema = z.object({
  name: z.string().trim(),
  position: z.string().trim(),
  email: emailField,
  phone: z.string().trim(),
  mobile: z.string().trim(),
});

export const editClientInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: "Nama client minimal 3 karakter" })
    .max(120, { message: "Nama client terlalu panjang" }),
  address: z.string().trim(),
  province: z.string().trim(),
  city: z.string().trim(),
  industry: z.string().trim(),
  website: z.string().trim(),
  notes: z.string().trim(),
  cp1: contactSchema,
  cp2: contactSchema,
  cp3: contactSchema,
});

export type EditClientInfoFormValues = z.infer<typeof editClientInfoSchema>;
