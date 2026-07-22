import { z } from "zod";

const uomSchema = z.enum(["Unit", "Pcs", "Set", "Lot"]);
const optionalPrice = z.coerce
  .number()
  .positive("Harga satuan wajib > 0")
  .optional();

export const lineItemSchema = z.object({
  productName: z.string().trim().min(1, "Nama Product wajib diisi").max(120),
  description: z.string().trim().max(300).optional(),
  qty: z.coerce.number().positive("Qty wajib > 0"),
  uom: uomSchema,
  unitPrice: optionalPrice,
});

const paidLineItemsSchema = z
  .array(lineItemSchema)
  .min(1, "Minimal 1 item")
  .superRefine((items, context) => {
    items.forEach((item, index) => {
      if (item.unitPrice === undefined) {
        context.addIssue({
          code: "custom",
          path: [index, "unitPrice"],
          message: "Harga satuan wajib diisi",
        });
      }
    });
  });

export const rfqSchema = z.object({
  documentDate: z.string().min(10, "Date wajib diisi"),
  stage: z.enum(["Client Request for Quotes"]),
  lineItems: paidLineItemsSchema,
});

export const quotationSchema = z.object({
  documentDate: z.string().min(10, "Date wajib diisi"),
  stage: z.enum([
    "Client Request for Quotes",
    "Quotes Sent",
    "Negotiation",
    "Hot Prospect",
    "Commit",
    "Closed Won",
    "Closed Lost",
  ]),
  note: z.string().trim().max(1000).optional(),
  lineItems: paidLineItemsSchema,
});

export const prototypeRequestSchema = z.object({
  documentDate: z.string().min(10, "Date wajib diisi"),
  lineItems: paidLineItemsSchema,
});

export function buildSalesOrderSchema(isHariffClient: boolean) {
  return z
    .object({
      customerPoNumber: z
        .string()
        .trim()
        .min(1, "Nomor PO Customer wajib diisi")
        .max(80),
      date: z.string().min(10, "Date wajib diisi"),
      type: z.enum(["Regular", "Prototype"]),
      taxType: z.enum(["PPN", "Non-PPN"]).optional(),
      prototypeStatus: z.enum(["Paid", "FOC"]).optional(),
      source: z.enum([
        "RFQ / New Product",
        "Existing / Repeat Order",
        "Prototype Paid",
        "Prototype FOC",
      ]),
      numberMode: z.enum(["Auto", "Hariff Backdate"]),
      manualSoNumber: z.string().trim().max(80).optional(),
      backdateReason: z.string().trim().max(500).optional(),
      lineItems: z.array(lineItemSchema).min(1, "Minimal 1 item"),
    })
    .superRefine((value, context) => {
      const foc = value.type === "Prototype" && value.prototypeStatus === "FOC";
      if (value.type === "Regular") {
        if (!value.taxType) {
          context.addIssue({
            code: "custom",
            path: ["taxType"],
            message: "Wajib pilih PPN / Non-PPN",
          });
        }
        if (
          value.prototypeStatus !== undefined ||
          value.source.startsWith("Prototype")
        ) {
          context.addIssue({
            code: "custom",
            path: ["source"],
            message: "SO Regular tidak boleh klasifikasi Prototype",
          });
        }
      } else if (!value.prototypeStatus) {
        context.addIssue({
          code: "custom",
          path: ["prototypeStatus"],
          message: "Wajib pilih Paid / FOC",
        });
      }

      if (value.type === "Prototype" && value.prototypeStatus === "Paid") {
        if (value.source !== "Prototype Paid" || !value.taxType) {
          context.addIssue({
            code: "custom",
            path: ["source"],
            message: "Prototype Paid memerlukan source dan pajak Paid",
          });
        }
      }
      if (foc && value.source !== "Prototype FOC") {
        context.addIssue({
          code: "custom",
          path: ["source"],
          message: "Sumber wajib Prototype FOC",
        });
      }

      value.lineItems.forEach((item, index) => {
        if (foc && item.unitPrice !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["lineItems", index, "unitPrice"],
            message: "FOC tidak boleh memiliki nilai uang",
          });
        }
        if (!foc && item.unitPrice === undefined) {
          context.addIssue({
            code: "custom",
            path: ["lineItems", index, "unitPrice"],
            message: "Harga satuan wajib diisi",
          });
        }
      });

      if (value.numberMode === "Hariff Backdate") {
        if (!isHariffClient) {
          context.addIssue({
            code: "custom",
            path: ["numberMode"],
            message: "Mode Backdate hanya untuk client HARIFF",
          });
        }
        if (!value.manualSoNumber) {
          context.addIssue({
            code: "custom",
            path: ["manualSoNumber"],
            message: "Nomor SO manual wajib diisi",
          });
        }
        if (!value.backdateReason) {
          context.addIssue({
            code: "custom",
            path: ["backdateReason"],
            message: "Alasan Backdate wajib diisi",
          });
        }
      } else if (value.manualSoNumber || value.backdateReason) {
        context.addIssue({
          code: "custom",
          path: ["numberMode"],
          message: "Nomor manual hanya untuk mode Backdate",
        });
      }
    });
}

export type RfqValues = z.infer<typeof rfqSchema>;
export type QuotationValues = z.infer<typeof quotationSchema>;
export type PrototypeRequestValues = z.infer<typeof prototypeRequestSchema>;
export type SalesOrderValues = z.infer<
  ReturnType<typeof buildSalesOrderSchema>
>;
