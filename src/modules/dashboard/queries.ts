import { createClient } from "@/lib/supabase/server";
import { getTodayBR } from "@/lib/utils";
import type {
  IntegrationSummary,
  Profile,
  Project,
  ProjectSyncEvent,
  ReportSummary,
  TaskWithProject,
  TimeRecord,
} from "@/types/database";

export interface DashboardData {
  tasks: TaskWithProject[];
  projects: Pick<Project, "id" | "name" | "status">[];
  recentActivities: ProjectSyncEvent[];
  todayMinutes: number;
  monthBalanceMinutes: number;
  adminOverview?: {
    employees: Pick<Profile, "id" | "full_name" | "job_title" | "role">[];
    teamTasks: TaskWithProject[];
    teamActivities: ProjectSyncEvent[];
    activeProjectsCount: number;
    integrations: IntegrationSummary[];
    recentReports: ReportSummary[];
  };
}

export async function getDashboardData(
  userId: string,
  organizationId: string | null,
  isAdmin: boolean
): Promise<DashboardData> {
  const supabase = await createClient();
  const today = getTodayBR();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [tasksRes, projectsRes, activitiesRes, timeRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*, project:projects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name)"
      )
      .eq("assignee_id", userId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, status")
      .eq("owner_id", userId)
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase
      .from("project_sync_events")
      .select("*, project:projects(id, name)")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(8),
    supabase
      .from("time_records")
      .select("*")
      .eq("user_id", userId)
      .gte("work_date", monthStart)
      .lte("work_date", today),
  ]);

  const timeRecords = (timeRes.data ?? []) as TimeRecord[];
  const todayRecord = timeRecords.find((r) => r.work_date === today);
  const todayMinutes = todayRecord?.worked_minutes ?? 0;

  // Saldo simples do mês considerando 480 min (8h) por dia útil registrado
  const monthBalanceMinutes = timeRecords.reduce((acc, rec) => {
    if (rec.is_holiday || rec.is_day_off) {
      return acc + rec.worked_minutes;
    }
    return acc + (rec.worked_minutes - 480);
  }, 0);

  let adminOverview: DashboardData["adminOverview"];

  if (isAdmin && organizationId) {
    const [
      employeesRes,
      teamTasksRes,
      teamActivitiesRes,
      activeProjectsRes,
      integrationsRes,
      reportsRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, job_title, role")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "*, project:projects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name)"
        )
        .eq("organization_id", organizationId)
        .eq("is_private", false)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from("project_sync_events")
        .select("*, project:projects(id, name)")
        .eq("organization_id", organizationId)
        .order("occurred_at", { ascending: false })
        .limit(10),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .eq("is_private", false),
      supabase
        .from("integrations")
        .select("id, provider, status, last_sync_at, last_error")
        .eq("organization_id", organizationId),
      supabase
        .from("generated_reports")
        .select("id, report_type, period_start, period_end, created_at, user_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    adminOverview = {
      employees: (employeesRes.data ?? []) as Pick<
        Profile,
        "id" | "full_name" | "job_title" | "role"
      >[],
      teamTasks: (teamTasksRes.data ?? []) as TaskWithProject[],
      teamActivities: (teamActivitiesRes.data ?? []) as ProjectSyncEvent[],
      activeProjectsCount: activeProjectsRes.count ?? 0,
      integrations: (integrationsRes.data ?? []) as IntegrationSummary[],
      recentReports: (reportsRes.data ?? []) as ReportSummary[],
    };
  }

  return {
    tasks: (tasksRes.data ?? []) as TaskWithProject[],
    projects: (projectsRes.data ?? []) as Pick<
      Project,
      "id" | "name" | "status"
    >[],
    recentActivities: (activitiesRes.data ?? []) as ProjectSyncEvent[],
    todayMinutes,
    monthBalanceMinutes,
    adminOverview,
  };
}
