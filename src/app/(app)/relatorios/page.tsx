import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getClosingPeriod } from "@/modules/timecard/calculations";
import { ReportsClient } from "@/modules/reports/reports-client";
import type { Profile, Project, ReportSummary } from "@/types/database";

export default async function RelatoriosPage() {
  const { userId, profile, isAdmin } = await requireUserContext();
  const supabase = await createClient();
  const { referenceMonth } = getClosingPeriod();

  const [employeesRes, projectsRes, reportsRes] = await Promise.all([
    isAdmin && profile.organization_id
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .eq("organization_id", profile.organization_id)
          .eq("is_active", true)
          .order("full_name", { ascending: true })
      : Promise.resolve({ data: [{ id: userId, full_name: profile.full_name }] }),
    supabase
      .from("projects")
      .select("id, name")
      .eq("owner_id", userId)
      .order("name", { ascending: true }),
    profile.organization_id
      ? supabase
          .from("generated_reports")
          .select("id, report_type, period_start, period_end, created_at, user_id")
          .eq("organization_id", profile.organization_id)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <ReportsClient
      isAdmin={isAdmin}
      currentUserId={userId}
      initialMonth={referenceMonth}
      employees={(employeesRes.data ?? []) as Pick<Profile, "id" | "full_name">[]}
      projects={(projectsRes.data ?? []) as Pick<Project, "id" | "name">[]}
      recentReports={(reportsRes.data ?? []) as ReportSummary[]}
    />
  );
}
