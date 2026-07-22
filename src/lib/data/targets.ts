import { supabase } from "@/lib/supabase";
import { CURRENT_YEAR } from "@/lib/domain";

export type MonthlyTarget = { month: number; target: number };
export type TargetsByMember = Record<string, MonthlyTarget[]>;

type TargetRow = {
  sales_id: string;
  month: number;
  target: number;
};

// Every sales rep's monthly target for a given year, keyed by sales_id.
// RLS scopes this: sales sees only their own rows, manager/executive see
// everyone's (needed to sum up the company-wide target).
export async function listTargets(
  year: number = CURRENT_YEAR,
): Promise<TargetsByMember> {
  const { data, error } = await supabase
    .from("targets")
    .select("sales_id, month, target")
    .eq("year", year);
  if (error) throw error;

  const byMember: TargetsByMember = {};
  for (const row of (data ?? []) as TargetRow[]) {
    (byMember[row.sales_id] ??= []).push({
      month: row.month,
      target: row.target,
    });
  }
  for (const arr of Object.values(byMember)) {
    arr.sort((a, b) => a.month - b.month);
  }
  return byMember;
}

// Manager-only write (enforced by RLS) — saves whichever months changed.
// Phase 12 Task 6 verified this function needs no Super Admin exclusion
// logic of its own: its only caller (Settings' Targets tab) always passes
// a `salesId` sourced from listSalesTeamProfiles() (src/lib/data/clients.ts),
// which is already filtered to role === "sales" — so a Super Admin id can
// never reach this function's `sales_id` parameter in the first place.
export async function upsertMonthlyTargets(
  salesId: string,
  targets: MonthlyTarget[],
  year: number = CURRENT_YEAR,
): Promise<void> {
  const rows = targets.map(({ month, target }) => ({
    sales_id: salesId,
    year,
    month,
    target,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("targets")
    .upsert(rows, { onConflict: "sales_id,year,month" });
  if (error) throw error;
}
