// Rupiah + numeric formatters for DSM Sales Execution.
// Rule: < Rp1B → "juta", ≥ Rp1B → "milyar" for abbreviated displays.

export function formatRupiahFull(value: number): string {
  if (!Number.isFinite(value)) return "Rp0";
  return "Rp" + Math.round(value).toLocaleString("id-ID");
}

export function formatRupiahShort(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "Rp0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    const v = value / 1_000_000_000;
    return `${sign}Rp${formatDecimal(Math.abs(v), 2)} milyar`;
  }
  if (abs >= 1_000_000) {
    const v = value / 1_000_000;
    return `${sign}Rp${formatDecimal(Math.abs(v), 1)} juta`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp${(abs / 1_000).toFixed(0)} rb`;
  }
  return formatRupiahFull(value);
}

function formatDecimal(v: number, digits: number): string {
  const s = v.toFixed(digits);
  // Trim trailing zeros after the decimal, then trailing dot.
  return s.replace(/\.?0+$/, "").replace(".", ",");
}

export function formatPercent(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "0%";
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatCompactNumber(v: number): string {
  return v.toLocaleString("id-ID");
}

export function formatDateShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}
