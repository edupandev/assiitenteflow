import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import {
  calculateOvertimeSummary,
  DEFAULT_OVERTIME_RULE,
  getClosingPeriod,
  type OvertimeRuleConfig,
} from "@/modules/timecard/calculations";
import {
  buildIndividualPdfBuffer,
  buildIndividualXlsxBuffer,
} from "@/services/reports";
import type { TimeRecord } from "@/types/database";

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

  const format = request.nextUrl.searchParams.get("format") ?? "pdf";
  const monthParam = request.nextUrl.searchParams.get("month") ?? undefined;
  const requestedUserId = request.nextUrl.searchParams.get("user_id") ?? user.id;

  const { referenceMonth, periodStart, periodEnd } = getClosingPeriod(monthParam);

  const { data: caller } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!caller?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  const targetUserId = caller.role === "admin" ? requestedUserId : user.id;

  const [empRes, recordsRes, ruleRes, tasksRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", targetUserId)
      .single(),
    supabase
      .from("time_records")
      .select("*")
      .eq("user_id", targetUserId)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd)
      .order("work_date", { ascending: true }),
    supabase
      .from("overtime_rules")
      .select("*")
      .eq("organization_id", caller.organization_id)
      .or(`user_id.eq.${targetUserId},user_id.is.null`)
      .order("user_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("status")
      .eq("assignee_id", targetUserId),
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

  const records = (recordsRes.data ?? []) as TimeRecord[];
  const overtime = calculateOvertimeSummary(records, rule);
  const tasks = tasksRes.data ?? [];

  const reportInput = {
    employeeName: empRes.data?.full_name ?? "Funcionário",
    employeeEmail: empRes.data?.email ?? "",
    referenceMonth,
    periodStart,
    periodEnd,
    records,
    overtime,
    completedTasksCount: tasks.filter((t) => t.status === "done").length,
    pendingTasksCount: tasks.filter((t) => t.status !== "done").length,
  };

  if (format === "xlsx") {
    const buf = buildIndividualXlsxBuffer(reportInput);
    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="relatorio-${referenceMonth}.xlsx"`,
      },
    });
  }

  const pdf = buildIndividualPdfBuffer(reportInput);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${referenceMonth}.pdf"`,
    },
  });
}
