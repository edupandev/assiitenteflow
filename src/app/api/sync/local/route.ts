import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";

const commitSchema = z.object({
  sha: z.string().min(4).max(64),
  message: z.string().min(1).max(500),
  author: z.string().max(120).optional(),
  date: z.string().optional(),
});

const syncedProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  localPath: z.string().trim().min(1).max(500),
  canonicalOrigin: z.string().trim().max(300).optional(),
  branch: z.string().trim().max(120).nullable().optional(),
  lastCommitSha: z.string().trim().max(64).nullable().optional(),
  readmeExcerpt: z.string().max(4000).nullable().optional(),
  readmeHash: z.string().max(128).nullable().optional(),
  recentCommits: z.array(commitSchema).max(15).default([]),
  changedFiles: z.array(z.string().max(300)).max(50).default([]),
});

const localSyncPayloadSchema = z.object({
  watchedPath: z.string().max(500).optional(),
  projects: z.array(syncedProjectSchema).max(100),
});

export async function POST(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor para autenticação de dispositivos.",
      },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token.startsWith("pw_sync_")) {
    return NextResponse.json(
      { error: "Token de dispositivo inválido ou ausente." },
      { status: 401 }
    );
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: device, error: deviceError } = await admin
    .from("sync_devices")
    .select("id, organization_id, user_id, is_active")
    .eq("token_hash", tokenHash)
    .single();

  if (deviceError || !device || !device.is_active) {
    return NextResponse.json(
      { error: "Dispositivo não autorizado ou inativo." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = localSyncPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  let projectsSynced = 0;
  let eventsCreated = 0;

  for (const item of parsed.data.projects) {
    const canonicalOrigin =
      item.canonicalOrigin?.trim() || `local:${item.slug}`;

    // Localiza projeto existente por canonical_origin ou slug do usuário
    const { data: existingProject } = await admin
      .from("projects")
      .select("id")
      .eq("organization_id", device.organization_id)
      .eq("owner_id", device.user_id)
      .or(`canonical_origin.eq.${canonicalOrigin},slug.eq.${item.slug}`)
      .limit(1)
      .maybeSingle();

    let projectId = existingProject?.id;

    if (!projectId) {
      const { data: created, error: createErr } = await admin
        .from("projects")
        .insert({
          organization_id: device.organization_id,
          owner_id: device.user_id,
          name: item.name,
          slug: item.slug,
          canonical_origin: canonicalOrigin,
          status: "active",
          last_activity_at: nowIso,
        })
        .select("id")
        .single();

      if (createErr || !created) continue;
      projectId = created.id;

      await admin.from("project_sync_events").insert({
        organization_id: device.organization_id,
        project_id: projectId,
        user_id: device.user_id,
        event_type: "project_detected",
        summary: `Projeto local "${item.name}" detectado pelo sincronizador.`,
        occurred_at: nowIso,
      });
      eventsCreated++;
    } else {
      await admin
        .from("projects")
        .update({ last_activity_at: nowIso })
        .eq("id", projectId);
    }

    // Upsert da origem local
    const { data: existingSource } = await admin
      .from("project_sources")
      .select("id, readme_hash, last_commit_sha")
      .eq("project_id", projectId)
      .eq("kind", "local")
      .eq("external_identifier", item.localPath)
      .maybeSingle();

    let sourceId = existingSource?.id;

    if (!sourceId) {
      const { data: insertedSource } = await admin
        .from("project_sources")
        .insert({
          organization_id: device.organization_id,
          project_id: projectId,
          user_id: device.user_id,
          kind: "local",
          external_identifier: item.localPath,
          default_branch: item.branch ?? "main",
          last_commit_sha: item.lastCommitSha ?? null,
          readme_hash: item.readmeHash ?? null,
          last_synced_at: nowIso,
          metadata: { changedFilesCount: item.changedFiles.length },
        })
        .select("id")
        .single();
      sourceId = insertedSource?.id;
    } else {
      await admin
        .from("project_sources")
        .update({
          default_branch: item.branch ?? "main",
          last_commit_sha: item.lastCommitSha ?? existingSource?.last_commit_sha ?? null,
          readme_hash: item.readmeHash ?? existingSource?.readme_hash ?? null,
          last_synced_at: nowIso,
          metadata: { changedFilesCount: item.changedFiles.length },
        })
        .eq("id", sourceId);
    }

    // Registra alteração de README se o hash mudou
    if (
      item.readmeHash &&
      existingSource?.readme_hash !== item.readmeHash &&
      item.readmeExcerpt
    ) {
      const { data: dupReadme } = await admin
        .from("project_sync_events")
        .select("id")
        .eq("project_id", projectId)
        .eq("event_type", "readme_update")
        .eq("content_hash", item.readmeHash)
        .maybeSingle();

      if (!dupReadme) {
        await admin.from("project_sync_events").insert({
          organization_id: device.organization_id,
          project_id: projectId,
          source_id: sourceId ?? null,
          user_id: device.user_id,
          event_type: "readme_update",
          content_hash: item.readmeHash,
          summary: `README.md atualizado em ${item.name}.`,
          occurred_at: nowIso,
        });
        eventsCreated++;
      }

      // Atualiza cache persistente de resumo para economia de tokens
      const contextHash = createHash("sha256")
        .update(`${item.readmeHash}:${item.lastCommitSha ?? ""}`)
        .digest("hex");

      const firstParagraph = item.readmeExcerpt
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("#"))
        .slice(0, 3)
        .join(" ")
        .slice(0, 400);

      await admin.from("project_summaries").upsert(
        {
          organization_id: device.organization_id,
          project_id: projectId,
          readme_excerpt: item.readmeExcerpt,
          persistent_summary:
            firstParagraph || `Projeto ${item.name} sincronizado localmente.`,
          context_hash: contextHash,
          token_estimate: Math.ceil(item.readmeExcerpt.length / 4),
        },
        { onConflict: "project_id" }
      );
    }

    // Registra commits novos sem duplicar SHAs já processados
    for (const commit of item.recentCommits) {
      const { data: existingCommit } = await admin
        .from("project_sync_events")
        .select("id")
        .eq("project_id", projectId)
        .eq("commit_sha", commit.sha)
        .maybeSingle();

      if (!existingCommit) {
        await admin.from("project_sync_events").insert({
          organization_id: device.organization_id,
          project_id: projectId,
          source_id: sourceId ?? null,
          user_id: device.user_id,
          event_type: "commit",
          commit_sha: commit.sha,
          branch: item.branch ?? null,
          summary: commit.message,
          payload: { author: commit.author ?? null },
          occurred_at: commit.date ? new Date(commit.date).toISOString() : nowIso,
        });
        eventsCreated++;
      }
    }

    // Registra alterações locais pendentes (working tree) se houver arquivos modificados
    if (item.changedFiles.length > 0) {
      const filesHash = createHash("sha256")
        .update(item.changedFiles.slice().sort().join("|"))
        .digest("hex");

      const { data: dupFiles } = await admin
        .from("project_sync_events")
        .select("id")
        .eq("project_id", projectId)
        .eq("event_type", "file_change")
        .eq("content_hash", filesHash)
        .maybeSingle();

      if (!dupFiles) {
        await admin.from("project_sync_events").insert({
          organization_id: device.organization_id,
          project_id: projectId,
          source_id: sourceId ?? null,
          user_id: device.user_id,
          event_type: "file_change",
          branch: item.branch ?? null,
          content_hash: filesHash,
          summary: `${item.changedFiles.length} arquivo(s) modificado(s) localmente.`,
          payload: { files: item.changedFiles.slice(0, 20) },
          occurred_at: nowIso,
        });
        eventsCreated++;
      }
    }

    projectsSynced++;
  }

  await admin
    .from("sync_devices")
    .update({
      last_seen_at: nowIso,
      watched_path: parsed.data.watchedPath ?? undefined,
    })
    .eq("id", device.id);

  return NextResponse.json({
    ok: true,
    projectsSynced,
    eventsCreated,
    syncedAt: nowIso,
  });
}
