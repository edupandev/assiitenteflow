import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  calculateOvertimeSummary,
  calculateWorkedMinutes,
  DEFAULT_OVERTIME_RULE,
  DEFAULT_SCHEDULE,
  enumerateDates,
  getClosingPeriod,
  isEligibleWorkday,
  type OvertimeRuleConfig,
  type ScheduleConfig,
} from "@/modules/timecard/calculations";

const closingActionSchema = z.object({
  action: z.enum(["close", "reopen"]),
  reference_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  const { data } = await supabase
    .from("monthly_closings")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("reference_month", { ascending: false })
    .limit(12);

  return NextResponse.json({ closings: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id || profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores podem fechar ou reabrir períodos." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = closingActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { referenceMonth, periodStart, periodEnd } = getClosingPeriod(
    parsed.data.reference_month
  );

  const { data: existingClosing } = await supabase
    .from("monthly_closings")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .eq("reference_month", referenceMonth)
    .maybeSingle();

  if (parsed.data.action === "reopen") {
    if (!existingClosing || existingClosing.status !== "closed") {
      return NextResponse.json(
        { error: "Não há fechamento encerrado para reabrir neste mês." },
        { status: 400 }
      );
    }

    if (!parsed.data.reason?.trim()) {
      return NextResponse.json(
        { error: "Informe o motivo da reabertura administrativa." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("monthly_closings")
      .update({
        status: "reopened",
        reopened_by: user.id,
        reopened_at: new Date().toISOString(),
        reopened_reason: parsed.data.reason.trim(),
      })
      .eq("id", existingClosing.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ closing: data });
  }

  // Proteção contra execução duplicada
  if (existingClosing?.status === "closed") {
    return NextResponse.json(
      { error: `O mês ${referenceMonth} já está fechado.` },
      { status: 409 }
    );
  }

  const [employeesRes, schedulesRes, rulesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true),
    supabase
      .from("work_schedules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true),
    supabase
      .from("overtime_rules")
      .select("*")
      .eq("organization_id", profile.organization_id),
  ]);

  const employees = (employeesRes.data ?? []) as { id: string; full_name: string }[];
  const schedules = (schedulesRes.data ?? []) as (ScheduleConfig & { user_id: string | null })[];
  const rules = (rulesRes.data ?? []) as (OvertimeRuleConfig & { user_id: string | null })[];

  const defaultSchedule = schedules.find((s) => !s.user_id) ?? DEFAULT_SCHEDULE;
  const defaultRule = rules.find((r) => !r.user_id) ?? DEFAULT_OVERTIME_RULE;

  const employeeSummaries: Record<string, unknown>[] = [];
  let totalEstimatedFilled = 0;

  for (const emp of employees) {
    const empSchedule = schedules.find((s) => s.user_id === emp.id) ?? defaultSchedule;
    const empRule = rules.find((r) => r.user_id === emp.id) ?? defaultRule;

    const { data: existingRecords } = await supabase
      .from("time_records")
      .select("*")
      .eq("user_id", emp.id)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd);

    const recordDates = new Set(
      (existingRecords ?? []).map((r) => r.work_date as string)
    );

    const standardMinutes = calculateWorkedMinutes({
      clock_in: empSchedule.entry_time,
      lunch_out: empSchedule.lunch_out_time,
      lunch_in: empSchedule.lunch_in_time,
      clock_out: empSchedule.exit_time,
    });

    const missingToInsert = enumerateDates(periodStart, periodEnd)
      .filter((d) => !recordDates.has(d) && isEligibleWorkday(d, empSchedule))
      .map((work_date) => ({
        organization_id: profile.organization_id,
        user_id: emp.id,
        work_date,
        clock_in: empSchedule.entry_time,
        lunch_out: empSchedule.lunch_out_time,
        lunch_in: empSchedule.lunch_in_time,
        clock_out: empSchedule.exit_time,
        worked_minutes: standardMinutes,
        source: "estimated" as const,
        justification: `Preenchimento automático do fechamento ${referenceMonth}`,
      }));

    if (missingToInsert.length > 0) {
      await supabase.from("time_records").insert(missingToInsert);
      totalEstimatedFilled += missingToInsert.length;
    }

    const { data: fullRecords } = await supabase
      .from("time_records")
      .select("work_date, worked_minutes, source, is_holiday, is_day_off")
      .eq("user_id", emp.id)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd);

    const summary = calculateOvertimeSummary(
      (fullRecords ?? []) as {
        work_date: string;
        worked_minutes: number;
        source: "real" | "manual" | "estimated";
        is_holiday: boolean;
        is_day_off: boolean;
      }[],
      empRule
    );

    employeeSummaries.push({
      user_id: emp.id,
      full_name: emp.full_name,
      total_worked_minutes: summary.total_worked_minutes,
      total_overtime_50_minutes: summary.total_overtime_50_minutes,
      total_overtime_100_minutes: summary.total_overtime_100_minutes,
      balance_minutes: summary.balance_minutes,
      estimated_overtime_value: summary.estimated_overtime_value,
    });
  }

  const closingPayload = {
    organization_id: profile.organization_id,
    reference_month: referenceMonth,
    period_start: periodStart,
    period_end: periodEnd,
    status: "closed" as const,
    closed_by: user.id,
    closed_at: new Date().toISOString(),
    summary: {
      employees_count: employees.length,
      estimated_days_filled: totalEstimatedFilled,
      employees: employeeSummaries,
    },
  };

  const { data: closingRow, error: closingErr } = existingClosing
    ? await supabase
        .from("monthly_closings")
        .update(closingPayload)
        .eq("id", existingClosing.id)
        .select("*")
        .single()
    : await supabase
        .from("monthly_closings")
        .insert(closingPayload)
        .select("*")
        .single();

  if (closingErr) {
    return NextResponse.json({ error: closingErr.message }, { status: 400 });
  }

  return NextResponse.json({ closing: closingRow });
}
