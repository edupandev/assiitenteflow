import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { getTodayBR } from "@/lib/utils";
import {
  calculateWorkedMinutes,
  DEFAULT_SCHEDULE,
  enumerateDates,
  getClosingPeriod,
  isEligibleWorkday,
  type ScheduleConfig,
} from "@/modules/timecard/calculations";

const timeField = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .nullable()
  .optional();

const upsertTimeRecordSchema = z.object({
  action: z.enum(["punch", "manual", "auto_fill"]).default("punch"),
  work_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  clock_in: timeField,
  lunch_out: timeField,
  lunch_in: timeField,
  clock_out: timeField,
  justification: z.string().trim().max(500).nullable().optional(),
  is_holiday: z.boolean().optional(),
  is_day_off: z.boolean().optional(),
  user_id: z.string().uuid().optional(),
  reference_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

function getCurrentTimeBR(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

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
  const { referenceMonth, periodStart } = getClosingPeriod(monthParam);
  const periodEnd = `${referenceMonth}-31`;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  const effectiveUserId =
    profile.role === "admin" ? targetUserId : user.id;

  const [recordsRes, scheduleRes, closingRes] = await Promise.all([
    supabase
      .from("time_records")
      .select("*")
      .eq("user_id", effectiveUserId)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd)
      .order("work_date", { ascending: false }),
    supabase
      .from("work_schedules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .or(`user_id.eq.${effectiveUserId},user_id.is.null`)
      .order("user_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("monthly_closings")
      .select("id, status, reference_month, period_start, period_end")
      .eq("organization_id", profile.organization_id)
      .eq("reference_month", referenceMonth)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    records: recordsRes.data ?? [],
    schedule: scheduleRes.data ?? DEFAULT_SCHEDULE,
    closing: closingRes.data ?? null,
    referenceMonth,
  });
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

  const body = await request.json().catch(() => null);
  const parsed = upsertTimeRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  const targetUserId =
    profile.role === "admin" && parsed.data.user_id
      ? parsed.data.user_id
      : user.id;

  const todayBR = getTodayBR();

  // Preenchimento automático de dias elegíveis sem registro (como 'estimated')
  if (parsed.data.action === "auto_fill") {
    const { referenceMonth, periodStart, periodEnd } = getClosingPeriod(
      parsed.data.reference_month
    );
    const limitDate = periodEnd < todayBR ? periodEnd : todayBR;

    const { data: closing } = await supabase
      .from("monthly_closings")
      .select("status")
      .eq("organization_id", profile.organization_id)
      .eq("reference_month", referenceMonth)
      .maybeSingle();

    if (closing?.status === "closed") {
      return NextResponse.json(
        { error: "Período fechado. Reabra o fechamento para alterar registros." },
        { status: 409 }
      );
    }

    const { data: scheduleRow } = await supabase
      .from("work_schedules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .or(`user_id.eq.${targetUserId},user_id.is.null`)
      .order("user_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const schedule: ScheduleConfig = scheduleRow ?? DEFAULT_SCHEDULE;

    const { data: existingRows } = await supabase
      .from("time_records")
      .select("work_date")
      .eq("user_id", targetUserId)
      .gte("work_date", periodStart)
      .lte("work_date", limitDate);

    const existingDates = new Set(
      (existingRows ?? []).map((r) => r.work_date as string)
    );

    const standardMinutes = calculateWorkedMinutes({
      clock_in: schedule.entry_time,
      lunch_out: schedule.lunch_out_time,
      lunch_in: schedule.lunch_in_time,
      clock_out: schedule.exit_time,
    });

    const toInsert = enumerateDates(periodStart, limitDate)
      .filter((d) => !existingDates.has(d) && isEligibleWorkday(d, schedule))
      .map((work_date) => ({
        organization_id: profile.organization_id,
        user_id: targetUserId,
        work_date,
        clock_in: schedule.entry_time,
        lunch_out: schedule.lunch_out_time,
        lunch_in: schedule.lunch_in_time,
        clock_out: schedule.exit_time,
        worked_minutes: standardMinutes,
        source: "estimated" as const,
        justification: "Preenchimento automático com jornada padrão",
      }));

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("time_records")
        .insert(toInsert);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ filled: toInsert.length });
  }

  const workDate = parsed.data.work_date ?? todayBR;
  const refMonth = workDate.slice(0, 7);

  // Verifica se o período está fechado (considerando dias 01..23)
  const dayNum = Number.parseInt(workDate.slice(8, 10), 10);
  if (dayNum <= 23) {
    const { data: closing } = await supabase
      .from("monthly_closings")
      .select("status")
      .eq("organization_id", profile.organization_id)
      .eq("reference_month", refMonth)
      .maybeSingle();

    if (closing?.status === "closed") {
      return NextResponse.json(
        { error: "Período fechado administrativamente. Solicite reabertura." },
        { status: 409 }
      );
    }
  }

  const { data: existing } = await supabase
    .from("time_records")
    .select("*")
    .eq("user_id", targetUserId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (parsed.data.action === "punch") {
    const nowTime = getCurrentTimeBR();
    const nextTimes = {
      clock_in: existing?.clock_in ?? null,
      lunch_out: existing?.lunch_out ?? null,
      lunch_in: existing?.lunch_in ?? null,
      clock_out: existing?.clock_out ?? null,
    };

    if (!nextTimes.clock_in) nextTimes.clock_in = nowTime;
    else if (!nextTimes.lunch_out) nextTimes.lunch_out = nowTime;
    else if (!nextTimes.lunch_in) nextTimes.lunch_in = nowTime;
    else if (!nextTimes.clock_out) nextTimes.clock_out = nowTime;
    else {
      return NextResponse.json(
        { error: "Todas as 4 batidas de hoje já foram registradas." },
        { status: 400 }
      );
    }

    const workedMinutes = calculateWorkedMinutes(nextTimes);

    const { data, error } = existing
      ? await supabase
          .from("time_records")
          .update({
            ...nextTimes,
            worked_minutes: workedMinutes,
            source: "real",
          })
          .eq("id", existing.id)
          .select("*")
          .single()
      : await supabase
          .from("time_records")
          .insert({
            organization_id: profile.organization_id,
            user_id: targetUserId,
            work_date: workDate,
            ...nextTimes,
            worked_minutes: workedMinutes,
            source: "real",
          })
          .select("*")
          .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ record: data });
  }

  // Edição / registro manual com justificativa
  if (!parsed.data.justification?.trim()) {
    return NextResponse.json(
      { error: "Justificativa é obrigatória para registro ou edição manual." },
      { status: 400 }
    );
  }

  const manualTimes = {
    clock_in: parsed.data.clock_in ?? existing?.clock_in ?? null,
    lunch_out: parsed.data.lunch_out ?? existing?.lunch_out ?? null,
    lunch_in: parsed.data.lunch_in ?? existing?.lunch_in ?? null,
    clock_out: parsed.data.clock_out ?? existing?.clock_out ?? null,
  };

  const workedMinutes = calculateWorkedMinutes(manualTimes);

  const { data, error } = existing
    ? await supabase
        .from("time_records")
        .update({
          ...manualTimes,
          worked_minutes: workedMinutes,
          source: "manual",
          justification: parsed.data.justification.trim(),
          is_holiday: parsed.data.is_holiday ?? existing.is_holiday,
          is_day_off: parsed.data.is_day_off ?? existing.is_day_off,
        })
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabase
        .from("time_records")
        .insert({
          organization_id: profile.organization_id,
          user_id: targetUserId,
          work_date: workDate,
          ...manualTimes,
          worked_minutes: workedMinutes,
          source: "manual",
          justification: parsed.data.justification.trim(),
          is_holiday: parsed.data.is_holiday ?? false,
          is_day_off: parsed.data.is_day_off ?? false,
        })
        .select("*")
        .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ record: data });
}
