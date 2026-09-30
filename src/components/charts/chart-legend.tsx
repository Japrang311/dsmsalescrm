import type { ReactNode } from "react";

/**
 * Recharts paints each legend label in its series colour. That is fine for a
 * swatch — a line or bar only needs 3:1 against the background — but the same
 * colour on 10–11px text falls below the 4.5:1 AA floor for several of our
 * series (`--color-border-strong` measured 2.14:1, `#C97716` 3.42:1).
 *
 * Pass this as `<Legend formatter={legendLabel} />` to keep the coloured
 * swatch as the data encoding while the label stays readable.
 */
export function legendLabel(value: ReactNode) {
  return <span style={{ color: "var(--color-foreground)" }}>{value}</span>;
}
