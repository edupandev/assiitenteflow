import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório").max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  is_private: z.boolean().default(false),
  assignee_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
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

  const scope = request.nextUrl.searchParams.get("scope") ?? "mine";

  let query = supabase
    .from("tasks")
    .select(
      "*, project:projects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name)"
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (scope !== "team") {
    query = query.eq("assignee_id", user.id);
  } else {
    query = query.eq("is_private", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tasks: data ?? [] });
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
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return NextResponse.json(
      { error: "Perfil ou organização não encontrados." },
      { status: 400 }
    );
  }

  const targetAssignee =
    profile.role === "admin" && parsed.data.assignee_id
      ? parsed.data.assignee_id
      : user.id;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: profile.organization_id,
      project_id: parsed.data.project_id ?? null,
      assignee_id: targetAssignee,
      created_by: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority,
      status: parsed.data.status,
      due_date: parsed.data.due_date ?? null,
      origin: "system",
      is_private: parsed.data.is_private,
      completed_at:
        parsed.data.status === "done" ? new Date().toISOString() : null,
    })
    .select(
      "*, project:projects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ task: data }, { status: 201 });
}
