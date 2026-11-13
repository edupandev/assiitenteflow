import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
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
import {
  buildIndividualPdfBuffer,
  buildIndividualXlsxBuffer,
} from "@/services/reports";
import { sendTelegramDocument } from "@/services/telegram";
import type { TimeRecord } from "@/types/database";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!botToken || !chatId) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN ou TELEGRAM_GROUP_CHAT_ID não configurados." },
      { status: 503 }
    );
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY não configurada." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { referenceMonth, periodStart, periodEnd } = getClosingPeriod();
  const idempotencyKey = `monthly_closing:${referenceMonth}`;

  const { data: existingJob } = await admin
    .from("background_jobs")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingJob?.status === "completed") {
    return NextResponse.json({
      skipped: true,
      reason: `Fechamento ${referenceMonth} já executado.`,
    });
  }

  await admin.from("background_jobs").upsert(
    {
      job_type: "monthly_closing",
      idempotency_key: idempotencyKey,
      status: "processing",
      locked_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key" }
  );

  const { data: orgs } = await admin.from("organizations").select("id");
  let processedEmployees = 0;

  for (const org of orgs ?? []) {
    const [employeesRes, schedulesRes, rulesRes] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("organization_id", org.id)
        .eq("is_active", true),
      admin
        .from("work_schedules")
        .select("*")
        .eq("organization_id", org.id)
        .eq("is_active", true),
      admin.from("overtime_rules").select("*").eq("organization_id", org.id),
    ]);

    const schedules = (schedulesRes.data ?? []) as (ScheduleConfig & {
      user_id: string | null;
    })[];
    const rules = (rulesRes.data ?? []) as (OvertimeRuleConfig & {
      user_id: string | null;
    })[];

    const defaultSchedule = schedules.find((s) => !s.user_id) ?? DEFAULT_SCHEDULE;
    const defaultRule = rules.find((r) => !r.user_id) ?? DEFAULT_OVERTIME_RULE;

    for (const emp of employeesRes.data ?? []) {
      const empSchedule =
        schedules.find((s) => s.user_id === emp.id) ?? defaultSchedule;
      const empRule = rules.find((r) => r.user_id === emp.id) ?? defaultRule;

      const { data: existingRecords } = await admin
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

      const missing = enumerateDates(periodStart, periodEnd)
        .filter((d) => !recordDates.has(d) && isEligibleWorkday(d, empSchedule))
        .map((work_date) => ({
          organization_id: org.id,
          user_id: emp.id,
          work_date,
          clock_in: empSchedule.entry_time,
          lunch_out: empSchedule.lunch_out_time,
          lunch_in: empSchedule.lunch_in_time,
          clock_out: empSchedule.exit_time,
          worked_minutes: standardMinutes,
          source: "estimated" as const,
          justification: `Fechamento automático ${referenceMonth}`,
        }));

      if (missing.length > 0) {
        await admin.from("time_records").insert(missing);
      }

      const [fullRecordsRes, tasksRes] = await Promise.all([
        admin
          .from("time_records")
          .select("*")
          .eq("user_id", emp.id)
          .gte("work_date", periodStart)
          .lte("work_date", periodEnd)
          .order("work_date", { ascending: true }),
        admin.from("tasks").select("status").eq("assignee_id", emp.id),
      ]);

      const records = (fullRecordsRes.data ?? []) as TimeRecord[];
      const overtime = calculateOvertimeSummary(records, empRule);
      const tasks = tasksRes.data ?? [];

      const reportInput = {
        employeeName: emp.full_name,
        employeeEmail: emp.email,
        referenceMonth,
        periodStart,
        periodEnd,
        records,
        overtime,
        completedTasksCount: tasks.filter((t) => t.status === "done").length,
        pendingTasksCount: tasks.filter((t) => t.status !== "done").length,
      };

      const pdfBuf = buildIndividualPdfBuffer(reportInput);
      const xlsxBuf = buildIndividualXlsxBuffer(reportInput);

      const safeName = emp.full_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");

      const { data: repRow } = await admin
        .from("generated_reports")
        .insert({
          organization_id: org.id,
          user_id: emp.id,
          report_type: "monthly",
          period_start: periodStart,
          period_end: periodEnd,
          metadata: { employee: emp.full_name },
        })
        .select("id")
        .single();

      try {
        await sendTelegramDocument(
          botToken,
          chatId,
          `fechamento-${safeName}-${referenceMonth}.pdf`,
          pdfBuf,
          "application/pdf",
          `Fechamento ${referenceMonth} — ${emp.full_name} (PDF)`
        );
        const sentXlsx = await sendTelegramDocument(
          botToken,
          chatId,
          `fechamento-${safeName}-${referenceMonth}.xlsx`,
          xlsxBuf,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          `Fechamento ${referenceMonth} — ${emp.full_name} (Excel)`
        );

        await admin.from("telegram_deliveries").insert({
          organization_id: org.id,
          report_id: repRow?.id ?? null,
          delivery_type: "monthly_closing",
          chat_id: chatId,
          message_id: sentXlsx.messageId,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      } catch (err) {
        await admin.from("telegram_deliveries").insert({
          organization_id: org.id,
          report_id: repRow?.id ?? null,
          delivery_type: "monthly_closing",
          chat_id: chatId,
          status: "failed",
          error_message: err instanceof Error ? err.message : "Erro Telegram",
        });
      }

      processedEmployees++;
    }

    await admin.from("monthly_closings").upsert(
      {
        organization_id: org.id,
        reference_month: referenceMonth,
        period_start: periodStart,
        period_end: periodEnd,
        status: "closed",
        closed_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,reference_month" }
    );
  }

  await admin
    .from("background_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);

  return NextResponse.json({
    ok: true,
    referenceMonth,
    processedEmployees,
  });
}
