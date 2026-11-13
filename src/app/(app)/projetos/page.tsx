import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ProjectsClient,
  type ProjectItem,
  type SyncDeviceItem,
} from "@/modules/projects/projects-client";
import type { ProjectSyncEvent } from "@/types/database";

export default async function ProjetosPage() {
  const { userId } = await requireUserContext();
  const supabase = await createClient();

  const [projectsRes, eventsRes, devicesRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "*, sources:project_sources(id, kind, external_identifier, default_branch, last_commit_sha, last_synced_at), summary:project_summaries(readme_excerpt, persistent_summary, updated_at)"
      )
      .eq("owner_id", userId)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("project_sync_events")
      .select("*, project:projects(id, name)")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(15),
    supabase
      .from("sync_devices")
      .select("id, device_name, watched_path, is_active, last_seen_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ProjectsClient
      initialProjects={(projectsRes.data ?? []) as ProjectItem[]}
      initialEvents={(eventsRes.data ?? []) as ProjectSyncEvent[]}
      initialDevices={(devicesRes.data ?? []) as SyncDeviceItem[]}
    />
  );
}
