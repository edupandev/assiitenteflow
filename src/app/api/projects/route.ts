import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  is_private: z.boolean().default(false),
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "projeto";
}

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: "Supabase não configurado." },
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

  const { data, error } = await supabase
    .from("projects")
    .select(
      "*, sources:project_sources(*), summary:project_summaries(readme_excerpt, persistent_summary, updated_at)"
    )
    .eq("owner_id", user.id)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: "Supabase não configurado." },
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
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json(
      { error: "Organização não encontrada para o usuário." },
      { status: 400 }
    );
  }

  const slug = toSlug(parsed.data.name);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: profile.organization_id,
      owner_id: user.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      canonical_origin: `manual:${slug}`,
      status: parsed.data.status,
      is_private: parsed.data.is_private,
      last_activity_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
