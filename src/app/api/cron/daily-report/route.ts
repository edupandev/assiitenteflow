import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDateShortBR, getTodayBR } from "@/lib/utils";
import {
  formatDailyTelegramReport,
  sendTelegramMessage,
} from "@/services/telegram";

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
  const todayBR = getTodayBR();
  const idempotencyKey = `daily_report:${todayBR}`;

  const { data: existingJob } = await admin
    .from("background_jobs")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingJob?.status === "completed") {
    return NextResponse.json({ skipped: true, reason: "Já enviado hoje." });
  }

  await admin.from("background_jobs").upsert(
    {
      job_type: "daily_report",
      idempotency_key: idempotencyKey,
      status: "processing",
      locked_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key" }
  );

  const { data: employees } = await admin
    .from("profiles")
    .select("id, organization_id, full_name")
    .eq("is_active", true);

  let sentCount = 0;

  for (const emp of employees ?? []) {
    const [tasksRes, eventsRes] = await Promise.all([
      admin
        .from("tasks")
        .select("title, status, project:projects(name)")
        .eq("assignee_id", emp.id)
        .eq("is_private", false)
        .gte("updated_at", `${todayBR}T00:00:00-03:00`)
        .limit(10),
      admin
        .from("project_sync_events")
        .select("summary, project:projects(name)")
        .eq("user_id", emp.id)
        .gte("occurred_at", `${todayBR}T00:00:00-03:00`)
        .limit(10),
    ]);

    const projectMap = new Map<
      string,
      { name: string; activities: string[]; changes: string[] }
    >();

    for (const t of tasksRes.data ?? []) {
      const projObj = Array.isArray(t.project) ? t.project[0] : t.project;
      const projName = (projObj as { name?: string } | null)?.name ?? "Geral";
      const entry = projectMap.get(projName) ?? {
        name: projName,
        activities: [],
        changes: [],
      };
      entry.activities.push(`${t.title} (${t.status})`);
      projectMap.set(projName, entry);
    }

    for (const ev of eventsRes.data ?? []) {
      const projObj = Array.isArray(ev.project) ? ev.project[0] : ev.project;
      const projName = (projObj as { name?: string } | null)?.name ?? "Geral";
      const entry = projectMap.get(projName) ?? {
        name: projName,
        activities: [],
        changes: [],
      };
      entry.changes.push(ev.summary);
      projectMap.set(projName, entry);
    }

    const projects = Array.from(projectMap.values());
    const summaryText =
      projects.length > 0
        ? `${projects.length} projeto(s) com movimentação registrada hoje.`
        : "Sem alterações públicas registradas hoje.";

    const message = formatDailyTelegramReport({
      dateBR: formatDateShortBR(todayBR),
      employeeName: emp.full_name,
      projects:
        projects.length > 0
          ? projects
          : [
              {
                name: "Geral",
                activities: ["Sem atividades públicas registradas hoje."],
                changes: [],
              },
            ],
      summary: summaryText,
    });

    try {
      const sent = await sendTelegramMessage(botToken, chatId, message);
      await admin.from("telegram_deliveries").insert({
        organization_id: emp.organization_id,
        delivery_type: "daily_report",
        chat_id: chatId,
        message_id: sent.messageId,
        status: "sent",
        sent_at: new Date().toISOString(),
        payload: { user_id: emp.id, date: todayBR },
      });
      sentCount++;
    } catch (err) {
      await admin.from("telegram_deliveries").insert({
        organization_id: emp.organization_id,
        delivery_type: "daily_report",
        chat_id: chatId,
        status: "failed",
        error_message: err instanceof Error ? err.message : "Erro Telegram",
        payload: { user_id: emp.id, date: todayBR },
      });
    }
  }

  await admin
    .from("background_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);

  return NextResponse.json({ ok: true, date: todayBR, sentCount });
}
