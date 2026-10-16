import { z } from "zod";
import type { ReportFilters } from "@/components/reports/report-filters";
import { toLocalIsoDate } from "@/lib/domain";
export const SO_VALUE_DEFINITION =
  "Nilai order berbayar yang tercatat, bukan konfirmasi pembayaran diterima. Prototype Paid berarti berbayar, bukan status pelunasan.";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Tanggal kalender tidak valid");
export const metricScopeSchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
    ownerId: z.string().optional(),
    clientId: z.string().optional(),
    taxType: z.enum(["PPN", "Non-PPN"]).optional(),
    soType: z.enum(["Regular", "Prototype"]).optional(),
    source: z
      .enum([
        "New Product",
        "Existing / Repeat Order",
        "Prototype Paid",
        "Prototype FOC",
      ])
      .optional(),
  })
  .refine((scope) => scope.from <= scope.to, "Rentang tanggal terbalik");
export type MetricScope = z.infer<typeof metricScopeSchema>;
export type MetricContext = {
  scope: MetricScope;
  basis: "sales-order-value";
  fetchedAt: string;
  targetComparable: boolean;
};
export type PeriodTarget = {
  ownerId: string;
  year: number;
  month: number;
  target: number;
};
const optional = (value: string) => (value === "all" ? undefined : value);

export function metricScope(filters: ReportFilters): MetricScope {
  return metricScopeSchema.parse({
    from: toLocalIsoDate(filters.range.from),
    to: toLocalIsoDate(filters.range.to),
    ownerId: optional(filters.ownerId),
    clientId: optional(filters.clientId),
    taxType: optional(filters.taxType),
    soType: optional(filters.soType),
    source: optional(filters.source),
  });
}

export function targetComparison(
  scope: MetricScope,
  targets: readonly PeriodTarget[],
) {
  const [year, month] = scope.to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const fullMonths =
    scope.from.endsWith("-01") && Number(scope.to.slice(-2)) === lastDay;
  const subset = Boolean(
    scope.clientId || scope.taxType || scope.soType || scope.source,
  );
  const reason = subset
    ? "Target belum dialokasikan untuk filter ini."
    : !fullMonths
      ? "Target hanya dibandingkan untuk bulan kalender penuh."
      : null;
  if (reason) return { comparable: false, target: null, reason };
  const fromMonth = scope.from.slice(0, 7);
  const toMonth = scope.to.slice(0, 7);
  const target = targets.reduce((sum, row) => {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    return key >= fromMonth &&
      key <= toMonth &&
      (!scope.ownerId || row.ownerId === scope.ownerId)
      ? sum + row.target
      : sum;
  }, 0);
  return { comparable: true, target, reason: null };
}

export function customerShare(value: number, total: number): number | null {
  return total > 0 ? value / total : null;
}
