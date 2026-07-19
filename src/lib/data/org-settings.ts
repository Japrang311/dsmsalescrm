import { supabase } from "@/lib/supabase";

export type OrgSettings = {
  companyName: string;
  fiscalYear: number;
  ppnRate: number; // 0.11 → 11%
  dormantThresholdDays: number;
  riskOverdueDays: number;
};

type OrgSettingsRow = {
  company_name: string;
  fiscal_year: number;
  ppn_rate: number;
  dormant_threshold_days: number;
  risk_overdue_days: number;
};

function toOrgSettings(row: OrgSettingsRow): OrgSettings {
  return {
    companyName: row.company_name,
    fiscalYear: row.fiscal_year,
    ppnRate: row.ppn_rate,
    dormantThresholdDays: row.dormant_threshold_days,
    riskOverdueDays: row.risk_overdue_days,
  };
}

// The row always exists — seeded once by the org_settings migration and
// never deletable (no delete policy, singleton check constraint).
export async function getOrgSettings(): Promise<OrgSettings> {
  const { data, error } = await supabase
    .from("org_settings")
    .select("*")
    .eq("id", true)
    .single();
  if (error) throw error;
  return toOrgSettings(data);
}

// Manager-only at the RLS level (org_settings_update policy) — the
// app-level `canManage`/role gate in _app.settings.tsx mirrors this, not
// duplicates it as a separate source of truth.
export async function updateOrgSettings(
  patch: Partial<OrgSettings>,
): Promise<OrgSettings> {
  const update: Record<string, unknown> = {};
  if (patch.companyName !== undefined) update.company_name = patch.companyName;
  if (patch.fiscalYear !== undefined) update.fiscal_year = patch.fiscalYear;
  if (patch.ppnRate !== undefined) update.ppn_rate = patch.ppnRate;
  if (patch.dormantThresholdDays !== undefined)
    update.dormant_threshold_days = patch.dormantThresholdDays;
  if (patch.riskOverdueDays !== undefined)
    update.risk_overdue_days = patch.riskOverdueDays;

  const { data, error } = await supabase
    .from("org_settings")
    .update(update)
    .eq("id", true)
    .select("*")
    .single();
  if (error) throw error;
  return toOrgSettings(data);
}
