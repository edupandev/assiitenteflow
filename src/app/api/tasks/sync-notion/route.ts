import { NextResponse } from "next/server";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { fetchNotionDatabaseTasks } from "@/services/notion";

export async function POST() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "NOTION_API_KEY não configurada no servidor." },
      { status: 503 }
    );
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

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, config")
    .eq("organization_id", profile.organization_id)
    .eq("provider", "notion")
    .maybeSingle();

  const databaseId = (integration?.config as { database_id?: string } | null)
    ?.database_id;

  if (!databaseId) {
    return NextResponse.json(
      { error: "Configure primeiro o Database ID do Notion." },
      { status: 400 }
    );
  }

  try {
    const notionTasks = await fetchNotionDatabaseTasks(apiKey, databaseId);

    let created = 0;
    let updated = 0;
    let conflicts = 0;

    for (const remote of notionTasks) {
      const { data: existing } = await supabase
        .from("tasks")
        .select("id, sync_hash, updated_at")
        .eq("organization_id", profile.organization_id)
        .eq("origin", "notion")
        .eq("external_id", remote.externalId)
        .maybeSingle();

      if (!existing) {
        const { data: inserted } = await supabase
          .from("tasks")
          .insert({
            organization_id: profile.organization_id,
            assignee_id: user.id,
            created_by: user.id,
            title: remote.title,
            description: remote.description,
            priority: remote.priority,
            status: remote.status,
            due_date: remote.dueDate,
            origin: "notion",
            external_id: remote.externalId,
            external_url: remote.externalUrl,
            sync_hash: remote.syncHash,
            completed_at:
              remote.status === "done" ? new Date().toISOString() : null,
          })
          .select("id")
          .single();

        if (inserted) {
          created++;
          await supabase.from("task_sync_events").insert({
            organization_id: profile.organization_id,
            task_id: inserted.id,
            direction: "inbound",
            status: "success",
            details: { action: "created_from_notion" },
          });
        }
      } else if (existing.sync_hash !== remote.syncHash) {
        // Detecta possível conflito caso a tarefa tenha sido editada localmente após o último sync
        const localEditedRecently =
          new Date(existing.updated_at).getTime() >
          new Date(remote.lastEditedTime).getTime();

        if (localEditedRecently) {
          conflicts++;
          await supabase.from("task_sync_events").insert({
            organization_id: profile.organization_id,
            task_id: existing.id,
            direction: "conflict",
            status: "resolved",
            details: {
              reason: "Edição local mais recente mantida durante sync com Notion",
              remote_title: remote.title,
            },
          });
        } else {
          await supabase
            .from("tasks")
            .update({
              title: remote.title,
              description: remote.description,
              priority: remote.priority,
              status: remote.status,
              due_date: remote.dueDate,
              external_url: remote.externalUrl,
              sync_hash: remote.syncHash,
              completed_at:
                remote.status === "done" ? new Date().toISOString() : null,
            })
            .eq("id", existing.id);

          updated++;
          await supabase.from("task_sync_events").insert({
            organization_id: profile.organization_id,
            task_id: existing.id,
            direction: "inbound",
            status: "success",
            details: { action: "updated_from_notion" },
          });
        }
      }
    }

    const nowIso = new Date().toISOString();
    if (integration?.id) {
      await supabase
        .from("integrations")
        .update({ last_sync_at: nowIso, last_error: null, status: "connected" })
        .eq("id", integration.id);
    }

    return NextResponse.json({
      ok: true,
      totalFetched: notionTasks.length,
      created,
      updated,
      conflicts,
      syncedAt: nowIso,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao sincronizar com Notion.";
    if (integration?.id) {
      await supabase
        .from("integrations")
        .update({ status: "error", last_error: message })
        .eq("id", integration.id);
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
