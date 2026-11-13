import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { testNotionDatabase } from "@/services/notion";

const saveNotionSchema = z.object({
  database_id: z.string().trim().min(10, "Database ID inválido").max(128),
});

export async function GET() {
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
    .select("id, status, config, last_sync_at, last_error")
    .eq("organization_id", profile.organization_id)
    .eq("provider", "notion")
    .maybeSingle();

  return NextResponse.json({
    hasApiKey: Boolean(process.env.NOTION_API_KEY),
    integration: integration ?? null,
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "NOTION_API_KEY não configurada no servidor (.env.local / Vercel)." },
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

  const body = await request.json().catch(() => null);
  const parsed = saveNotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Database ID inválido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  const cleanDbId = parsed.data.database_id.replace(/-/g, "");

  try {
    const dbInfo = await testNotionDatabase(apiKey, cleanDbId);

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("provider", "notion")
      .maybeSingle();

    const payload = {
      organization_id: profile.organization_id,
      user_id: user.id,
      provider: "notion" as const,
      status: "connected" as const,
      config: { database_id: cleanDbId, database_title: dbInfo.title },
      last_error: null,
    };

    const { data, error } = existing
      ? await supabase
          .from("integrations")
          .update(payload)
          .eq("id", existing.id)
          .select("id, status, config, last_sync_at, last_error")
          .single()
      : await supabase
          .from("integrations")
          .insert(payload)
          .select("id, status, config, last_sync_at, last_error")
          .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ integration: data });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Falha ao validar database do Notion.",
      },
      { status: 400 }
    );
  }
}
