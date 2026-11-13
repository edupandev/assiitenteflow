import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TasksClient } from "@/modules/tasks/tasks-client";
import type { Project, TaskWithProject } from "@/types/database";

export default async function TarefasPage() {
  const { userId, profile } = await requireUserContext();
  const supabase = await createClient();

  const [tasksRes, projectsRes, notionRes, syncEventsRes] = await Promise.all([
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
      .select("id, name")
      .eq("owner_id", userId)
      .order("name", { ascending: true }),
    profile.organization_id
      ? supabase
          .from("integrations")
          .select("config, last_sync_at, last_error")
          .eq("organization_id", profile.organization_id)
          .eq("provider", "notion")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profile.organization_id
      ? supabase
          .from("task_sync_events")
          .select("id, direction, status, details, created_at")
          .eq("organization_id", profile.organization_id)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  const notionCfg = (notionRes.data?.config ?? {}) as {
    database_id?: string;
    database_title?: string;
  };

  return (
    <TasksClient
      initialTasks={(tasksRes.data ?? []) as TaskWithProject[]}
      projects={(projectsRes.data ?? []) as Pick<Project, "id" | "name">[]}
      notionConfig={{
        hasApiKey: Boolean(process.env.NOTION_API_KEY),
        databaseId: notionCfg.database_id ?? null,
        databaseTitle: notionCfg.database_title ?? null,
        lastSyncAt: notionRes.data?.last_sync_at ?? null,
        lastError: notionRes.data?.last_error ?? null,
      }}
      syncEvents={(syncEventsRes.data ?? []) as {
        id: string;
        direction: string;
        status: string;
        details: Record<string, unknown>;
        created_at: string;
      }[]}
    />
  );
}
