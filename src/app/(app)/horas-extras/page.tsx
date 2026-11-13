import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  calculateOvertimeSummary,
  DEFAULT_OVERTIME_RULE,
  getClosingPeriod,
  type OvertimeRuleConfig,
} from "@/modules/timecard/calculations";
import { OvertimeClient } from "@/modules/overtime/overtime-client";

export default async function HorasExtrasPage() {
  const { userId, profile, isAdmin } = await requireUserContext();
  const supabase = await createClient();
  const { referenceMonth, periodStart, periodEnd } = getClosingPeriod();

  const [ruleRes, recordsRes, closingRes] = await Promise.all([
    profile.organization_id
      ? supabase
          .from("overtime_rules")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .or(`user_id.eq.${userId},user_id.is.null`)
          .order("user_id", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("time_records")
      .select("work_date, worked_minutes, source, is_holiday, is_day_off")
      .eq("user_id", userId)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd),
    profile.organization_id
      ? supabase
          .from("monthly_closings")
          .select("id, reference_month, period_start, period_end, status, closed_at, reopened_reason")
          .eq("organization_id", profile.organization_id)
          .eq("reference_month", referenceMonth)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rule: OvertimeRuleConfig = ruleRes.data
    ? {
        monthly_salary: Number(ruleRes.data.monthly_salary),
        monthly_divisor: Number(ruleRes.data.monthly_divisor),
        daily_contract_minutes: Number(ruleRes.data.daily_contract_minutes),
        overtime_50_pct: Number(ruleRes.data.overtime_50_pct),
        overtime_100_pct: Number(ruleRes.data.overtime_100_pct),
      }
    : DEFAULT_OVERTIME_RULE;

  const summary = calculateOvertimeSummary(
    (recordsRes.data ?? []) as {
      work_date: string;
      worked_minutes: number;
      source: "real" | "manual" | "estimated";
      is_holiday: boolean;
      is_day_off: boolean;
    }[],
    rule
  );

  return (
    <OvertimeClient
      isAdmin={isAdmin}
      initialMonth={referenceMonth}
      initialPeriodStart={periodStart}
      initialPeriodEnd={periodEnd}
      initialRule={rule}
      hasConfiguredRule={Boolean(ruleRes.data)}
      initialSummary={summary}
      initialClosing={closingRes.data ?? null}
    />
  );
}
