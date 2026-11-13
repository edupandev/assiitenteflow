import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  calculateOvertimeSummary,
  DEFAULT_OVERTIME_RULE,
  getClosingPeriod,
  type OvertimeRuleConfig,
} from "@/modules/timecard/calculations";

const updateRuleSchema = z.object({
  user_id: z.string().uuid().nullable().optional(),
  monthly_salary: z.number().min(0).max(1_000_000),
  monthly_divisor: z.number().int().min(1).max(300),
  daily_contract_minutes: z.number().int().min(60).max(720),
  overtime_50_pct: z.number().min(0).max(200),
  overtime_100_pct: z.number().min(0).max(300),
});

export async function GET(request: NextRequest) {
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

  const monthParam = request.nextUrl.searchParams.get("month") ?? undefined;
  const targetUserId = request.nextUrl.searchParams.get("user_id") ?? user.id;
  const { referenceMonth, periodStart, periodEnd } = getClosingPeriod(monthParam);

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  const effectiveUserId = profile.role === "admin" ? targetUserId : user.id;

  const [ruleRes, recordsRes] = await Promise.all([
    supabase
      .from("overtime_rules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .or(`user_id.eq.${effectiveUserId},user_id.is.null`)
      .order("user_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("time_records")
      .select("work_date, worked_minutes, source, is_holiday, is_day_off")
      .eq("user_id", effectiveUserId)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd),
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

  return NextResponse.json({
    referenceMonth,
    periodStart,
    periodEnd,
    rule,
    hasConfiguredRule: Boolean(ruleRes.data),
    summary,
  });
}

export async function PUT(request: NextRequest) {
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
      { error: "Apenas administradores podem configurar regras de horas extras." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const targetUserId = parsed.data.user_id ?? null;

  let existingQuery = supabase
    .from("overtime_rules")
    .select("id")
    .eq("organization_id", profile.organization_id);

  existingQuery = targetUserId
    ? existingQuery.eq("user_id", targetUserId)
    : existingQuery.is("user_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  const payload = {
    organization_id: profile.organization_id,
    user_id: targetUserId,
    monthly_salary: parsed.data.monthly_salary,
    monthly_divisor: parsed.data.monthly_divisor,
    daily_contract_minutes: parsed.data.daily_contract_minutes,
    overtime_50_pct: parsed.data.overtime_50_pct,
    overtime_100_pct: parsed.data.overtime_100_pct,
  };

  const { data, error } = existing
    ? await supabase
        .from("overtime_rules")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabase
        .from("overtime_rules")
        .insert(payload)
        .select("*")
        .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rule: data });
}
