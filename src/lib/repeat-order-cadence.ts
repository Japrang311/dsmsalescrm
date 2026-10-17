export const REPEAT_ORDER_RULE_VERSION = "d05-v1" as const;
export const REPEAT_ORDER_WINDOW_DAYS = 365;
export const REPEAT_ORDER_MINIMUM_DATES = 4;

export type RepeatOrderCadenceState =
  "overdue" | "on_cadence" | "data_insufficient";

export type RepeatOrderHistoryCoverage = "full_window" | "partial_window";

export type RepeatOrderCadenceEvaluation = {
  ruleVersion: typeof REPEAT_ORDER_RULE_VERSION;
  historyWindowStartDate: string;
  historyWindowEndDate: string;
  historyObservedFrom: string;
  historyCoverage: RepeatOrderHistoryCoverage;
  sampleCount: number;
  intervalCount: number;
  lastOrderDate: string | null;
  medianIntervalDays: number | null;
  daysSinceLastOrder: number | null;
  overdueThresholdDays: number | null;
  overdueByDays: number | null;
  state: RepeatOrderCadenceState;
  reason: string;
};

type RepeatOrderCadenceInput = {
  asOfDate: string;
  historyObservedFrom: string;
  orderDates: readonly string[];
};

function dateToDay(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`INVALID_REPEAT_ORDER_DATE:${date}`);
  const day = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (new Date(day).toISOString().slice(0, 10) !== date) {
    throw new Error(`INVALID_REPEAT_ORDER_DATE:${date}`);
  }
  return day / 86_400_000;
}

function dayToDate(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function formatDays(value: number): string {
  return String(value);
}

export function evaluateRepeatOrderCadence({
  asOfDate,
  historyObservedFrom,
  orderDates,
}: RepeatOrderCadenceInput): RepeatOrderCadenceEvaluation {
  const asOfDay = dateToDay(asOfDate);
  const observedFromDay = dateToDay(historyObservedFrom);
  const windowStartDay = asOfDay - (REPEAT_ORDER_WINDOW_DAYS - 1);
  const historyWindowStartDate = dayToDate(windowStartDay);
  const observedOrderDays = [
    ...new Set(orderDates.map((date) => dateToDay(date))),
  ]
    .filter((day) => day <= asOfDay)
    .sort((left, right) => left - right);
  const distinctOrderDays = observedOrderDays.filter(
    (day) => day >= windowStartDay,
  );
  const sampleCount = distinctOrderDays.length;
  const intervalCount = Math.max(sampleCount - 1, 0);
  const lastOrderDay = observedOrderDays.at(-1) ?? null;
  const lastOrderDate = lastOrderDay === null ? null : dayToDate(lastOrderDay);
  const daysSinceLastOrder =
    lastOrderDay === null ? null : asOfDay - lastOrderDay;
  const historyCoverage: RepeatOrderHistoryCoverage =
    observedFromDay <= windowStartDay ? "full_window" : "partial_window";

  const common = {
    ruleVersion: REPEAT_ORDER_RULE_VERSION,
    historyWindowStartDate,
    historyWindowEndDate: asOfDate,
    historyObservedFrom,
    historyCoverage,
    sampleCount,
    intervalCount,
    lastOrderDate,
    daysSinceLastOrder,
  };

  if (sampleCount < REPEAT_ORDER_MINIMUM_DATES) {
    return {
      ...common,
      medianIntervalDays: null,
      overdueThresholdDays: null,
      overdueByDays: null,
      state: "data_insufficient",
      reason: `Data belum cukup: ${sampleCount} dari minimum ${REPEAT_ORDER_MINIMUM_DATES} tanggal order berbeda dalam ${REPEAT_ORDER_WINDOW_DAYS} hari.`,
    };
  }

  const intervals = distinctOrderDays
    .slice(1)
    .map((day, index) => day - distinctOrderDays[index])
    .sort((left, right) => left - right);
  const midpoint = Math.floor(intervals.length / 2);
  const medianIntervalDays =
    intervals.length % 2 === 0
      ? (intervals[midpoint - 1] + intervals[midpoint]) / 2
      : intervals[midpoint];
  const overdueThresholdDays = Math.max(
    medianIntervalDays * 1.5,
    medianIntervalDays + 7,
  );
  const isOverdue = daysSinceLastOrder! > overdueThresholdDays;
  const overdueByDays = isOverdue
    ? daysSinceLastOrder! - overdueThresholdDays
    : 0;

  return {
    ...common,
    medianIntervalDays,
    overdueThresholdDays,
    overdueByDays,
    state: isOverdue ? "overdue" : "on_cadence",
    reason: isOverdue
      ? `Terlambat ${formatDays(overdueByDays)} hari: ${daysSinceLastOrder} hari sejak order terakhir, melewati ambang ${formatDays(overdueThresholdDays)} hari.`
      : `Dalam cadence: ${daysSinceLastOrder} hari sejak order terakhir, ambang ${formatDays(overdueThresholdDays)} hari.`,
  };
}
